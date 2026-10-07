"""
Module: Notification
Table:  notifications

In-app notification records. The push delivery itself (Expo push tokens) is a
separate concern; this table is the durable record so a user who was offline
still sees "Approval needed" when they next open the app.
"""
from django.conf import settings
from django.db import models


class NotificationType(models.TextChoices):
    APPROVAL_NEEDED = "APPROVAL_NEEDED", "Approval needed"
    GOAL_REACHED = "GOAL_REACHED", "Goal reached"
    DEPOSIT_RECEIVED = "DEPOSIT_RECEIVED", "Deposit received"
    WITHDRAWAL_COMPLETED = "WITHDRAWAL_COMPLETED", "Withdrawal completed"
    EMERGENCY_REJECTED = "EMERGENCY_REJECTED", "Emergency rejected"
    GROUP_INVITE = "GROUP_INVITE", "Group invite"
    DEADLINE_NEAR = "DEADLINE_NEAR", "Deadline approaching"
    LOCKER_MATURED = "LOCKER_MATURED", "Savings locker matured"
    LOCKER_PENALTY_APPLIED = "LOCKER_PENALTY_APPLIED", "Early-withdrawal penalty applied"
    KYC_UPDATE = "KYC_UPDATE", "KYC status update"


class Notification(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    type = models.CharField(max_length=32, choices=NotificationType.choices)
    title = models.CharField(max_length=150)
    body = models.TextField(blank=True)
    # Lets the app deep-link straight to the right screen, e.g.
    # {"screen": "EmergencyDetail", "request_id": 12}
    payload = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notifications"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "is_read", "-created_at"])]

    def __str__(self):
        return "{} -> {}".format(self.type, self.user_id)
