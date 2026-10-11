"""
Field-level encryption for identity numbers (PAN) and keyed fingerprints for
bank account numbers.

ALGORITHM
---------
New values: AES-256-GCM (authenticated encryption, NIST SP 800-38D).
  - 256-bit key derived with HKDF-SHA256 (RFC 5869) from FIELD_ENCRYPTION_KEY.
  - Fresh random 96-bit nonce per value, so the same PAN encrypts differently
    every time.
  - The GCM tag makes any tampering with the stored ciphertext detectable:
    a modified value fails to decrypt instead of producing garbage.
  Stored as "v2.<base64(nonce || ciphertext || tag)>".

Older values (written before this upgrade) are Fernet tokens - AES-128-CBC +
HMAC-SHA256 - and are still readable; they are re-encrypted with AES-256-GCM
the next time they are saved.

FIELD_ENCRYPTION_KEY can be any long random string. Without it the key is
derived from DJANGO_SECRET_KEY, which is fine for development but means
rotating the secret key makes stored PANs unreadable. Set it once and never
change it.
"""
import base64
import hashlib
import hmac
import os

from cryptography.exceptions import InvalidTag
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings

_V2 = "v2."


def _secret():
    return (getattr(settings, "FIELD_ENCRYPTION_KEY", "") or settings.SECRET_KEY).encode()


def _aes_key():
    # HKDF turns any secret string into a uniformly random 256-bit key, and the
    # "info" label means this key can never collide with one derived elsewhere.
    return HKDF(
        algorithm=hashes.SHA256(), length=32, salt=b"digibank-field-encryption", info=b"pan-aes-256-gcm"
    ).derive(_secret())


def _legacy_fernet():
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(_secret()).digest()))


def encrypt(value: str) -> str:
    if not value:
        return ""
    nonce = os.urandom(12)
    sealed = AESGCM(_aes_key()).encrypt(nonce, value.encode(), b"digibank")
    return _V2 + base64.urlsafe_b64encode(nonce + sealed).decode()


def decrypt(token: str) -> str:
    if not token:
        return ""
    if token.startswith(_V2):
        raw = base64.urlsafe_b64decode(token[len(_V2):].encode())
        try:
            return AESGCM(_aes_key()).decrypt(raw[:12], raw[12:], b"digibank").decode()
        except InvalidTag:
            return ""  # wrong key or tampered ciphertext
    try:
        return _legacy_fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return ""


def fingerprint(value: str) -> str:
    """
    HMAC-SHA256 of a bank account number. Lets us spot the same account being
    linked twice without storing the number itself - a plain SHA-256 of a
    12-digit number could be brute-forced in seconds; a keyed HMAC cannot
    without the server's secret.
    """
    return hmac.new(settings.SECRET_KEY.encode(), value.encode(), hashlib.sha256).hexdigest()
