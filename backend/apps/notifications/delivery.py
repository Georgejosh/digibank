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


def email_provider():
    """Which HTTPS e-mail API is configured: 'brevo', 'resend' or ''."""
    choice = settings.EMAIL_PROVIDER
    if choice in ("brevo", "resend"):
        return choice
    if settings.BREVO_API_KEY:
        return "brevo"
    if settings.EMAIL_HOST_PASSWORD.startswith("re_"):
        return "resend"
    return ""


def _sender():
    from email.utils import parseaddr

    name, address = parseaddr(settings.OTP_FROM_EMAIL)
    return (name or settings.OTP_FROM_NAME), address


def _html(user, code, purpose):
    import html

    reason = html.escape(PURPOSE_TEXT.get(purpose, "continue in DigiBank"))
    return f"""<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;color:#1A2227">
  <h2 style="color:#145F65;margin:0 0 16px">DigiBank</h2>
  <p>Hi {html.escape(user.name)},</p>
  <p>Use this code to {reason}:</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#EEF9F8;border-radius:10px;padding:16px;text-align:center;color:#145F65">{code}</p>
  <p>It expires in {settings.OTP_VALIDITY_MINUTES} minutes and can be used only once.</p>
  <p style="color:#6B7C87;font-size:13px">Did not request this? Someone may know your password - change it.
  DigiBank staff will never ask you for this code.</p>
</div>"""


def _post_json(url, headers, payload):
    import json
    import urllib.error
    import urllib.request

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json",
                 "User-Agent": "DigiBank/1.0", **headers},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=settings.EMAIL_TIMEOUT) as resp:
            return resp.status
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8")[:300]
        except Exception:  # noqa: BLE001
            pass
        raise OtpDeliveryError(f"E-mail provider refused the message (HTTP {exc.code}): {detail}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise OtpDeliveryError(f"E-mail provider not reachable: {exc}") from exc


def _deliver_email(user, code, purpose):
    provider = email_provider()
    name, address = _sender()
    if provider == "brevo":
        _post_json(
            "https://api.brevo.com/v3/smtp/email",
            {"api-key": settings.BREVO_API_KEY},
            {
                "sender": {"name": name, "email": address},
                "to": [{"email": user.email, "name": user.name}],
                "subject": _subject(purpose),
                "htmlContent": _html(user, code, purpose),
                "textContent": _body(user, code, purpose),
            },
        )
    elif provider == "resend":
        _post_json(
            "https://api.resend.com/emails",
            {"Authorization": f"Bearer {settings.EMAIL_HOST_PASSWORD}"},
            {
                "from": f"{name} <{address}>",
                "to": [user.email],
                "subject": _subject(purpose),
                "html": _html(user, code, purpose),
                "text": _body(user, code, purpose),
            },
        )
    else:
        raise OtpDeliveryError("No e-mail provider is configured (set BREVO_API_KEY).")
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
        channel = "email" if email_provider() else "console"

    if channel == "console":
        if not settings.DEBUG:
            # Printing codes into a production server log helps nobody and
            # tells the user "check the terminal" - refuse instead.
            raise OtpDeliveryError("No e-mail provider is configured on the server.")
        return _deliver_console(user, code, purpose)
    if channel == "email":
        try:
            return _deliver_email(user, code, purpose)
        except OtpDeliveryError as exc:
            if not settings.DEBUG:
                logger.error("OTP e-mail to %s failed: %s", user.email, exc)
                raise
            logger.warning("Email delivery failed (%s). Falling back to console (DEBUG only).", exc)
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
