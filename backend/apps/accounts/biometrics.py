"""
Biometric sign-in and withdrawal approval, built on WebAuthn (passkeys).

WHY WEBAUTHN AND NOT "FACE MATCHING" IN THE BROWSER
---------------------------------------------------
A web page that compares camera frames to a stored face photo can be fooled by
holding up a picture, and whatever the page decides can be faked by editing
the JavaScript. WebAuthn hands the check to the device's own biometric system
(Windows Hello face/fingerprint, Face ID, Touch ID, Android fingerprint), which
has liveness and anti-spoofing hardware. On a match the device signs our
random challenge with a private key that never leaves its secure chip; we
verify the signature with the public key saved at enrolment. No face image or
fingerprint template ever reaches DigiBank.

FLOWS
-----
  Enrol a device   POST register/options/ -> browser prompt -> POST register/verify/
  Sign in          POST login/options/    -> browser prompt -> POST login/verify/    -> session
  Approve money    POST approve/options/  -> browser prompt -> POST approve/verify/  -> biometric_token

A biometric_token is single-use, expires in two minutes, and is required by
every withdrawal endpoint while the user has "require biometric" switched on.
"""
import hashlib
import json
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (
    AuthenticatorAttachment,
    AuthenticatorSelectionCriteria,
    AuthenticatorTransport,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from apps.audit.models import AuditAction, AuditLog
from .models import BiometricApproval, BiometricChallenge, BiometricCredential, User

CHALLENGE_TTL = timedelta(minutes=5)
APPROVAL_TTL = timedelta(minutes=2)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    return xff.split(",")[0].strip() if xff else request.META.get("REMOTE_ADDR")


def _descriptor(cred):
    transports = []
    for t in cred.transports or []:
        try:
            transports.append(AuthenticatorTransport(t))
        except ValueError:
            pass  # a transport newer than this library knows about
    return PublicKeyCredentialDescriptor(id=base64url_to_bytes(cred.credential_id), transports=transports)


def _new_challenge(user, purpose):
    raw = secrets.token_bytes(32)
    row = BiometricChallenge.objects.create(
        user=user,
        purpose=purpose,
        challenge=bytes_to_base64url(raw),
        expires_at=timezone.now() + CHALLENGE_TTL,
    )
    return row, raw


def _redeem_challenge(challenge_id, purpose, user=None):
    """Mark a challenge used and return its bytes, or None if it is not redeemable."""
    try:
        challenge_id = int(challenge_id)
    except (TypeError, ValueError):
        return None
    with transaction.atomic():
        row = (
            BiometricChallenge.objects.select_for_update()
            .filter(pk=challenge_id, purpose=purpose, used_at__isnull=True, expires_at__gt=timezone.now())
            .first()
        )
        if row is None or (user is not None and row.user_id != user.id):
            return None
        row.used_at = timezone.now()
        row.save(update_fields=["used_at"])
    return base64url_to_bytes(row.challenge)


def _options_response(row, options):
    return Response({"challenge_id": row.id, "options": json.loads(options_to_json(options))})


def _bad(detail, code="biometric_failed", http=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": detail, "code": code}, status=http)


def _verify_assertion(request, purpose, user=None):
    """
    Shared by sign-in and approval. Returns (credential_row, None) on success
    or (None, error_response).
    """
    challenge = _redeem_challenge(request.data.get("challenge_id"), purpose, user)
    if challenge is None:
        return None, _bad("This biometric request expired. Please try again.", "challenge_expired")

    credential = request.data.get("credential") or {}
    cred_id = credential.get("id") or credential.get("rawId")
    query = BiometricCredential.objects.select_related("user").filter(credential_id=cred_id)
    if user is not None:
        query = query.filter(user=user)
    cred = query.first()
    if cred is None:
        return None, _bad("This device is not registered for biometric sign-in.", "unknown_credential")

    try:
        verified = verify_authentication_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=settings.WEBAUTHN_RP_ID,
            expected_origin=settings.WEBAUTHN_ORIGINS,
            credential_public_key=bytes(cred.public_key),
            credential_current_sign_count=cred.sign_count,
            # The whole point: the device must have actually checked the face
            # or fingerprint (or device PIN), not just that someone tapped.
            require_user_verification=True,
        )
    except Exception as exc:  # noqa: BLE001 - library raises several types
        AuditLog.record(
            AuditAction.BIOMETRIC_FAILED, actor=cred.user, entity=cred,
            metadata={"purpose": purpose, "reason": str(exc)[:200]}, ip=_ip(request),
        )
        return None, _bad("Biometric check failed. Please try again.")

    cred.sign_count = verified.new_sign_count
    cred.last_used_at = timezone.now()
    cred.save(update_fields=["sign_count", "last_used_at"])
    AuditLog.record(
        AuditAction.BIOMETRIC_VERIFIED, actor=cred.user, entity=cred,
        metadata={"purpose": purpose, "device": cred.device_name}, ip=_ip(request),
    )
    return cred, None


def _hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def biometric_gate(request):
    """
    Call at the top of every withdrawal view. Returns None when the request may
    proceed, or a 403 Response when a biometric approval is required and the
    request did not carry a valid, unspent one.
    """
    user = request.user
    if not getattr(user, "require_biometric_for_withdrawals", False):
        return None

    token = request.data.get("biometric_token") or request.headers.get("X-Biometric-Token")
    if not token:
        return _bad(
            "Confirm with your face or fingerprint to withdraw.",
            "biometric_required",
            status.HTTP_403_FORBIDDEN,
        )
    spent = BiometricApproval.objects.filter(
        user=user, token_hash=_hash(token), used_at__isnull=True, expires_at__gt=timezone.now()
    ).update(used_at=timezone.now())
    if spent != 1:
        return _bad(
            "That biometric approval has expired or was already used. Please scan again.",
            "biometric_required",
            status.HTTP_403_FORBIDDEN,
        )
    return None


def _serialize(cred):
    return {
        "id": cred.id,
        "device_name": cred.device_name,
        "backed_up": cred.backed_up,
        "created_at": cred.created_at,
        "last_used_at": cred.last_used_at,
    }


# ---------------------------------------------------------------------------
# Enrolment
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def register_options(request):
    user = request.user
    row, raw = _new_challenge(user, BiometricChallenge.Purpose.REGISTER)
    options = generate_registration_options(
        rp_id=settings.WEBAUTHN_RP_ID,
        rp_name=settings.WEBAUTHN_RP_NAME,
        user_id=f"digibank-user-{user.pk}".encode(),
        user_name=user.email,
        user_display_name=user.name,
        challenge=raw,
        timeout=120_000,
        authenticator_selection=AuthenticatorSelectionCriteria(
            # PLATFORM = the sensor built into this phone/laptop, not a USB key.
            authenticator_attachment=AuthenticatorAttachment.PLATFORM,
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        exclude_credentials=[_descriptor(c) for c in user.biometric_credentials.all()],
    )
    return _options_response(row, options)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def register_verify(request):
    user = request.user
    challenge = _redeem_challenge(request.data.get("challenge_id"), BiometricChallenge.Purpose.REGISTER, user)
    if challenge is None:
        return _bad("Setup took too long. Please try again.", "challenge_expired")

    credential = request.data.get("credential") or {}
    device_name = (request.data.get("device_name") or "This device").strip()[:80]
    try:
        verified = verify_registration_response(
            credential=credential,
            expected_challenge=challenge,
            expected_rp_id=settings.WEBAUTHN_RP_ID,
            expected_origin=settings.WEBAUTHN_ORIGINS,
            require_user_verification=True,
        )
    except Exception as exc:  # noqa: BLE001
        AuditLog.record(
            AuditAction.BIOMETRIC_FAILED, actor=user, metadata={"purpose": "REGISTER", "reason": str(exc)[:200]}, ip=_ip(request)
        )
        return _bad("We could not verify this device. Please try again.")

    cred_id = bytes_to_base64url(verified.credential_id)
    if BiometricCredential.objects.filter(credential_id=cred_id).exists():
        return _bad("This device is already registered.", "duplicate_credential")

    cred = BiometricCredential.objects.create(
        user=user,
        credential_id=cred_id,
        public_key=verified.credential_public_key,
        sign_count=verified.sign_count,
        transports=(credential.get("response") or {}).get("transports") or [],
        device_name=device_name,
        aaguid=str(verified.aaguid or ""),
        backed_up=bool(verified.credential_backed_up),
    )
    AuditLog.record(AuditAction.DEVICE_REGISTERED, actor=user, entity=cred, metadata={"device": device_name}, ip=_ip(request))
    return Response(_serialize(cred), status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Passwordless sign-in
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([AllowAny])
def login_options(request):
    """
    With an identifier: restrict the prompt to that account's devices.
    Without one: let the device offer whichever DigiBank passkey it holds.

    An unknown identifier gets the same-shaped answer as a known one, so this
    endpoint cannot be used to discover which emails are registered.
    """
    identifier = (request.data.get("identifier") or "").strip().lower()
    allow = []
    if identifier:
        user = User.objects.filter(Q(email__iexact=identifier) | Q(phone=identifier)).first()
        if user is not None:
            allow = [_descriptor(c) for c in user.biometric_credentials.all()]

    row, raw = _new_challenge(None, BiometricChallenge.Purpose.LOGIN)
    options = generate_authentication_options(
        rp_id=settings.WEBAUTHN_RP_ID,
        challenge=raw,
        timeout=120_000,
        allow_credentials=allow,
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    return _options_response(row, options)


@api_view(["POST"])
@permission_classes([AllowAny])
def login_verify(request):
    from .views import _session_response

    cred, error = _verify_assertion(request, BiometricChallenge.Purpose.LOGIN)
    if error:
        return error
    user = cred.user
    if not user.is_active or not user.is_verified:
        return _bad("This account cannot sign in yet.", "account_inactive", status.HTTP_403_FORBIDDEN)

    AuditLog.record(AuditAction.LOGIN_SUCCESS, actor=user, metadata={"method": "biometric", "device": cred.device_name}, ip=_ip(request))
    return _session_response(user)


# ---------------------------------------------------------------------------
# Approving a withdrawal
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def approve_options(request):
    creds = list(request.user.biometric_credentials.all())
    if not creds:
        return _bad("Set up face or fingerprint first.", "no_credentials")
    row, raw = _new_challenge(request.user, BiometricChallenge.Purpose.APPROVE)
    options = generate_authentication_options(
        rp_id=settings.WEBAUTHN_RP_ID,
        challenge=raw,
        timeout=120_000,
        allow_credentials=[_descriptor(c) for c in creds],
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    return _options_response(row, options)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def approve_verify(request):
    cred, error = _verify_assertion(request, BiometricChallenge.Purpose.APPROVE, request.user)
    if error:
        return error
    token = secrets.token_urlsafe(32)
    BiometricApproval.objects.create(
        user=request.user,
        token_hash=_hash(token),
        credential=cred,
        expires_at=timezone.now() + APPROVAL_TTL,
    )
    return Response({"biometric_token": token, "expires_in_seconds": int(APPROVAL_TTL.total_seconds())})


# ---------------------------------------------------------------------------
# Managing devices and the withdrawal requirement
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def credentials(request):
    return Response(
        {
            "require_biometric_for_withdrawals": request.user.require_biometric_for_withdrawals,
            "devices": [_serialize(c) for c in request.user.biometric_credentials.all()],
        }
    )


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_credential(request, credential_id):
    user = request.user
    cred = user.biometric_credentials.filter(pk=credential_id).first()
    if cred is None:
        return _bad("Device not found.", "not_found", status.HTTP_404_NOT_FOUND)

    # While withdrawals are biometric-protected, removing a device is itself
    # protected - otherwise a stolen session could just strip the protection.
    blocked = biometric_gate(request)
    if blocked:
        return blocked

    cred.delete()
    if not user.biometric_credentials.exists() and user.require_biometric_for_withdrawals:
        user.require_biometric_for_withdrawals = False
        user.save(update_fields=["require_biometric_for_withdrawals"])
    AuditLog.record(AuditAction.DEVICE_REVOKED, actor=user, metadata={"device": cred.device_name}, ip=_ip(request))
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def update_settings(request):
    user = request.user
    enable = bool(request.data.get("require_biometric_for_withdrawals"))

    if enable and not user.biometric_credentials.exists():
        return _bad("Set up face or fingerprint before turning this on.", "no_credentials")
    if not enable and user.require_biometric_for_withdrawals:
        # Turning protection OFF needs the same proof it protects.
        blocked = biometric_gate(request)
        if blocked:
            return blocked

    user.require_biometric_for_withdrawals = enable
    user.save(update_fields=["require_biometric_for_withdrawals"])
    return Response({"require_biometric_for_withdrawals": enable})
