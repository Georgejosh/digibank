"""
Identity verification providers for real-time KYC.

Two modes, chosen automatically:

  cashfree  CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET are set. PAN numbers
            are checked against the Income Tax Department database and Aadhaar
            numbers are confirmed with an OTP sent by UIDAI to the mobile
            number linked to that Aadhaar (Cashfree Verification Suite).
            Sandbox keys work with Cashfree's test data; production keys
            perform real government checks and are billed per call.

  local     No provider keys. Only offline checks run: PAN structure and holder
            type, and the Aadhaar Verhoeff checksum. These catch typing
            mistakes but cannot prove that a number belongs to a real person.

Docs: https://www.cashfree.com/docs/api-reference/vrs/v2/pan/verify-pan-sync
      https://www.cashfree.com/docs/api-reference/vrs/v2/aadhaar/
"""
import json
import urllib.error
import urllib.request

from django.conf import settings


class ProviderError(Exception):
    """The provider could not be reached or rejected the request."""

    def __init__(self, message, code="provider_error", retry_after=None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.retry_after = retry_after


def mode():
    if settings.CASHFREE_CLIENT_ID and settings.CASHFREE_CLIENT_SECRET:
        return "cashfree"
    return "local"


def _base():
    return (
        "https://api.cashfree.com/verification"
        if settings.CASHFREE_ENV == "production"
        else "https://sandbox.cashfree.com/verification"
    )


def _post(path, body):
    req = urllib.request.Request(
        f"{_base()}{path}",
        method="POST",
        data=json.dumps(body).encode(),
        headers={
            "Content-Type": "application/json",
            "x-client-id": settings.CASHFREE_CLIENT_ID,
            "x-client-secret": settings.CASHFREE_CLIENT_SECRET,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        try:
            data = json.loads(exc.read().decode() or "{}")
        except ValueError:
            data = {}
        message = data.get("message") or f"Verification service returned HTTP {exc.code}"
        code = data.get("code") or "provider_error"
        raise ProviderError(message, code, retry_after=30 if exc.code in (409, 429) else None) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise ProviderError("The verification service is not reachable right now. Please try again.") from exc


def verify_pan(pan, name):
    """
    Returns a dict:
      verified        True / False when checked against the registry, None in local mode
      registered_name name on Income Tax records (cashfree only)
      name_match      0-100 score from the provider (cashfree only)
      message         human readable result
    """
    if mode() == "local":
        return {"verified": None, "registered_name": "", "name_match": None,
                "message": "Format checks passed. Registry check needs a verification provider."}

    data = _post("/pan", {"pan": pan, "name": name})
    # An invalid PAN can arrive as HTTP 200 with valid=false, so read the body.
    valid = bool(data.get("valid")) and data.get("pan_status", "VALID") in ("VALID", "")
    try:
        score = float(data.get("name_match_score") or 0)
    except (TypeError, ValueError):
        score = 0.0
    return {
        "verified": valid,
        "registered_name": data.get("registered_name") or "",
        "name_match": round(score, 1),
        "pan_type": data.get("type") or "",
        "message": data.get("pan_status_desc") or data.get("message") or ("PAN verified" if valid else "Invalid PAN"),
    }


def aadhaar_send_otp(aadhaar):
    """Ask UIDAI (via the provider) to send an OTP to the Aadhaar-linked mobile. Returns ref_id."""
    if mode() == "local":
        raise ProviderError("Aadhaar OTP verification needs a verification provider.", "provider_not_configured")
    data = _post("/offline-aadhaar/otp", {"aadhaar_number": aadhaar})
    status = (data.get("status") or "").upper()
    message = data.get("message") or ""
    if status != "SUCCESS" or not data.get("ref_id") or "not linked" in message.lower():
        raise ProviderError(message or "Could not send the Aadhaar OTP.", "aadhaar_otp_failed")
    return str(data["ref_id"])


def aadhaar_verify_otp(ref_id, otp):
    """Submit the OTP. Returns the UIDAI identity details on success."""
    if mode() == "local":
        raise ProviderError("Aadhaar OTP verification needs a verification provider.", "provider_not_configured")
    data = _post("/offline-aadhaar/verify", {"otp": otp, "ref_id": ref_id})
    if (data.get("status") or "").upper() != "VALID":
        raise ProviderError(data.get("message") or "Aadhaar could not be verified.", "aadhaar_verify_failed")
    split = data.get("split_address") or {}
    return {
        "name": data.get("name") or "",
        "dob": data.get("dob") or "",  # DD-MM-YYYY
        "gender": data.get("gender") or "",
        "address": {
            "address_line1": ", ".join(x for x in (split.get("house"), split.get("street")) if x),
            "address_line2": ", ".join(x for x in (split.get("landmark"), split.get("locality"), split.get("po")) if x),
            "city": split.get("vtc") or split.get("dist") or "",
            "state": split.get("state") or "",
            "pincode": str(split.get("pincode") or ""),
        },
    }
