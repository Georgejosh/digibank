"""
Issuing and checking one-time passcodes.

The OtpVerification model already enforces the hard rules (hashed storage,
expiry, attempt ceiling, single use). This module is the surrounding policy:
who may request a code, how often, and what happens to older codes.
"""
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from apps.notifications.delivery import send_otp
from .models import OtpPurpose, OtpVerification


class OtpError(Exception):
    """Something about the request was wrong; `message` is user-facing."""

    def __init__(self, message, code="otp_error"):
        super().__init__(message)
        self.message = message
        self.code = code


class OtpThrottled(OtpError):
    """Asked for a new code too soon."""

    def __init__(self, seconds_remaining):
        super().__init__(
            f"Please wait {seconds_remaining} seconds before asking for another code.",
            code="throttled",
        )
        self.seconds_remaining = seconds_remaining


def generate_code(length=None):
    """
    Cryptographically random numeric code.

    `secrets`, never `random`: random is a Mersenne Twister seeded predictably
    enough that an attacker who sees a few outputs can compute the rest. For
    anything guarding an account, that is disqualifying.
    """
    length = length or settings.OTP_LENGTH
    upper = 10**length
    return str(secrets.randbelow(upper)).zfill(length)


def issue_otp(user, purpose, *, enforce_cooldown=True):
    """
    Create, store and SEND a fresh code.

    Returns (otp_row, channel). The plaintext code is deliberately not returned:
    nothing above this line should ever be in a position to leak it into a
    response body or a log.
    """
    if purpose not in OtpPurpose.values:
        raise OtpError(f"Unknown OTP purpose: {purpose}")

    latest = (
        OtpVerification.objects.filter(user=user, purpose=purpose)
        .order_by("-created_at")
        .first()
    )

    if enforce_cooldown and latest and latest.consumed_at is None:
        elapsed = (timezone.now() - latest.created_at).total_seconds()
        cooldown = settings.OTP_RESEND_COOLDOWN_SECONDS
        if elapsed < cooldown:
            raise OtpThrottled(int(cooldown - elapsed))

    # Invalidate every outstanding code for this purpose before issuing a new
    # one. Without this, "resend" would leave several codes valid at once and
    # multiply an attacker's guessing surface for free.
    OtpVerification.objects.filter(
        user=user, purpose=purpose, consumed_at__isnull=True
    ).update(consumed_at=timezone.now())

    raw_code = generate_code()
    otp = OtpVerification.objects.create(
        user=user,
        purpose=purpose,
        otp_hash=OtpVerification.hash_code(raw_code),
        expires_at=timezone.now() + timedelta(minutes=settings.OTP_VALIDITY_MINUTES),
    )

    channel = send_otp(user, raw_code, purpose)
    # raw_code goes out of scope here and is never persisted in plaintext.
    return otp, channel


def verify_otp(user, purpose, code):
    """
    Check a submitted code. Returns the consumed OtpVerification row.

    Raises OtpError with a deliberately vague message on failure: distinguishing
    "wrong code" from "expired code" from "no code issued" tells an attacker
    which part of their guess to change.
    """
    otp = (
        OtpVerification.objects.filter(user=user, purpose=purpose, consumed_at__isnull=True)
        .order_by("-created_at")
        .first()
    )

    if otp is None:
        raise OtpError("That code is not valid. Request a new one.", code="no_pending_otp")

    if timezone.now() > otp.expires_at:
        raise OtpError("That code has expired. Request a new one.", code="expired")

    if otp.attempts >= settings.OTP_MAX_ATTEMPTS:
        raise OtpError(
            "Too many incorrect attempts. Request a new code.", code="too_many_attempts"
        )

    # model.verify() increments attempts and consumes the row on success.
    if not otp.verify(code):
        remaining = max(0, settings.OTP_MAX_ATTEMPTS - otp.attempts)
        if remaining == 0:
            raise OtpError(
                "Too many incorrect attempts. Request a new code.", code="too_many_attempts"
            )
        raise OtpError(
            f"That code is not correct. {remaining} attempt{'s' if remaining != 1 else ''} left.",
            code="invalid",
        )

    return otp
