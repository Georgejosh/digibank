"""OTP e-mail delivery: provider selection, payloads, and no silent fallback in production."""
import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from apps.notifications import delivery

User = get_user_model()


class FakeResponse:
    status = 201

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class OtpEmailTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(name="Reni K", email="reni4@gmail.com", phone="9876588888", password="Password123")

    @override_settings(OTP_DELIVERY_CHANNEL="email", BREVO_API_KEY="xkeysib-test", EMAIL_PROVIDER="auto",
                       OTP_FROM_EMAIL="georgejoshwafrankline@gmail.com", OTP_FROM_NAME="DigiBank")
    def test_brevo_sends_to_any_user(self):
        with mock.patch("urllib.request.urlopen", return_value=FakeResponse()) as urlopen:
            self.assertEqual(delivery.send_otp(self.user, "482913", "LOGIN"), "email")
        req = urlopen.call_args[0][0]
        body = json.loads(req.data)
        self.assertEqual(req.full_url, "https://api.brevo.com/v3/smtp/email")
        self.assertEqual(req.get_header("Api-key"), "xkeysib-test")
        self.assertEqual(body["to"], [{"email": "reni4@gmail.com", "name": "Reni K"}])
        self.assertEqual(body["sender"], {"name": "DigiBank", "email": "georgejoshwafrankline@gmail.com"})
        self.assertIn("482913", body["htmlContent"])

    @override_settings(DEBUG=False, OTP_DELIVERY_CHANNEL="email", BREVO_API_KEY="", EMAIL_HOST_PASSWORD="")
    def test_production_never_falls_back_to_terminal(self):
        with self.assertRaises(delivery.OtpDeliveryError):
            delivery.send_otp(self.user, "482913", "LOGIN")

    @override_settings(DEBUG=False, OTP_DELIVERY_CHANNEL="email", BREVO_API_KEY="xkeysib-test")
    def test_provider_refusal_is_reported_not_hidden(self):
        import io
        import urllib.error

        err = urllib.error.HTTPError("https://api.brevo.com", 401, "Unauthorized", {}, io.BytesIO(b'{"message":"Key not found"}'))
        with mock.patch("urllib.request.urlopen", side_effect=err):
            with self.assertRaises(delivery.OtpDeliveryError) as ctx:
                delivery.send_otp(self.user, "482913", "LOGIN")
        self.assertIn("401", str(ctx.exception))

    @override_settings(DEBUG=True, OTP_DELIVERY_CHANNEL="email", BREVO_API_KEY="", EMAIL_HOST_PASSWORD="")
    def test_local_development_still_prints_the_code(self):
        self.assertEqual(delivery.send_otp(self.user, "482913", "LOGIN"), "console")
