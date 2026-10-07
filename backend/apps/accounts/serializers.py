"""Request/response shapes for the auth module."""
import re

from django.contrib.auth import password_validation
from django.db.models import Q
from rest_framework import serializers

from apps.emergency.models import OtpPurpose
from .models import LinkedBankAccount, User

# Indian mobile: 10 digits starting 6-9, optionally prefixed +91 or 0.
PHONE_RE = re.compile(r"^(?:\+91[- ]?|0)?[6-9]\d{9}$")


def normalise_phone(value):
    """Everything is stored as the bare 10 digits, so lookups always match."""
    digits = "".join(ch for ch in value if ch.isdigit())
    return digits[-10:]


def calculate_user_streak(user):
    """
    Daily saving streak, derived directly from the ledger.
    """
    from datetime import timedelta
    from django.utils import timezone
    from apps.payments.models import Transaction, TransactionStatus, TransactionType

    dates = sorted(
        {
            t.created_at.astimezone().date()
            for t in Transaction.objects.filter(
                user=user, type=TransactionType.DEPOSIT, status=TransactionStatus.SUCCESS
            ).only("created_at")
        },
        reverse=True,
    )

    if not dates:
        return {"current_streak": 0, "longest_streak": 0, "points": 0, "saved_today": False}

    today = timezone.localdate()
    saved_today = dates[0] == today

    current = 0
    cursor = today if saved_today else today - timedelta(days=1)
    for day in dates:
        if day == cursor:
            current += 1
            cursor -= timedelta(days=1)
        elif day < cursor:
            break

    longest, run = 1, 1
    for earlier, later in zip(dates[1:], dates):
        if (later - earlier).days == 1:
            run += 1
        else:
            run = 1
        longest = max(longest, run)

    return {
        "current_streak": current,
        "longest_streak": max(longest, current),
        "points": current * 10,
        "saved_today": saved_today,
    }


class UserSerializer(serializers.ModelSerializer):
    streak = serializers.SerializerMethodField()
    biometric_devices = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id", "name", "email", "phone", "kyc_status", "is_verified", "date_joined", "streak",
            "digital_wallet_balance_paise", "require_biometric_for_withdrawals", "biometric_devices",
        )
        read_only_fields = fields

    def get_streak(self, user):
        return calculate_user_streak(user)

    def get_biometric_devices(self, user):
        return user.biometric_credentials.count()


class RegisterSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150, trim_whitespace=True)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=20)
    password = serializers.CharField(write_only=True, min_length=8, max_length=128)

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate_phone(self, value):
        value = value.strip()
        if not PHONE_RE.match(value):
            raise serializers.ValidationError("Enter a valid 10-digit Indian mobile number.")
        normalised = normalise_phone(value)
        if User.objects.filter(phone=normalised).exists():
            raise serializers.ValidationError("An account with this mobile number already exists.")
        return normalised

    def validate_password(self, value):
        # Django's own validators - length, commonness, all-numeric, similarity
        # to the user's own details. The frontend checks too, but that check is
        # a convenience and can be bypassed by anyone with curl.
        password_validation.validate_password(value)
        return value

    def create(self, validated_data):
        return User.objects.create_user(
            email=validated_data["email"],
            phone=validated_data["phone"],
            name=validated_data["name"],
            password=validated_data["password"],
        )


class LoginSerializer(serializers.Serializer):
    """Step 1 of login: prove the password. No token is issued here."""

    identifier = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        identifier = attrs["identifier"].strip().lower()

        lookup = Q(email=identifier)
        if PHONE_RE.match(attrs["identifier"].strip()):
            lookup |= Q(phone=normalise_phone(identifier))

        user = User.objects.filter(lookup).first()

        # One message for "no such user" and "wrong password" alike - telling
        # them apart turns this endpoint into a way to discover who has an
        # account. check_password is still run on a dummy hash when the user is
        # missing so both paths take a similar amount of time.
        if user is None:
            User().set_password(attrs["password"])
            raise serializers.ValidationError(
                {"detail": "Incorrect email/phone or password."}
            )
        if not user.check_password(attrs["password"]):
            raise serializers.ValidationError(
                {"detail": "Incorrect email/phone or password."}
            )
        if not user.is_active:
            raise serializers.ValidationError({"detail": "This account has been disabled."})

        attrs["user"] = user
        return attrs


class VerifyOtpSerializer(serializers.Serializer):
    """Step 2 of login, and the final step of registration."""

    email = serializers.EmailField()
    code = serializers.CharField(min_length=4, max_length=10)
    purpose = serializers.ChoiceField(
        choices=[OtpPurpose.SIGNUP_VERIFICATION, OtpPurpose.LOGIN],
        default=OtpPurpose.LOGIN,
    )

    def validate_email(self, value):
        return value.strip().lower()

    def validate_code(self, value):
        return value.strip()


class ResendOtpSerializer(serializers.Serializer):
    email = serializers.EmailField()
    purpose = serializers.ChoiceField(
        choices=[OtpPurpose.SIGNUP_VERIFICATION, OtpPurpose.LOGIN],
        default=OtpPurpose.LOGIN,
    )

    def validate_email(self, value):
        return value.strip().lower()


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return value.strip().lower()


class LinkedBankAccountSerializer(serializers.ModelSerializer):
    bank_name = serializers.SerializerMethodField()
    masked_number = serializers.CharField(source="masked_account_no", read_only=True)

    class Meta:
        model = LinkedBankAccount
        fields = ("id", "bank_name", "masked_number", "upi_id", "is_primary", "verified_at")
        read_only_fields = fields

    def get_bank_name(self, obj):
        # IFSC's first four characters identify the bank.
        return obj.ifsc[:4].upper() if obj.ifsc else "Linked account"
