"""KYC submission, bank linking and Razorpay top-up tests."""
import hashlib
import hmac
import json
import shutil
import tempfile
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts import kyc
from apps.accounts.models import KycProfile, KycStatus, LinkedBankAccount

User = get_user_model()
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
PDF = b"%PDF-1.4\n" + b"0" * 64
IFSC_INFO = {"ifsc": "HDFC0000001", "bank": "HDFC Bank", "branch": "Fort", "city": "Mumbai", "state": "MH",
             "bank_code": "HDFC", "upi": True, "imps": True, "neft": True}


def valid_aadhaar(prefix="23456789012"):
    """Append the Verhoeff check digit that makes `prefix` a valid Aadhaar."""
    for d in "0123456789":
        if kyc.aadhaar_is_valid(prefix + d):
            return prefix + d
    raise AssertionError("no check digit")


MEDIA = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=MEDIA)
class KycTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.user = User.objects.create_user(
            name="Priya Sharma", email="priya@example.com", phone="9876522222", password="Password123", is_verified=True
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _form(self, **overrides):
        data = {
            "full_name": "Priya Sharma",
            "date_of_birth": "2000-05-14",
            "pan": "ABCPS1234K",
            "aadhaar": valid_aadhaar(),
            "occupation": "STUDENT",
            "address_proof_type": "AADHAAR",
            "address_line1": "12 MG Road, Flat 4B",
            "city": "Bengaluru",
            "state": "Karnataka",
            "pincode": "560001",
            "consent": "true",
            "pan_document": SimpleUploadedFile("pan.pdf", PDF),
            "address_document": SimpleUploadedFile("aadhaar.png", PNG),
            "selfie": SimpleUploadedFile("selfie.png", PNG),
        }
        data.update(overrides)
        return data

    def test_valid_submission_stores_masked_identity(self):
        res = self.client.post("/api/kyc/submit/", self._form(), format="multipart")
        self.assertEqual(res.status_code, 201, res.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.kyc_status, KycStatus.SUBMITTED)
        profile = KycProfile.objects.get(user=self.user)
        self.assertEqual(profile.pan_number, "ABCPS1234K")
        self.assertNotIn("ABCPS1234K", profile.pan_encrypted)  # encrypted at rest
        self.assertEqual(len(profile.aadhaar_last4), 4)  # never the full Aadhaar
        self.assertTrue(profile.auto_checks["pan_surname_initial_matches"])
        self.assertEqual(res.data["profile"]["masked_pan"], "XXXXXX234K")

    def test_bad_inputs_are_rejected(self):
        cases = [
            {"aadhaar": "234567890123"},                   # checksum fails
            {"date_of_birth": "2015-01-01"},               # under 18
            {"pan": "ABCCS1234K"},                         # company PAN, not individual
            {"selfie": SimpleUploadedFile("me.jpg", b"not really an image")},
            {"selfie": SimpleUploadedFile("me.pdf", PDF)},  # selfie must be an image
            {"consent": "false"},
        ]
        for case in cases:
            res = self.client.post("/api/kyc/submit/", self._form(**case), format="multipart")
            self.assertEqual(res.status_code, 400, case)
        self.assertFalse(KycProfile.objects.exists())

    def test_cannot_resubmit_while_under_review(self):
        self.client.post("/api/kyc/submit/", self._form(), format="multipart")
        res = self.client.post("/api/kyc/submit/", self._form(), format="multipart")
        self.assertEqual(res.status_code, 409)


@mock.patch("apps.accounts.kyc.lookup_ifsc", return_value=IFSC_INFO)
class BankLinkingTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            name="Priya Sharma", email="priya@example.com", phone="9876522222", password="Password123", is_verified=True
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.body = {
            "account_holder_name": "PRIYA SHARMA",
            "account_number": "50100123456789",
            "confirm_account_number": "50100123456789",
            "ifsc": "hdfc0000001",
            "account_type": "SAVINGS",
        }

    def _verify_kyc(self):
        self.user.kyc_status = KycStatus.VERIFIED
        self.user.save()

    def test_kyc_required(self, _lookup):
        res = self.client.post("/api/accounts/bank-accounts/", self.body, format="json")
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data["code"], "kyc_required")

    def test_link_stores_only_masked_number(self, _lookup):
        self._verify_kyc()
        res = self.client.post("/api/accounts/bank-accounts/", self.body, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        acc = LinkedBankAccount.objects.get(user=self.user)
        self.assertEqual(acc.masked_account_no, "XXXX6789")
        self.assertEqual(acc.bank_name, "HDFC Bank")
        self.assertTrue(acc.is_primary)
        stored = json.dumps([str(v) for v in LinkedBankAccount.objects.values().first().values()])
        self.assertNotIn("50100123456789", stored)

    def test_third_party_and_duplicate_accounts_refused(self, _lookup):
        self._verify_kyc()
        res = self.client.post("/api/accounts/bank-accounts/", {**self.body, "account_holder_name": "Rahul Verma"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.client.post("/api/accounts/bank-accounts/", self.body, format="json")
        res = self.client.post("/api/accounts/bank-accounts/", self.body, format="json")
        self.assertEqual(res.status_code, 400)

    def test_unknown_ifsc_refused(self, lookup):
        self._verify_kyc()
        lookup.return_value = None
        res = self.client.post("/api/accounts/bank-accounts/", self.body, format="json")
        self.assertEqual(res.status_code, 400)


SECRET = "test_secret_abc"
WEBHOOK_SECRET = "whsec_test"


@override_settings(
    PAYMENT_PROVIDER="auto", RAZORPAY_KEY_ID="rzp_test_KEY", RAZORPAY_KEY_SECRET=SECRET,
    RAZORPAY_WEBHOOK_SECRET=WEBHOOK_SECRET, DEBUG=True,
)
class RazorpayTopUpTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            name="Priya Sharma", email="priya@example.com", phone="9876522222", password="Password123", is_verified=True
        )
        self.user.kyc_status = KycStatus.VERIFIED
        self.user.save()
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _order(self, amount=50000):
        with mock.patch("apps.payments.gateway.create_order", return_value={"id": "order_TEST123"}):
            return self.client.post("/api/payments/wallet/topup/order/", {"amount_paise": amount}, format="json")

    @staticmethod
    def _sig(order_id, payment_id):
        return hmac.new(SECRET.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()

    def _balance(self):
        self.user.refresh_from_db()
        return self.user.digital_wallet_balance_paise

    def test_simulated_top_up_is_closed_when_gateway_configured(self):
        res = self.client.post("/api/payments/wallet/deposit/", {"amount_paise": 50000}, format="json")
        self.assertEqual(res.status_code, 403)
        self.assertEqual(self._balance(), 0)

    @override_settings(RAZORPAY_KEY_ID="", RAZORPAY_KEY_SECRET="", DEBUG=False)
    def test_simulated_top_up_is_closed_in_production(self):
        res = self.client.post("/api/payments/wallet/deposit/", {"amount_paise": 50000}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_unverified_kyc_cannot_top_up(self):
        self.user.kyc_status = KycStatus.SUBMITTED
        self.user.save()
        self.assertEqual(self._order().status_code, 403)

    def test_verified_payment_credits_exactly_once(self):
        self.assertEqual(self._order().status_code, 201)
        body = {"razorpay_order_id": "order_TEST123", "razorpay_payment_id": "pay_ABC",
                "razorpay_signature": self._sig("order_TEST123", "pay_ABC")}
        with mock.patch("apps.payments.gateway.fetch_payment", return_value={"method": "upi"}):
            first = self.client.post("/api/payments/wallet/topup/verify/", body, format="json")
            second = self.client.post("/api/payments/wallet/topup/verify/", body, format="json")
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(self._balance(), 50000)
        self.assertEqual(first.data["transaction"]["reference"], "pay_ABC")

        # The webhook arriving afterwards must not credit again.
        payload = json.dumps({"event": "payment.captured", "payload": {"payment": {"entity": {
            "id": "pay_ABC", "order_id": "order_TEST123", "method": "upi"}}}}).encode()
        sig = hmac.new(WEBHOOK_SECRET.encode(), payload, hashlib.sha256).hexdigest()
        res = APIClient().post("/api/payments/razorpay/webhook/", payload, content_type="application/json",
                               HTTP_X_RAZORPAY_SIGNATURE=sig)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self._balance(), 50000)

    def test_forged_signature_credits_nothing(self):
        self._order()
        res = self.client.post("/api/payments/wallet/topup/verify/", {
            "razorpay_order_id": "order_TEST123", "razorpay_payment_id": "pay_ABC", "razorpay_signature": "0" * 64,
        }, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self._balance(), 0)

    def test_webhook_alone_credits_when_tab_was_closed(self):
        self._order()
        payload = json.dumps({"event": "order.paid", "payload": {"payment": {"entity": {
            "id": "pay_WH", "order_id": "order_TEST123", "method": "netbanking"}}}}).encode()
        bad = APIClient().post("/api/payments/razorpay/webhook/", payload, content_type="application/json",
                               HTTP_X_RAZORPAY_SIGNATURE="bad")
        self.assertEqual(bad.status_code, 400)
        sig = hmac.new(WEBHOOK_SECRET.encode(), payload, hashlib.sha256).hexdigest()
        ok = APIClient().post("/api/payments/razorpay/webhook/", payload, content_type="application/json",
                              HTTP_X_RAZORPAY_SIGNATURE=sig)
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(self._balance(), 50000)

    def test_amount_limits(self):
        self.assertEqual(self._order(amount=500).status_code, 400)         # below Rs 10
        self.assertEqual(self._order(amount=20_000_000).status_code, 400)  # above Rs 1,00,000
