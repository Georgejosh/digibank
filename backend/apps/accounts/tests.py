"""
Biometric (WebAuthn) tests.

A real fingerprint reader cannot run in a test, so SoftAuthenticator plays the
device: it holds an EC P-256 private key and produces byte-for-byte the same
attestation and assertion structures Windows Hello or Face ID would. The
server code under test is the production verification path - nothing mocked.
"""
import hashlib
import json
from datetime import timedelta

import cbor2
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url

from apps.savings.models import OwnerType, SavingsAccount, SavingsAccountStatus

User = get_user_model()
ORIGIN = "http://localhost:5173"
RP_ID = "localhost"


class SoftAuthenticator:
    def __init__(self, user_verified=True):
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.cred_id = b"soft-" + hashlib.sha256(str(id(self)).encode()).digest()[:16]
        self.sign_count = 0
        self.flags = 0x01 | (0x04 if user_verified else 0)  # UP, UV

    def _client_data(self, kind, challenge_b64):
        return json.dumps(
            {"type": kind, "challenge": challenge_b64, "origin": ORIGIN, "crossOrigin": False}
        ).encode()

    def register(self, options):
        nums = self.key.public_key().public_numbers()
        cose = cbor2.dumps({1: 2, 3: -7, -1: 1, -2: nums.x.to_bytes(32, "big"), -3: nums.y.to_bytes(32, "big")})
        auth_data = (
            hashlib.sha256(RP_ID.encode()).digest()
            + bytes([self.flags | 0x40])  # AT: attested credential data present
            + self.sign_count.to_bytes(4, "big")
            + bytes(16)  # AAGUID
            + len(self.cred_id).to_bytes(2, "big")
            + self.cred_id
            + cose
        )
        cid = bytes_to_base64url(self.cred_id)
        return {
            "id": cid,
            "rawId": cid,
            "type": "public-key",
            "response": {
                "clientDataJSON": bytes_to_base64url(self._client_data("webauthn.create", options["challenge"])),
                "attestationObject": bytes_to_base64url(cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": auth_data})),
                "transports": ["internal"],
            },
            "clientExtensionResults": {},
            "authenticatorAttachment": "platform",
        }

    def assert_(self, options, signer=None):
        self.sign_count += 1
        auth_data = hashlib.sha256(RP_ID.encode()).digest() + bytes([self.flags]) + self.sign_count.to_bytes(4, "big")
        client_data = self._client_data("webauthn.get", options["challenge"])
        signature = (signer or self.key).sign(auth_data + hashlib.sha256(client_data).digest(), ec.ECDSA(hashes.SHA256()))
        cid = bytes_to_base64url(self.cred_id)
        return {
            "id": cid,
            "rawId": cid,
            "type": "public-key",
            "response": {
                "clientDataJSON": bytes_to_base64url(client_data),
                "authenticatorData": bytes_to_base64url(auth_data),
                "signature": bytes_to_base64url(signature),
                "userHandle": None,
            },
            "clientExtensionResults": {},
            "authenticatorAttachment": "platform",
        }


class BiometricTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            name="Bio User", email="bio@example.com", phone="9876511111", password="Password123", is_verified=True
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.device = SoftAuthenticator()
        from apps.accounts.models import KycStatus, LinkedBankAccount

        self.user.kyc_status = KycStatus.VERIFIED
        self.user.save()
        self.bank = LinkedBankAccount.objects.create(
            user=self.user, masked_account_no="XXXX9999", ifsc="SBIN0000001", bank_name="State Bank of India", is_primary=True
        )

    def _enrol(self, device=None):
        device = device or self.device
        opts = self.client.post("/api/auth/biometric/register/options/").data
        return self.client.post(
            "/api/auth/biometric/register/verify/",
            {"challenge_id": opts["challenge_id"], "credential": device.register(opts["options"]), "device_name": "Test laptop"},
            format="json",
        )

    def _approval_token(self):
        opts = self.client.post("/api/auth/biometric/approve/options/").data
        res = self.client.post(
            "/api/auth/biometric/approve/verify/",
            {"challenge_id": opts["challenge_id"], "credential": self.device.assert_(opts["options"])},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.data)
        return res.data["biometric_token"]

    def test_enrol_then_passwordless_sign_in(self):
        self.assertEqual(self._enrol().status_code, 201)

        anon = APIClient()
        opts = anon.post("/api/auth/biometric/login/options/", {"identifier": "bio@example.com"}, format="json").data
        self.assertEqual(len(opts["options"]["allowCredentials"]), 1)
        res = anon.post(
            "/api/auth/biometric/login/verify/",
            {"challenge_id": opts["challenge_id"], "credential": self.device.assert_(opts["options"])},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertIn("access_token", res.data)
        self.assertIn("digibank_refresh", res.cookies)

    def test_forged_signature_is_rejected(self):
        self._enrol()
        anon = APIClient()
        opts = anon.post("/api/auth/biometric/login/options/", {}, format="json").data
        impostor = ec.generate_private_key(ec.SECP256R1())
        res = anon.post(
            "/api/auth/biometric/login/verify/",
            {"challenge_id": opts["challenge_id"], "credential": self.device.assert_(opts["options"], signer=impostor)},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertNotIn("access_token", res.data)

    def test_challenge_cannot_be_replayed(self):
        self._enrol()
        anon = APIClient()
        opts = anon.post("/api/auth/biometric/login/options/", {}, format="json").data
        body = {"challenge_id": opts["challenge_id"], "credential": self.device.assert_(opts["options"])}
        self.assertEqual(anon.post("/api/auth/biometric/login/verify/", body, format="json").status_code, 200)
        self.assertEqual(anon.post("/api/auth/biometric/login/verify/", body, format="json").status_code, 400)

    def test_device_without_user_verification_cannot_enrol(self):
        res = self._enrol(SoftAuthenticator(user_verified=False))
        self.assertEqual(res.status_code, 400)

    def test_withdrawals_require_single_use_biometric_token(self):
        self._enrol()
        self.client.post("/api/auth/biometric/settings/", {"require_biometric_for_withdrawals": True}, format="json")
        self.user.digital_wallet_balance_paise = 100000
        self.user.save()
        goal = SavingsAccount.objects.create(
            owner_type=OwnerType.INDIVIDUAL, user=self.user, goal_name="Done", target_amount_paise=50000,
            balance_paise=50000, status=SavingsAccountStatus.UNLOCKED,
        )

        no_token = self.client.post("/api/payments/wallet/withdraw/", {"amount_paise": 1000, "linked_bank_account_id": self.bank.id}, format="json")
        self.assertEqual(no_token.status_code, 403)
        self.assertEqual(no_token.data["code"], "biometric_required")

        token = self._approval_token()
        ok = self.client.post("/api/payments/withdrawals/", {"savings_account_id": goal.id, "amount_paise": 20000, "biometric_token": token}, format="json")
        self.assertEqual(ok.status_code, 201, ok.data)
        reused = self.client.post("/api/payments/withdrawals/", {"savings_account_id": goal.id, "amount_paise": 20000, "biometric_token": token}, format="json")
        self.assertEqual(reused.status_code, 403)

    def test_expired_token_is_rejected_and_protection_cannot_be_dropped_without_scan(self):
        from apps.accounts.models import BiometricApproval

        self._enrol()
        self.client.post("/api/auth/biometric/settings/", {"require_biometric_for_withdrawals": True}, format="json")
        token = self._approval_token()
        BiometricApproval.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        res = self.client.post("/api/auth/biometric/settings/", {"require_biometric_for_withdrawals": False, "biometric_token": token}, format="json")
        self.assertEqual(res.status_code, 403)

        res = self.client.post("/api/auth/biometric/settings/", {"require_biometric_for_withdrawals": False, "biometric_token": self._approval_token()}, format="json")
        self.assertEqual(res.status_code, 200)
        self.user.refresh_from_db()
        self.assertFalse(self.user.require_biometric_for_withdrawals)
