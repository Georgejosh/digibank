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
from apps.accounts.models import KycCheck, KycProfile, KycStatus, LinkedBankAccount

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
        # No provider configured: every offline check passed, so it is approved instantly.
        self.assertEqual(self.user.kyc_status, KycStatus.VERIFIED)
        self.assertEqual(res.data["decision"]["level"], "AUTOMATED")
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


class CryptoHardeningTests(TestCase):
    def test_pan_uses_aes_256_gcm_and_detects_tampering(self):
        from apps.accounts import crypto

        a, b = crypto.encrypt("ABCPS1234K"), crypto.encrypt("ABCPS1234K")
        self.assertTrue(a.startswith("v2."))
        self.assertNotEqual(a, b)  # random nonce: same PAN, different ciphertext
        self.assertEqual(crypto.decrypt(a), "ABCPS1234K")
        tampered = a[:-4] + ("AAAA" if not a.endswith("AAAA") else "BBBB")
        self.assertEqual(crypto.decrypt(tampered), "")

    def test_values_written_before_upgrade_still_decrypt(self):
        from apps.accounts import crypto

        legacy = crypto._legacy_fernet().encrypt(b"ABCPS1234K").decode()
        self.assertEqual(crypto.decrypt(legacy), "ABCPS1234K")

    def test_passwords_are_hashed_with_argon2id(self):
        user = User.objects.create_user(name="Hash Test", email="hash@example.com", phone="9876533333", password="Password123")
        self.assertTrue(user.password.startswith("argon2$argon2id$"))
        self.assertTrue(user.check_password("Password123"))


@override_settings(MEDIA_ROOT=MEDIA)
class RealtimeKycTests(TestCase):
    """Real-time PAN / Aadhaar checks and the instant KYC decision."""

    def setUp(self):
        self.user = User.objects.create_user(
            name="Priya Sharma", email="rt@example.com", phone="9876555555", password="Password123", is_verified=True
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.aadhaar = valid_aadhaar()

    def _submit(self, **overrides):
        return self.client.post("/api/kyc/submit/", KycTests._form(self, **overrides), format="multipart")

    # ---- local mode (no provider keys) --------------------------------------
    def test_pan_check_reports_format_instantly(self):
        bad = self.client.post("/api/kyc/check-pan/", {"pan": "ABCCS1234K", "full_name": "Priya Sharma"}, format="json").data
        self.assertFalse(bad["valid"])
        good = self.client.post("/api/kyc/check-pan/", {"pan": "ABCPS1234K", "full_name": "Priya Sharma"}, format="json").data
        self.assertTrue(good["valid"])
        self.assertEqual(good["mode"], "local")

    def test_aadhaar_checksum_checked_instantly(self):
        self.assertEqual(self.client.post("/api/kyc/aadhaar/otp/", {"aadhaar": "234567890123"}, format="json").status_code, 400)
        ok = self.client.post("/api/kyc/aadhaar/otp/", {"aadhaar": self.aadhaar}, format="json").data
        self.assertFalse(ok["sent"])
        self.assertIn("checksum", ok["message"])

    def test_name_mismatch_goes_to_manual_review(self):
        res = self._submit(full_name="Rahul Verma", pan="ABCPV1234K")
        self.assertEqual(res.data["status"], KycStatus.SUBMITTED)
        self.assertTrue(res.data["decision"]["reasons"])

    @override_settings(KYC_AUTO_APPROVE="off")
    def test_auto_approval_can_be_switched_off(self):
        self.assertEqual(self._submit().data["status"], KycStatus.SUBMITTED)

    # ---- provider mode (Cashfree, mocked) -----------------------------------
    @override_settings(CASHFREE_CLIENT_ID="cf_test", CASHFREE_CLIENT_SECRET="cf_secret")
    def test_registry_verified_pan_and_aadhaar_are_approved_instantly(self):
        pan_ok = {"verified": True, "registered_name": "PRIYA SHARMA", "name_match": 100.0, "message": "Existing and Valid"}
        aadhaar_ok = {"name": "Priya Sharma", "dob": "14-05-2000", "gender": "F",
                      "address": {"address_line1": "12 MG Road", "address_line2": "", "city": "Bengaluru",
                                  "state": "Karnataka", "pincode": "560001"}}
        with mock.patch("apps.accounts.kyc_providers.verify_pan", return_value=pan_ok), \
                mock.patch("apps.accounts.kyc_providers.aadhaar_send_otp", return_value="21637861"), \
                mock.patch("apps.accounts.kyc_providers.aadhaar_verify_otp", return_value=aadhaar_ok):
            pan = self.client.post("/api/kyc/check-pan/", {"pan": "ABCPS1234K", "full_name": "Priya Sharma"}, format="json").data
            self.assertTrue(pan["registry"]["name_ok"])
            sent = self.client.post("/api/kyc/aadhaar/otp/", {"aadhaar": self.aadhaar}, format="json").data
            verified = self.client.post("/api/kyc/aadhaar/verify/", {"check_id": sent["check_id"], "otp": "111000"}, format="json")
            self.assertEqual(verified.status_code, 200)
            self.assertEqual(verified.data["address"]["city"], "Bengaluru")
            res = self._submit(aadhaar=self.aadhaar)
        self.assertEqual(res.data["status"], KycStatus.VERIFIED, res.data)
        self.assertEqual(res.data["decision"]["level"], "REGISTRY")
        self.assertTrue(res.data["profile"]["aadhaar_verified"])
        self.assertFalse(KycCheck.objects.filter(value_hash__contains=self.aadhaar).exists())  # only hashes stored

    @override_settings(CASHFREE_CLIENT_ID="cf_test", CASHFREE_CLIENT_SECRET="cf_secret")
    def test_unverified_aadhaar_needs_review(self):
        pan_ok = {"verified": True, "registered_name": "PRIYA SHARMA", "name_match": 100.0, "message": "ok"}
        with mock.patch("apps.accounts.kyc_providers.verify_pan", return_value=pan_ok):
            self.client.post("/api/kyc/check-pan/", {"pan": "ABCPS1234K", "full_name": "Priya Sharma"}, format="json")
            res = self._submit()  # Aadhaar never OTP-verified
        self.assertEqual(res.data["status"], KycStatus.SUBMITTED)
        self.assertIn("Aadhaar was not verified with OTP.", res.data["decision"]["reasons"])

    @override_settings(CASHFREE_CLIENT_ID="cf_test", CASHFREE_CLIENT_SECRET="cf_secret")
    def test_rejected_pan_needs_review(self):
        rejected = {"verified": False, "registered_name": "", "name_match": 0, "message": "Invalid PAN"}
        with mock.patch("apps.accounts.kyc_providers.verify_pan", return_value=rejected):
            self.client.post("/api/kyc/check-pan/", {"pan": "ABCPS1234K", "full_name": "Priya Sharma"}, format="json")
            res = self._submit(address_proof_type="PASSPORT", aadhaar="")
        self.assertEqual(res.data["status"], KycStatus.SUBMITTED)


class ProviderParsingTests(TestCase):
    """The Cashfree adapter reads the documented response shapes correctly."""

    @override_settings(CASHFREE_CLIENT_ID="cf_test", CASHFREE_CLIENT_SECRET="cf_secret")
    def test_parses_documented_samples(self):
        from apps.accounts import kyc_providers as p

        valid = {"pan": "ABCPV1234D", "type": "Individual", "registered_name": "JOHN DOE", "valid": True,
                 "name_match_score": "100.00", "pan_status": "VALID", "pan_status_desc": "Existing and Valid"}
        invalid = {"pan": "ABCPV1234D", "valid": False, "message": "Invalid PAN", "name_match_score": 0,
                   "pan_status_desc": "Not found in ITD database or Invalid PAN"}
        with mock.patch.object(p, "_post", return_value=valid):
            r = p.verify_pan("ABCPV1234D", "John Doe")
            self.assertTrue(r["verified"])
            self.assertEqual((r["registered_name"], r["name_match"]), ("JOHN DOE", 100.0))
        with mock.patch.object(p, "_post", return_value=invalid):
            self.assertFalse(p.verify_pan("ABCPV1234D", "John Doe")["verified"])
        with mock.patch.object(p, "_post", return_value={"status": "SUCCESS", "message": "Aadhaar not linked to mobile number"}):
            with self.assertRaises(p.ProviderError):
                p.aadhaar_send_otp("655675523712")
        sample = {"ref_id": "70471", "status": "VALID", "name": "Mallesh Fakkirappa Dollin", "dob": "02-02-1995", "gender": "M",
                  "split_address": {"house": "Shri Kanaka Nilaya", "street": "Umashankar Nagar", "landmark": "",
                                    "locality": "Pritam Pura", "po": "Ranebennur", "vtc": "Ranibennur", "dist": "Haveri",
                                    "state": "Karnataka", "pincode": "581115"}}
        with mock.patch.object(p, "_post", return_value=sample):
            d = p.aadhaar_verify_otp("70471", "111000")
            self.assertEqual(d["address"]["pincode"], "581115")
            self.assertEqual(d["address"]["address_line1"], "Shri Kanaka Nilaya, Umashankar Nagar")
