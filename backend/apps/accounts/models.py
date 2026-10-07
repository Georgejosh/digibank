"""
Module: User Authentication & Registration  +  Biometric Verification
Tables: users, devices, linked_bank_accounts
"""
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class KycStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    SUBMITTED = "SUBMITTED", "Submitted"
    VERIFIED = "VERIFIED", "Verified"
    REJECTED = "REJECTED", "Rejected"


class UserManager(BaseUserManager):
    """Django needs to be told how to build a user when email is the login field."""

    use_in_migrations = True

    def create_user(self, email, phone, name, password=None, **extra):
        if not email:
            raise ValueError("Users must have an email address")
        if not phone:
            raise ValueError("Users must have a phone number")
        user = self.model(
            email=self.normalize_email(email).lower(),
            phone=phone,
            name=name,
            **extra,
        )
        # set_password hashes with PBKDF2. The raw password is never stored.
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, phone, name, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("kyc_status", KycStatus.VERIFIED)
        # A superuser is created from the command line by someone who already
        # has server access; making them wait for an emailed code would only
        # lock the project out of its own admin.
        extra.setdefault("is_verified", True)
        return self.create_user(email, phone, name, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    """Core account record. Replaces django.contrib.auth.models.User."""

    name = models.CharField(max_length=150)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, unique=True)
    kyc_status = models.CharField(
        max_length=16, choices=KycStatus.choices, default=KycStatus.PENDING
    )

    # Set once the SIGNUP_VERIFICATION code has been confirmed. Until then the
    # account exists but cannot log in - if registering alone granted a session
    # the OTP step would be decorative.
    is_verified = models.BooleanField(default=False)

    # Unrestricted digital wallet balance
    digital_wallet_balance_paise = models.BigIntegerField(default=0)

    # When on, every withdrawal (goal -> wallet, wallet -> bank) must carry a fresh biometric approval token. Enforced in the
    # money views via apps.accounts.biometrics.biometric_gate().
    require_biometric_for_withdrawals = models.BooleanField(default=False)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["phone", "name"]

    class Meta:
        db_table = "users"
        verbose_name = "user"
        verbose_name_plural = "users"

    def __str__(self):
        return f"{self.name} <{self.email}>"

    @property
    def is_kyc_verified(self):
        return self.kyc_status == KycStatus.VERIFIED


class Device(models.Model):
    """
    A phone the user has registered for biometric-signed withdrawals.

    SECURITY NOTE -- this is the heart of the "device-level cryptographic trust"
    requirement in the abstract. The private key is generated inside the phone's
    secure hardware (Android Keystore / iOS Secure Enclave) and NEVER leaves it.
    We store only the PUBLIC key. At withdrawal time the server sends a random
    challenge, the phone unlocks the private key with the fingerprint/face and
    signs the challenge, and the server verifies the signature against this
    public key.

    This is why we do NOT trust a client-sent flag like {"biometric_ok": true} --
    an attacker could simply send that flag from curl. A signature they cannot
    forge without the phone is real proof.
    """

    class Platform(models.TextChoices):
        ANDROID = "ANDROID", "Android"
        IOS = "IOS", "iOS"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="devices")
    device_name = models.CharField(max_length=120)
    platform = models.CharField(max_length=10, choices=Platform.choices)
    # PEM-encoded public key of the hardware-backed keypair.
    public_key = models.TextField()
    is_active = models.BooleanField(default=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "devices"
        indexes = [models.Index(fields=["user", "is_active"])]

    def __str__(self):
        return f"{self.device_name} ({self.user.email})"


class LinkedBankAccount(models.Model):
    """
    The user's real bank/UPI handle, used as source for deposits and
    destination for withdrawals.

    SECURITY NOTE -- we deliberately store only a MASKED account number. Full
    account numbers, card numbers and UPI PINs never touch our database; the
    payment gateway (Razorpay sandbox) holds those. Storing them would make this
    project a compliance problem rather than a demo.
    """

    class AccountType(models.TextChoices):
        SAVINGS = "SAVINGS", "Savings"
        CURRENT = "CURRENT", "Current"

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="linked_bank_accounts"
    )
    upi_id = models.CharField(max_length=120, blank=True)
    masked_account_no = models.CharField(max_length=30, blank=True)
    ifsc = models.CharField(max_length=15, blank=True)
    account_holder_name = models.CharField(max_length=150, blank=True)
    account_type = models.CharField(max_length=10, choices=AccountType.choices, default=AccountType.SAVINGS)
    # From the live IFSC directory lookup at link time.
    bank_name = models.CharField(max_length=120, blank=True)
    branch = models.CharField(max_length=150, blank=True)
    # Keyed HMAC of the full number (see crypto.fingerprint) - detects the same
    # account linked twice without storing the number.
    account_fingerprint = models.CharField(max_length=64, blank=True, db_index=True)
    is_primary = models.BooleanField(default=False)
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "linked_bank_accounts"
        constraints = [
            # At most one primary account per user. The condition means the
            # uniqueness only applies to rows where is_primary is true, so a
            # user can still have many non-primary accounts.
            models.UniqueConstraint(
                fields=["user"],
                condition=models.Q(is_primary=True),
                name="uniq_primary_bank_account_per_user",
            )
        ]

    def __str__(self):
        return self.upi_id or self.masked_account_no


# ---------------------------------------------------------------------------
# Biometric sign-in and approvals (WebAuthn / passkeys)
# ---------------------------------------------------------------------------
class BiometricCredential(models.Model):
    """
    One passkey created by a device's built-in biometric sensor - Windows
    Hello face or fingerprint, Face ID / Touch ID, Android fingerprint.

    The face or fingerprint itself NEVER leaves the device and is never seen by
    the browser or by us. The device's secure hardware checks it and, only on
    a match, signs our random challenge with a private key it keeps. We store
    the matching PUBLIC key and verify that signature. A copied photo, a
    replayed request or a client-side "biometric_ok": true flag cannot forge it.
    """

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="biometric_credentials")
    # base64url WebAuthn credential id, as the browser reports it.
    credential_id = models.CharField(max_length=512, unique=True)
    public_key = models.BinaryField()
    # Monotonic signature counter; a value that goes backwards means a cloned
    # authenticator (when the device implements counters at all).
    sign_count = models.BigIntegerField(default=0)
    transports = models.JSONField(default=list, blank=True)
    device_name = models.CharField(max_length=80)
    aaguid = models.CharField(max_length=64, blank=True)
    # True when the passkey is synced (iCloud Keychain, Google Password Manager).
    backed_up = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "biometric_credentials"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.device_name} for {self.user_id}"


class BiometricChallenge(models.Model):
    """
    A single-use random challenge handed to the browser. The signed response
    must come back within a few minutes and can be redeemed exactly once.
    """

    class Purpose(models.TextChoices):
        REGISTER = "REGISTER", "Register a device"
        LOGIN = "LOGIN", "Sign in"
        APPROVE = "APPROVE", "Approve a withdrawal"

    # Null for passwordless sign-in, where we do not yet know who is signing in.
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    purpose = models.CharField(max_length=10, choices=Purpose.choices)
    challenge = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "biometric_challenges"


class BiometricApproval(models.Model):
    """
    Proof that the user passed a biometric check moments ago. Spent by the
    first withdrawal that presents it; expires after two minutes regardless.
    Only a SHA-256 of the token is stored, so a database leak cannot replay it.
    """

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="biometric_approvals")
    token_hash = models.CharField(max_length=64, unique=True)
    credential = models.ForeignKey(BiometricCredential, on_delete=models.SET_NULL, null=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "biometric_approvals"


# ---------------------------------------------------------------------------
# KYC
# ---------------------------------------------------------------------------
def _kyc_upload_path(instance, filename):
    import uuid
    from pathlib import Path

    ext = Path(filename).suffix.lower()[:6]
    return f"kyc/{instance.user_id}/{uuid.uuid4().hex}{ext}"


class KycProfile(models.Model):
    """
    Know-Your-Customer record: identity, address, documents and a live selfie.

    users.kyc_status is the gate everything else reads; this table holds the
    evidence behind it. Review is done by staff in the Django admin.

    PRIVACY RULES
      - PAN is stored encrypted (apps.accounts.crypto), shown masked.
      - Only the LAST FOUR digits of Aadhaar are kept. UIDAI rules forbid
        storing full Aadhaar numbers outside a licensed Aadhaar Data Vault.
      - Documents live under PRIVATE_MEDIA_ROOT, which has no public URL;
        only staff can open them, through a permission-checked view.
    """

    class AddressProof(models.TextChoices):
        AADHAAR = "AADHAAR", "Aadhaar card"
        PASSPORT = "PASSPORT", "Passport"
        VOTER_ID = "VOTER_ID", "Voter ID"
        DRIVING_LICENCE = "DRIVING_LICENCE", "Driving licence"

    class Occupation(models.TextChoices):
        STUDENT = "STUDENT", "Student"
        SALARIED = "SALARIED", "Salaried"
        SELF_EMPLOYED = "SELF_EMPLOYED", "Self-employed"
        HOMEMAKER = "HOMEMAKER", "Homemaker"
        RETIRED = "RETIRED", "Retired"
        OTHER = "OTHER", "Other"

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="kyc")

    full_name = models.CharField(max_length=150, help_text="Exactly as printed on the PAN card")
    date_of_birth = models.DateField()
    pan_encrypted = models.TextField()
    pan_last4 = models.CharField(max_length=4)
    aadhaar_last4 = models.CharField(max_length=4, blank=True)
    occupation = models.CharField(max_length=16, choices=Occupation.choices)

    address_line1 = models.CharField(max_length=200)
    address_line2 = models.CharField(max_length=200, blank=True)
    city = models.CharField(max_length=80)
    state = models.CharField(max_length=80)
    pincode = models.CharField(max_length=6)

    pan_document = models.FileField(upload_to=_kyc_upload_path)
    address_proof_type = models.CharField(max_length=16, choices=AddressProof.choices)
    address_document = models.FileField(upload_to=_kyc_upload_path)
    selfie = models.FileField(upload_to=_kyc_upload_path)

    # Results of the automatic checks run at submission, for the reviewer.
    auto_checks = models.JSONField(default=dict, blank=True)

    consent_at = models.DateTimeField()
    submitted_at = models.DateTimeField()
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="kyc_reviews"
    )
    rejection_reason = models.CharField(max_length=300, blank=True)

    class Meta:
        db_table = "kyc_profiles"

    def __str__(self):
        return f"KYC for {self.user}"

    @property
    def pan_number(self):
        from .crypto import decrypt

        return decrypt(self.pan_encrypted)

    @property
    def masked_pan(self):
        return f"XXXXXX{self.pan_last4}"
