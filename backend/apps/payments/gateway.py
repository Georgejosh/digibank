"""
Razorpay integration for wallet top-ups.

HOW A REAL TOP-UP WORKS
-----------------------
1. POST /payments/wallet/topup/order/   we create a Razorpay ORDER for the amount
2. Browser opens Razorpay Checkout       user pays by UPI / netbanking / card
3. POST /payments/wallet/topup/verify/  we check Razorpay's HMAC signature and
                                        only then credit the wallet
4. POST /payments/razorpay/webhook/     Razorpay tells us directly too, so a
                                        closed tab cannot lose a paid top-up

Steps 3 and 4 both call credit_order(), which is idempotent: whichever lands
first credits the wallet, the other sees the order already PAID.

Test keys (rzp_test_...) run the full flow with Razorpay's test UPI / cards and
no real money. Live keys (rzp_live_...) move real money and need an activated
Razorpay merchant account.
"""
import base64
import hashlib
import hmac
import json
import urllib.error
import urllib.request

from django.conf import settings

API = "https://api.razorpay.com/v1"


class GatewayError(Exception):
    pass


def provider():
    """'razorpay' or 'simulated'. Simulated is refused outright unless DEBUG."""
    choice = settings.PAYMENT_PROVIDER
    has_keys = bool(settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET)
    if choice == "razorpay" or (choice == "auto" and has_keys):
        return "razorpay"
    return "simulated"


def simulated_allowed():
    return provider() == "simulated" and settings.DEBUG


def is_test_mode():
    return settings.RAZORPAY_KEY_ID.startswith("rzp_test_")


def _request(method, path, body=None):
    if not (settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET):
        raise GatewayError("Razorpay keys are not configured.")
    auth = base64.b64encode(f"{settings.RAZORPAY_KEY_ID}:{settings.RAZORPAY_KEY_SECRET}".encode()).decode()
    req = urllib.request.Request(
        f"{API}{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        try:
            detail = json.loads(exc.read().decode()).get("error", {}).get("description")
        except Exception:  # noqa: BLE001
            detail = None
        raise GatewayError(detail or f"Razorpay returned HTTP {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise GatewayError("Could not reach Razorpay. Try again.") from exc


def create_order(amount_paise, receipt, notes):
    return _request(
        "POST",
        "/orders",
        {"amount": amount_paise, "currency": "INR", "receipt": receipt, "notes": notes, "payment_capture": 1},
    )


def fetch_payment(payment_id):
    return _request("GET", f"/payments/{payment_id}")


def signature_is_valid(order_id, payment_id, signature):
    """Checkout's handler signature: HMAC_SHA256(order_id|payment_id, key_secret)."""
    expected = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def webhook_signature_is_valid(raw_body, signature):
    if not settings.RAZORPAY_WEBHOOK_SECRET:
        return False
    expected = hmac.new(settings.RAZORPAY_WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature or "")
