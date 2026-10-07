"""
Module: Audit & Admin
Table:  audit_logs

An immutable trail of every sensitive action: who did what, to which object,
from which device and IP, and when.

WHY THIS MATTERS FOR YOUR PROJECT
---------------------------------
The abstract promises "accountability". In a group savings app the realistic
dispute is a member saying "I never approved that withdrawal". This table is the
answer to that question. Nothing here is ever updated or deleted -- if you find
yourself writing an UPDATE against audit_logs, the design has gone wrong.
"""
from django.conf import settings
from django.db import models


class AuditAction(models.TextChoices):
    USER_REGISTERED = "USER_REGISTERED", "User registered"
    LOGIN_SUCCESS = "LOGIN_SUCCESS", "Login success"
    LOGIN_FAILED = "LOGIN_FAILED", "Login failed"
    DEVICE_REGISTERED = "DEVICE_REGISTERED", "Device registered"
    DEVICE_REVOKED = "DEVICE_REVOKED", "Device revoked"
    GOAL_CREATED = "GOAL_CREATED", "Goal created"
    DEPOSIT_MADE = "DEPOSIT_MADE", "Deposit made"
    WITHDRAWAL_MADE = "WITHDRAWAL_MADE", "Withdrawal made"
    EMERGENCY_RAISED = "EMERGENCY_RAISED", "Emergency raised"
    EMERGENCY_APPROVED = "EMERGENCY_APPROVED", "Emergency approved"
    EMERGENCY_REJECTED = "EMERGENCY_REJECTED", "Emergency rejected"
    EMERGENCY_RELEASED = "EMERGENCY_RELEASED", "Emergency funds released"
    OTP_VERIFIED = "OTP_VERIFIED", "OTP verified"
    BIOMETRIC_VERIFIED = "BIOMETRIC_VERIFIED", "Biometric verified"
    BIOMETRIC_FAILED = "BIOMETRIC_FAILED", "Biometric failed"
    # Savings Locker events
    LOCKER_CREATED      = "LOCKER_CREATED",      "Savings locker created"
    LOCKER_PREVIEW      = "LOCKER_PREVIEW",       "Withdrawal preview requested"
    LOCKER_WITHDRAWN    = "LOCKER_WITHDRAWN",     "Locker withdrawn"
    LOCKER_PENALTY      = "LOCKER_PENALTY",       "Early-withdrawal penalty assessed"
    # KYC, bank linking and real payments
    KYC_SUBMITTED = "KYC_SUBMITTED", "KYC submitted"
    KYC_APPROVED = "KYC_APPROVED", "KYC approved"
    KYC_REJECTED = "KYC_REJECTED", "KYC rejected"
    KYC_DOCUMENT_VIEWED = "KYC_DOCUMENT_VIEWED", "KYC document viewed by staff"
    BANK_LINKED = "BANK_LINKED", "Bank account linked"
    WALLET_TOPUP = "WALLET_TOPUP", "Wallet topped up via gateway"


class AuditLog(models.Model):
    # SET_NULL, not CASCADE: deleting a user must never erase the history of
    # what that user did. The log outlives the account.
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    action = models.CharField(max_length=32, choices=AuditAction.choices)

    # Generic pointer to the affected row, e.g. ("EmergencyRequest", 12).
    # Kept as plain text instead of a real FK so the log can reference anything
    # without gaining a dozen nullable foreign keys.
    entity_type = models.CharField(max_length=60, blank=True)
    entity_id = models.BigIntegerField(null=True, blank=True)

    metadata = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    device = models.ForeignKey(
        "accounts.Device",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "audit_logs"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["actor", "-created_at"]),
            models.Index(fields=["entity_type", "entity_id"]),
            models.Index(fields=["action", "-created_at"]),
        ]

    def __str__(self):
        return "{} by {} at {}".format(self.action, self.actor_id, self.created_at)

    @classmethod
    def record(cls, action, actor=None, entity=None, metadata=None, ip=None, device=None):
        """Convenience helper so views can log in one line."""
        return cls.objects.create(
            actor=actor,
            action=action,
            entity_type=entity.__class__.__name__ if entity is not None else "",
            entity_id=getattr(entity, "pk", None),
            metadata=metadata or {},
            ip_address=ip,
            device=device,
        )
