"""
Django settings for the DigiBank modular monolith.

Every value that differs between your laptop and a real server is read from
the environment (see .env.example). Nothing secret is hard-coded here, so this
file is safe to commit to git.
"""
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv
import os

BASE_DIR = Path(__file__).resolve().parent.parent

# Reads D:\DigiBank\backend\.env into os.environ. The .env file is gitignored.
load_dotenv(BASE_DIR / ".env")


def env(key, default=None):
    return os.environ.get(key, default)


def env_bool(key, default=False):
    return env(key, str(default)).lower() in ("1", "true", "yes", "on")


SECRET_KEY = env("DJANGO_SECRET_KEY", "dev-only-insecure-key-change-me")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = [h.strip() for h in env("DJANGO_ALLOWED_HOSTS", "*").split(",") if h.strip()]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # Third party
    "rest_framework",
    "corsheaders",

    # DigiBank modules -- one Django app per functional module from the
    # Modules document. This is what "modular monolith" means in practice:
    # clear internal boundaries, one deployable process.
    "apps.accounts",        # User Authentication & Registration, Biometric device keys
    "apps.savings",         # Individual Savings, Group Savings
    "apps.payments",        # Deposit & Payment, Transaction & Ledger
    "apps.emergency",       # Emergency Withdrawal & Approval, 2FA / OTP
    "apps.notifications",   # Notification
    "apps.audit",           # Audit & Admin
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    # Serves the Django admin's CSS/JS in production (no separate web server).
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "digibank.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "digibank.wsgi.application"

# ---------------------------------------------------------------------------
# Database -- PostgreSQL
# ---------------------------------------------------------------------------
# You have PostgreSQL 17 on port 5432 and 18 on port 5433. Defaults target 17.
#
# DB_ENGINE picks which one is live:
#   postgres -> the real thing, and what the project targets
#   sqlite   -> a single file, no role, no password, no server to configure
#
# SQLite exists so a teammate can clone the repo and have a working login in
# one command while their PostgreSQL role is still being set up. The models,
# migrations and queries are identical either way; run setup_db.py and flip
# this to `postgres` when you are ready.
#
# One real difference: SQLite ignores select_for_update(). The row locks in
# the deposit and emergency-approval views are no-ops there. SQLite serialises
# writes globally so the races those locks guard against still cannot happen,
# but concurrency behaviour should be verified on PostgreSQL.
DB_ENGINE = env("DB_ENGINE", "postgres").lower()

if env("DATABASE_URL"):
    # Hosted deployments (Render, Railway, Neon...) hand over one URL.
    import dj_database_url

    DATABASES = {"default": dj_database_url.parse(env("DATABASE_URL"), conn_max_age=600, ssl_require=not DEBUG)}
elif DB_ENGINE == "sqlite":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "digibank.sqlite3",
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("POSTGRES_DB", "digibank"),
            "USER": env("POSTGRES_USER", "digibank"),
            "PASSWORD": env("POSTGRES_PASSWORD", ""),
            "HOST": env("POSTGRES_HOST", "127.0.0.1"),
            "PORT": env("POSTGRES_PORT", "5432"),
        }
    }

# Our own User model replaces Django's. Must be set before the first migrate.
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# Behind Render's / Vercel's HTTPS proxy: trust its scheme header so Django
# knows requests are secure (secure cookies, admin login over https).
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
CSRF_TRUSTED_ORIGINS = [o.strip() for o in env("CSRF_TRUSTED_ORIGINS", "").split(",") if o.strip()]

# KYC documents. Deliberately NOT under a public MEDIA_URL: nothing in urls.py
# serves this folder; staff open files through a permission-checked view.
MEDIA_ROOT = Path(env("PRIVATE_MEDIA_ROOT", str(BASE_DIR / "private_media")))
KYC_MAX_UPLOAD_BYTES = 5 * 1024 * 1024
FIELD_ENCRYPTION_KEY = env("FIELD_ENCRYPTION_KEY", "")

# Payments. "auto" uses Razorpay when keys are present, otherwise a simulated
# top-up that is only allowed while DEBUG is on - so a production server with
# missing keys can never mint wallet money.
PAYMENT_PROVIDER = env("PAYMENT_PROVIDER", "auto").lower()
RAZORPAY_KEY_ID = env("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = env("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = env("RAZORPAY_WEBHOOK_SECRET", "")
WALLET_TOPUP_MIN_PAISE = int(env("WALLET_TOPUP_MIN_PAISE", "1000"))        # Rs 10
WALLET_TOPUP_MAX_PAISE = int(env("WALLET_TOPUP_MAX_PAISE", "10000000"))    # Rs 1,00,000
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# Django REST Framework + JWT
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_RENDERER_CLASSES": (
        "rest_framework.renderers.JSONRenderer",
    ),
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
}

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
# The React web app and the Expo app run on different origins in development.
#
# IMPORTANT: the refresh token travels as a cookie, so the browser only sends
# it when CORS_ALLOW_CREDENTIALS is on -- and the CORS spec forbids pairing
# credentials with a "*" origin. That is why origins are listed explicitly
# here even in DEBUG.
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in env(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if o.strip()
]

# ---------------------------------------------------------------------------
# Refresh-token cookie
# ---------------------------------------------------------------------------
# The frontend keeps the ACCESS token in memory only and never sees the refresh
# token: it lives in a cookie JavaScript cannot read.
#
#   httponly -> an XSS payload cannot steal it
#   samesite -> stops another site posting to /auth/refresh/ with the cookie
#               attached, which is the CSRF defence for that route
#   secure   -> HTTPS only. Must stay False on plain-HTTP localhost or the
#               browser silently drops the cookie and login appears to fail.
# Biometric sign-in (WebAuthn). The RP ID must be the bare domain the browser
# shows - "localhost" in development, never an IP address (browsers refuse
# WebAuthn on 127.0.0.1), and an HTTPS domain in production.
WEBAUTHN_RP_ID = env("WEBAUTHN_RP_ID", "localhost")
WEBAUTHN_RP_NAME = env("WEBAUTHN_RP_NAME", "DigiBank")
WEBAUTHN_ORIGINS = [
    o.strip()
    for o in env("WEBAUTHN_ORIGINS", "http://localhost:5173,http://localhost:4173").split(",")
    if o.strip()
]

REFRESH_COOKIE_NAME = env("REFRESH_COOKIE_NAME", "digibank_refresh")
REFRESH_COOKIE_SECURE = env_bool("REFRESH_COOKIE_SECURE", not DEBUG)
REFRESH_COOKIE_SAMESITE = env("REFRESH_COOKIE_SAMESITE", "Lax" if DEBUG else "Strict")
REFRESH_COOKIE_PATH = "/api/auth/"

# ---------------------------------------------------------------------------
# OTP delivery
# ---------------------------------------------------------------------------
# Channel options:
#   auto    -> email when SMTP credentials are configured, otherwise console
#   console -> print the code to the runserver terminal (no delivery)
#   email   -> real email via SMTP
#   sms     -> real SMS via an provider (see apps/notifications/delivery.py)
#
# The code is NEVER returned in an API response, on any channel. Anything the
# response body carries, an attacker who can reach the endpoint carries too.
OTP_DELIVERY_CHANNEL = env("OTP_DELIVERY_CHANNEL", "auto").lower()

EMAIL_HOST = env("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(env("EMAIL_PORT", "587"))
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", "")
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", EMAIL_HOST_USER or "no-reply@digibank.local")
EMAIL_BACKEND = (
    "django.core.mail.backends.smtp.EmailBackend"
    if EMAIL_HOST_USER
    else "django.core.mail.backends.console.EmailBackend"
)
EMAIL_TIMEOUT = int(env("EMAIL_TIMEOUT", "20"))

# Optional SMS provider (Twilio-compatible). Left blank = SMS channel disabled.
SMS_PROVIDER = env("SMS_PROVIDER", "").lower()
SMS_ACCOUNT_SID = env("SMS_ACCOUNT_SID", "")
SMS_AUTH_TOKEN = env("SMS_AUTH_TOKEN", "")
SMS_FROM_NUMBER = env("SMS_FROM_NUMBER", "")

# Resend throttle: how long a user must wait between OTP requests.
OTP_RESEND_COOLDOWN_SECONDS = int(env("OTP_RESEND_COOLDOWN_SECONDS", "30"))

# ---------------------------------------------------------------------------
# DigiBank business rules
# ---------------------------------------------------------------------------
# Kept here (not scattered in views) so the rules are auditable in one place.
OTP_LENGTH = int(env("OTP_LENGTH", "6"))
OTP_VALIDITY_MINUTES = int(env("OTP_VALIDITY_MINUTES", "5"))
OTP_MAX_ATTEMPTS = int(env("OTP_MAX_ATTEMPTS", "5"))
EMERGENCY_REQUEST_VALIDITY_HOURS = int(env("EMERGENCY_REQUEST_VALIDITY_HOURS", "48"))
BIOMETRIC_CHALLENGE_VALIDITY_SECONDS = int(env("BIOMETRIC_CHALLENGE_VALIDITY_SECONDS", "120"))
