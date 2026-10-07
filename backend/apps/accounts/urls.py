"""Auth + account routes. Mounted at /api/auth/ and /api/accounts/."""
from django.urls import path

from . import biometrics, kyc, views

auth_urlpatterns = [
    path("register/", views.register, name="register"),
    path("login/", views.login, name="login"),
    path("verify-otp/", views.verify_otp_view, name="verify-otp"),
    path("resend-otp/", views.resend_otp, name="resend-otp"),
    path("refresh/", views.refresh, name="refresh"),
    path("logout/", views.logout, name="logout"),
    path("forgot-password/", views.forgot_password, name="forgot-password"),
    path("me/", views.me, name="me"),

    # Biometric (WebAuthn / passkey) sign-in and withdrawal approval
    path("biometric/register/options/", biometrics.register_options, name="biometric-register-options"),
    path("biometric/register/verify/", biometrics.register_verify, name="biometric-register-verify"),
    path("biometric/login/options/", biometrics.login_options, name="biometric-login-options"),
    path("biometric/login/verify/", biometrics.login_verify, name="biometric-login-verify"),
    path("biometric/approve/options/", biometrics.approve_options, name="biometric-approve-options"),
    path("biometric/approve/verify/", biometrics.approve_verify, name="biometric-approve-verify"),
    path("biometric/credentials/", biometrics.credentials, name="biometric-credentials"),
    path("biometric/credentials/<int:credential_id>/", biometrics.delete_credential, name="biometric-credential-delete"),
    path("biometric/settings/", biometrics.update_settings, name="biometric-settings"),
]

account_urlpatterns = [
    path("bank-accounts/", kyc.bank_accounts, name="bank-accounts"),
    path("bank-accounts/<int:account_id>/", kyc.bank_account_detail, name="bank-account-detail"),
    path("bank-accounts/<int:account_id>/primary/", kyc.bank_account_make_primary, name="bank-account-primary"),
    path("ifsc/<str:code>/", kyc.ifsc_lookup, name="ifsc-lookup"),
]

kyc_urlpatterns = [
    path("", kyc.kyc_status, name="kyc-status"),
    path("submit/", kyc.kyc_submit, name="kyc-submit"),
]
