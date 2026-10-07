"""
Field-level encryption for identity numbers (PAN) and keyed fingerprints for
bank account numbers.

FIELD_ENCRYPTION_KEY can be any long random string (it is hashed into a
Fernet key). Without it the key is derived from DJANGO_SECRET_KEY, which is
fine for development but means rotating the secret key makes stored PANs
unreadable. Set it once and never change it.
"""
import base64
import hashlib
import hmac

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


def _fernet():
    # Any secret string works: it is stretched to a valid 32-byte Fernet key,
    # so a host's auto-generated random value can be used as-is.
    secret = getattr(settings, "FIELD_ENCRYPTION_KEY", "") or settings.SECRET_KEY
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest()))


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode() if value else ""


def decrypt(token: str) -> str:
    if not token:
        return ""
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return ""


def fingerprint(value: str) -> str:
    """
    HMAC of a bank account number. Lets us spot the same account being linked
    twice without storing the number itself - a plain SHA-256 of a 12-digit
    number could be brute-forced in seconds; a keyed HMAC cannot.
    """
    return hmac.new(settings.SECRET_KEY.encode(), value.encode(), hashlib.sha256).hexdigest()
