"""
Authentication endpoints.

THE LOGIN FLOW IS TWO STEPS, EVERY TIME
---------------------------------------
    POST /api/auth/login/       password checked -> code sent -> NO token
    POST /api/auth/verify-otp/  code checked     -> access token + refresh cookie

There is no route that turns a password alone into a session. That is what
makes the second factor real rather than decorative: stealing a password is not
enough without the inbox or handset the code goes to.

Registration works the same way - the account is created but cannot log in
until its SIGNUP_VERIFICATION code is confirmed.
"""
from django.conf import settings
from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.emergency.models import OtpPurpose
from apps.emergency.otp import OtpError, OtpThrottled, issue_otp, verify_otp
from apps.notifications.delivery import OtpDeliveryError, mask_email, mask_phone
from .models import User
from .serializers import (
    ForgotPasswordSerializer,
    LoginSerializer,
    RegisterSerializer,
    ResendOtpSerializer,
    UserSerializer,
    VerifyOtpSerializer,
)


# ---------------------------------------------------------------------------
# Cookie helpers
# ---------------------------------------------------------------------------
def _set_refresh_cookie(response, refresh_token):
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        str(refresh_token),
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
        path=settings.REFRESH_COOKIE_PATH,
    )
    return response


def _clear_refresh_cookie(response):
    response.delete_cookie(
        settings.REFRESH_COOKIE_NAME,
        path=settings.REFRESH_COOKIE_PATH,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
    )
    return response


def _session_response(user, status_code=status.HTTP_200_OK):
    """Access token in the body, refresh token in an httpOnly cookie."""
    refresh = RefreshToken.for_user(user)
    response = Response(
        {"access_token": str(refresh.access_token), "user": UserSerializer(user).data},
        status=status_code,
    )
    return _set_refresh_cookie(response, refresh)


def _otp_challenge_response(user, purpose, channel, status_code=status.HTTP_200_OK):
    """
    Tells the client a code was sent and where to look - never what it is.

    `sent_to` is masked so a stolen password cannot also harvest the full email
    address or phone number of the account it belongs to.
    """
    return Response(
        {
            "otp_required": True,
            "purpose": purpose,
            "email": user.email,  # needed to address the verify call
            "sent_to": mask_phone(user.phone) if channel == "sms" else mask_email(user.email),
            "channel": channel,
            "expires_in_minutes": settings.OTP_VALIDITY_MINUTES,
            "resend_after_seconds": settings.OTP_RESEND_COOLDOWN_SECONDS,
        },
        status=status_code,
    )


def _otp_error_response(exc):
    if isinstance(exc, OtpThrottled):
        return Response(
            {"detail": exc.message, "code": exc.code, "retry_after": exc.seconds_remaining},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
    return Response({"detail": exc.message, "code": exc.code}, status=status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# Register -> OTP
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    with transaction.atomic():
        user = serializer.save()

    try:
        _otp, channel = issue_otp(user, OtpPurpose.SIGNUP_VERIFICATION)
    except OtpDeliveryError as exc:
        # The account exists but we could not reach them. Say so plainly rather
        # than pretending a code is on its way.
        return Response(
            {
                "detail": f"Account created, but the verification code could not be sent: {exc}",
                "email": user.email,
                "code": "delivery_failed",
            },
            status=status.HTTP_502_BAD_GATEWAY,
        )

    return _otp_challenge_response(
        user, OtpPurpose.SIGNUP_VERIFICATION, channel, status.HTTP_201_CREATED
    )


# ---------------------------------------------------------------------------
# Login step 1: password -> OTP
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.validated_data["user"]

    # An unverified account restarts verification instead of logging in, so a
    # half-finished signup is recoverable without support.
    purpose = (
        OtpPurpose.LOGIN if user.is_verified else OtpPurpose.SIGNUP_VERIFICATION
    )

    try:
        _otp, channel = issue_otp(user, purpose)
    except OtpThrottled as exc:
        return _otp_error_response(exc)
    except OtpDeliveryError as exc:
        return Response(
            {"detail": f"Could not send your login code: {exc}", "code": "delivery_failed"},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    return _otp_challenge_response(user, purpose, channel)


# ---------------------------------------------------------------------------
# Login step 2 / signup step 2: OTP -> session
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([AllowAny])
def verify_otp_view(request):
    serializer = VerifyOtpSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    user = User.objects.filter(email=data["email"]).first()
    if user is None:
        # Same vague answer as a wrong code: this must not confirm which
        # addresses are registered.
        return Response(
            {"detail": "That code is not valid. Request a new one."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        verify_otp(user, data["purpose"], data["code"])
    except OtpError as exc:
        return _otp_error_response(exc)

    if data["purpose"] == OtpPurpose.SIGNUP_VERIFICATION:
        if not user.is_verified:
            user.is_verified = True
            user.save(update_fields=["is_verified"])
        # Verifying the signup does NOT hand out a session: the user still has
        # to log in, and that login will require its own fresh code.
        return Response(
            {"verified": True, "purpose": data["purpose"], "detail": "Account verified. Please log in."}
        )

    if not user.is_verified:
        return Response(
            {"detail": "Verify your account before logging in."},
            status=status.HTTP_403_FORBIDDEN,
        )

    return _session_response(user)


@api_view(["POST"])
@permission_classes([AllowAny])
def resend_otp(request):
    serializer = ResendOtpSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    user = User.objects.filter(email=data["email"]).first()
    if user is None:
        # Pretend it worked. Do not confirm the address exists.
        return Response({"detail": "If that account exists, a new code is on its way."})

    try:
        _otp, channel = issue_otp(user, data["purpose"])
    except OtpThrottled as exc:
        return _otp_error_response(exc)
    except OtpDeliveryError as exc:
        return Response(
            {"detail": f"Could not send the code: {exc}", "code": "delivery_failed"},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    return _otp_challenge_response(user, data["purpose"], channel)


# ---------------------------------------------------------------------------
# Session lifecycle
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([AllowAny])
def refresh(request):
    """
    Mint a new access token from the httpOnly refresh cookie.

    The token is read from the COOKIE, never the body: that is what lets the
    frontend keep nothing in JavaScript-reachable storage.
    """
    raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
    if not raw:
        return Response({"detail": "No session."}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        token = RefreshToken(raw)
        user = User.objects.get(pk=token["user_id"])
    except (TokenError, KeyError, User.DoesNotExist):
        return _clear_refresh_cookie(
            Response({"detail": "Session expired."}, status=status.HTTP_401_UNAUTHORIZED)
        )

    if not user.is_active:
        return _clear_refresh_cookie(
            Response({"detail": "Account disabled."}, status=status.HTTP_401_UNAUTHORIZED)
        )

    response = Response({"access_token": str(token.access_token), "user": UserSerializer(user).data})

    # ROTATE_REFRESH_TOKENS is on, so hand back a fresh refresh cookie too.
    if settings.SIMPLE_JWT.get("ROTATE_REFRESH_TOKENS"):
        new_refresh = RefreshToken.for_user(user)
        _set_refresh_cookie(response, new_refresh)

    return response


@api_view(["POST"])
@permission_classes([AllowAny])
def logout(request):
    return _clear_refresh_cookie(Response({"detail": "Signed out."}))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(UserSerializer(request.user).data)


@api_view(["POST"])
@permission_classes([AllowAny])
def forgot_password(request):
    serializer = ForgotPasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data["email"]

    user = User.objects.filter(email=email).first()
    if user is not None:
        try:
            issue_otp(user, OtpPurpose.PASSWORD_RESET)
        except (OtpError, OtpDeliveryError):
            # Swallowed on purpose: a different response for a failed send
            # would still reveal that the address is registered.
            pass

    # Identical answer either way.
    return Response({"detail": f"If an account exists for {email}, a reset code is on its way."})
