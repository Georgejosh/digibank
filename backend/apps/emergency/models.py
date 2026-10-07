"""
Modules: Emergency Withdrawal & Approval  +  Two-Factor Authentication (2FA)
Tables:  emergency_requests, emergency_approvals, otp_verifications

This is the most interesting module in the project and the one examiners will
push on. Three separate protections stack here:

  1. CONSENSUS   -- every group member must approve (emergency_approvals)
  2. 2FA / OTP   -- the approver proves they control their phone number
  3. BIOMETRIC   -- the final release is signed by the device hardware key

No single member can release pooled funds alone, which is exactly the guarantee
the abstract promises.
"""
import hashlib
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class EmergencyRequestStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    EXPIRED = "EXPIRED", "Expired"
    COMPLETED = "COMPLETED", "Completed"  # funds actually released


class EmergencyRequest(models.Model):
    savings_account = models.ForeignKey(
        "savings.SavingsAccount",
        on_delete=models.PROTECT,
        related_name="emergency_requests",
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="emergency_requests",
    )
    amount_paise = models.BigIntegerField()
    reason = models.TextField()
    status = models.CharField(
        max_length=12,
        choices=EmergencyRequestStatus.choices,
        default=EmergencyRequestStatus.PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "emergency_requests"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                check=models.Q(amount_paise__gt=0),
                name="emergency_amount_positive",
            ),
            # Only ONE live request per savings account at a time. Without this,
            # two members could open competing requests and race each other to
            # drain the pool.
            models.UniqueConstraint(
                fields=["savings_account"],
                condition=models.Q(status="PENDING"),
                name="uniq_pending_emergency_per_account",
            ),
        ]

    def __str__(self):
        return "Emergency #{} on account {}".format(self.pk, self.savings_account_id)

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(
                hours=settings.EMERGENCY_REQUEST_VALIDITY_HOURS
            )
        super().save(*args, **kwargs)

    # -- Consensus helpers ------------------------------------------------
    def required_approver_ids(self):
        """Every member of the group must consent -- the rule from the abstract."""
        return set(self.savings_account.member_user_ids())

    def approval_state(self):
        """
        Returns (approved_count, rejected_count, required_count).

        NOTE: this is a READ-ONLY helper for showing progress in the app. The
        actual decision to release money must NOT be made from this method
        alone -- see the concurrency warning on EmergencyApproval below.
        """
        required = self.required_approver_ids()
        decisions = self.approvals.filter(user_id__in=required)
        approved = decisions.filter(decision=EmergencyApproval.Decision.APPROVE).count()
        rejected = decisions.filter(decision=EmergencyApproval.Decision.REJECT).count()
        return approved, rejected, len(required)

    def has_full_consensus(self):
        approved, rejected, required = self.approval_state()
        return rejected == 0 and approved == required and required > 0

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at


class EmergencyApproval(models.Model):
    """
    One member vote on one request.

    CONCURRENCY WARNING -- READ THIS BEFORE WRITING THE VIEW
    --------------------------------------------------------
    If two members tap Approve at the same instant, both HTTP requests can run
    has_full_consensus() simultaneously, both see "all approved", and both
    release the money. That is a classic double-spend race.

    The fix, when you write the approval endpoint:

        with transaction.atomic():
            req = (EmergencyRequest.objects
                   .select_for_update()                  # row lock
                   .get(pk=request_id, status="PENDING"))
            EmergencyApproval.objects.create(...)        # unique constraint
            if req.has_full_consensus():
                release_funds(req)
                req.status = "COMPLETED"
                req.save()

    select_for_update() makes the second member request WAIT at the lock until
    the first has finished and committed. By the time it proceeds the status is
    no longer PENDING, so the .get() raises DoesNotExist and no second release
    happens. The UniqueConstraint below is the second line of defence: the same
    member physically cannot vote twice.
    """

    class Decision(models.TextChoices):
        APPROVE = "APPROVE", "Approve"
        REJECT = "REJECT", "Reject"

    request = models.ForeignKey(
        EmergencyRequest, on_delete=models.CASCADE, related_name="approvals"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="emergency_approvals",
    )
    decision = models.CharField(max_length=8, choices=Decision.choices)
    # Proof that this member passed OTP before their vote was accepted.
    otp_verification = models.ForeignKey(
        "emergency.OtpVerification",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approvals",
    )
    decided_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "emergency_approvals"
        constraints = [
            models.UniqueConstraint(
                fields=["request", "user"], name="uniq_approval_per_member"
            )
        ]

    def __str__(self):
        return "{} -> {} on #{}".format(self.user_id, self.decision, self.request_id)


class OtpPurpose(models.TextChoices):
    EMERGENCY_APPROVAL = "EMERGENCY_APPROVAL", "Emergency approval"
    WITHDRAWAL = "WITHDRAWAL", "Withdrawal"
    LOGIN = "LOGIN", "Login"
    DEVICE_REGISTRATION = "DEVICE_REGISTRATION", "Device registration"
    # Confirms the contact details given at sign-up before the account can be
    # used. Every login then requires a fresh LOGIN code on top of the
    # password, so possession of the inbox/phone is proved every single time.
    SIGNUP_VERIFICATION = "SIGNUP_VERIFICATION", "Signup verification"
    PASSWORD_RESET = "PASSWORD_RESET", "Password reset"


class OtpVerification(models.Model):
    """
    One issued OTP.

    SECURITY NOTE -- the OTP is stored HASHED, never in plain text. If someone
    reads the database (a leaked dump, a curious classmate with pgAdmin) they
    still cannot use the codes. We compare by hashing the submitted code and
    checking the hashes match. Same principle as password storage.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="otp_verifications",
    )
    purpose = models.CharField(max_length=24, choices=OtpPurpose.choices)
    otp_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "otp_verifications"
        indexes = [models.Index(fields=["user", "purpose", "-created_at"])]

    def __str__(self):
        return "OTP {} for user {}".format(self.purpose, self.user_id)

    @staticmethod
    def hash_code(raw_code):
        return hashlib.sha256(str(raw_code).encode()).hexdigest()

    @property
    def is_usable(self):
        return (
            self.consumed_at is None
            and timezone.now() <= self.expires_at
            and self.attempts < settings.OTP_MAX_ATTEMPTS
        )

    def verify(self, raw_code):
        """Returns True only once; a consumed OTP can never be reused."""
        if not self.is_usable:
            return False
        self.attempts += 1
        if self.otp_hash == self.hash_code(raw_code):
            self.consumed_at = timezone.now()
            self.save(update_fields=["attempts", "consumed_at"])
            return True
        self.save(update_fields=["attempts"])
        return False
