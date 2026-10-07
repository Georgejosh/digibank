"""
Outbound delivery of one-time passcodes.

WHY THIS LIVES ON THE SERVER
----------------------------
Sending an email or an SMS needs provider credentials. If the React app did the
sending, those credentials would ship inside the JavaScript bundle where anyone
can open devtools and read them, then send messages on your account at your
cost. So the browser only ever asks "please send a code to this user"; the
secret and the actual send stay here.

THE CODE IS NEVER RETURNED TO THE CLIENT
----------------------------------------
No function here hands the plaintext code back to a view for inclusion in a
response. An OTP that travels in the same response that triggered it proves
nothing: whoever called the endpoint already has it, which defeats the entire
point of a second factor.
"""
import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


class OtpDeliveryError(Exception):
    """Raised when a code could not be handed to the provider."""


# Human-readable context per purpose, so the message says WHY a code arrived.
# A code with no reason attached is exactly what a phishing message looks like.
PURPOSE_TEXT = {
    "SIGNUP_VERIFICATION": "verify your new DigiBank account",
    "LOGIN": "log in to DigiBank",
    "EMERGENCY_APPROVAL": "approve an emergency withdrawal from your club",
    "WITHDRAWAL": "authorise a withdrawal",
    "DEVICE_REGISTRATION": "register a new device",
    "PASSWORD_RESET": "reset your DigiBank password",
}


def _subject(purpose):
    return {
        "SIGNUP_VERIFICATION": "Verify your DigiBank account",
        "LOGIN": "Your DigiBank login code",
        "PASSWORD_RESET": "Reset your DigiBank password",
    }.get(purpose, "Your DigiBank verification code")


def _body(user, code, purpose):
    reason = PURPOSE_TEXT.get(purpose, "continue in DigiBank")
    minutes = settings.OTP_VALIDITY_MINUTES
    return (
        f"Hi {user.name},\n\n"
        f"Your DigiBank code is: {code}\n\n"
        f"Use it to {reason}. It expires in {minutes} minutes and can only be "
        f"used once.\n\n"
        f"If you did not request this, someone may know your password. Change "
        f"it and do not share this code with anyone - DigiBank staff will "
        f"never ask you for it.\n\n"
        f"- DigiBank"
    )


def _deliver_console(user, code, purpose):
    """Development fallback: print the code where the developer can see it."""
    banner = (
        "\n"
        + "=" * 62
        + f"\n  DigiBank OTP  |  {purpose}"
        + f"\n  to    : {user.email}  /  {user.phone}"
        + f"\n  CODE  : {code}"
        + f"\n  expires in {settings.OTP_VALIDITY_MINUTES} minutes"
        + "\n"
        + "=" * 62
        + "\n"
    )
    # print() rather than logger: this must be impossible to miss in the
    # runserver terminal, which is the whole reason the console channel exists.
    print(banner, flush=True)
    return "console"


def _deliver_email(user, code, purpose):
    if not settings.EMAIL_HOST_PASSWORD:
        raise OtpDeliveryError("Email delivery requires a Resend API key in EMAIL_HOST_PASSWORD.")
    try:
        import urllib.request
        import json
        url = "https://api.resend.com/emails"
        headers = {
            "Authorization": f"Bearer {settings.EMAIL_HOST_PASSWORD}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        }
        data = json.dumps({
            "from": "DigiBank <onboarding@resend.dev>",
            "to": [user.email],
            "subject": _subject(purpose),
            "html": f"<p>Hi {user.name},</p><p>Your DigiBank code is: <strong>{code}</strong></p><p>Use it to {PURPOSE_TEXT.get(purpose, 'continue')}. It expires in {settings.OTP_VALIDITY_MINUTES} minutes and can only be used once.</p>"
        }).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers)
        with urllib.request.urlopen(req) as response:
            pass
    except Exception as exc:  # noqa: BLE001
        err_msg = str(exc)
        if hasattr(exc, "read"):
            try:
                err_msg += f" - {exc.read().decode('utf-8')}"
            except Exception:
                pass
        raise OtpDeliveryError(f"Email provider rejected the message: {err_msg}") from exc
    return "email"


def _deliver_sms(user, code, purpose):
    """
    Real SMS through a Twilio-compatible provider.

    Requires SMS_PROVIDER, SMS_ACCOUNT_SID, SMS_AUTH_TOKEN and SMS_FROM_NUMBER
    in .env, plus `pip install twilio`. Left as an explicit failure rather than
    a silent no-op so a misconfigured deployment cannot appear to be sending
    codes that never arrive.
    """
    if settings.SMS_PROVIDER != "twilio":
        raise OtpDeliveryError(
            "SMS delivery requires SMS_PROVIDER=twilio and provider credentials in .env."
        )
    if not (settings.SMS_ACCOUNT_SID and settings.SMS_AUTH_TOKEN and settings.SMS_FROM_NUMBER):
        raise OtpDeliveryError("Twilio credentials are incomplete in .env.")

    try:
        from twilio.rest import Client  # imported lazily: optional dependency
    except ImportError as exc:
        raise OtpDeliveryError("The twilio package is not installed (pip install twilio).") from exc

    phone = user.phone if user.phone.startswith("+") else f"+91{user.phone[-10:]}"
    try:
        Client(settings.SMS_ACCOUNT_SID, settings.SMS_AUTH_TOKEN).messages.create(
            body=f"{code} is your DigiBank code to {PURPOSE_TEXT.get(purpose, 'continue')}. "
            f"Valid {settings.OTP_VALIDITY_MINUTES} min. Do not share it.",
            from_=settings.SMS_FROM_NUMBER,
            to=phone,
        )
    except Exception as exc:  # noqa: BLE001
        raise OtpDeliveryError(f"SMS provider rejected the message: {exc}") from exc
    return "sms"


def send_otp(user, code, purpose):
    """
    Deliver `code` to `user` over the configured channel.

    Returns the channel actually used, so the API can tell the person where to
    look ("we sent a code to a...a@example.com") without revealing the code.

    "auto" prefers real email when SMTP is configured and falls back to the
    console otherwise, so a fresh clone works with no credentials at all and
    starts sending for real the moment EMAIL_HOST_USER is filled in.
    """
    channel = settings.OTP_DELIVERY_CHANNEL

    if channel == "auto":
        channel = "email" if settings.EMAIL_HOST_USER else "console"

    if channel == "console":
        return _deliver_console(user, code, purpose)
    if channel == "email":
        try:
            return _deliver_email(user, code, purpose)
        except OtpDeliveryError as exc:
            logger.warning("Email delivery failed (%s). Falling back to console.", exc)
            _deliver_console(user, code, purpose)
            return "console"
    if channel == "sms":
        return _deliver_sms(user, code, purpose)

    raise OtpDeliveryError(f"Unknown OTP_DELIVERY_CHANNEL: {channel!r}")


def mask_email(email):
    """a...a@example.com - enough to recognise, not enough to harvest."""
    if not email or "@" not in email:
        return ""
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        return f"{local[0]}***@{domain}"
    return f"{local[0]}{'*' * 3}{local[-1]}@{domain}"


def mask_phone(phone):
    """+91 ***** 43210"""
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())[-10:]
    return f"+91 ***** {digits[5:]}" if len(digits) == 10 else "your registered number"
