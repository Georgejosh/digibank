"""
Modules: Individual Savings  +  Group Savings
Tables:  savings_accounts, groups, group_members

MONEY RULE FOR THE WHOLE PROJECT
--------------------------------
Every amount is stored as a BigIntegerField of PAISE (1 rupee = 100 paise),
never as a float. Floats cannot represent 0.10 exactly, so repeated additions
drift and balances stop matching the ledger. Integers are exact.
Display formatting (paise -> "Rs 1,250.00") is the mobile app's job, not the
database's.
"""
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class GroupStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    COMPLETED = "COMPLETED", "Completed"
    CLOSED = "CLOSED", "Closed"


class SavingsGroup(models.Model):
    """
    A savings group. The Python class is called SavingsGroup (not Group) to
    avoid confusion with django.contrib.auth Group, but the real table name is
    "groups" exactly as the requirements document specifies.
    """

    name = models.CharField(max_length=150)
    creator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_groups",
    )
    status = models.CharField(
        max_length=16, choices=GroupStatus.choices, default=GroupStatus.ACTIVE
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "groups"

    def __str__(self):
        return self.name

    @property
    def member_count(self):
        return self.members.count()


class GroupMember(models.Model):
    class Role(models.TextChoices):
        CREATOR = "CREATOR", "Creator"
        MEMBER = "MEMBER", "Member"

    group = models.ForeignKey(
        SavingsGroup, on_delete=models.CASCADE, related_name="members"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="group_memberships",
    )
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.MEMBER)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "group_members"
        constraints = [
            # A user can appear in a group exactly once. This single line is
            # what makes "every member must consent" countable and correct --
            # without it a user could join twice and their approval would be
            # double-counted.
            models.UniqueConstraint(
                fields=["group", "user"], name="uniq_group_member"
            )
        ]

    def __str__(self):
        return f"{self.user} in {self.group}"


class OwnerType(models.TextChoices):
    INDIVIDUAL = "INDIVIDUAL", "Individual"
    GROUP = "GROUP", "Group"


class SavingsAccountStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"          # locked, still accepting deposits
    UNLOCKED = "UNLOCKED", "Unlocked"    # target hit or deadline passed
    WITHDRAWN = "WITHDRAWN", "Withdrawn"  # funds released, goal finished
    CLOSED = "CLOSED", "Closed"


class SavingsAccount(models.Model):
    """
    The savings pool that actually holds the locked balance. One table serves
    both individual and group goals, distinguished by owner_type -- this keeps
    the ledger, deposit and withdrawal code identical for both cases instead of
    duplicating every rule twice.
    """

    owner_type = models.CharField(max_length=12, choices=OwnerType.choices)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="savings_accounts",
    )
    group = models.OneToOneField(
        SavingsGroup,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="savings_account",
    )

    goal_name = models.CharField(max_length=150)
    target_amount_paise = models.BigIntegerField()
    balance_paise = models.BigIntegerField(default=0)
    deadline = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=12,
        choices=SavingsAccountStatus.choices,
        default=SavingsAccountStatus.ACTIVE,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "savings_accounts"
        constraints = [
            # The database itself refuses a malformed row. Application bugs
            # cannot create an INDIVIDUAL account that points at a group, or a
            # GROUP account with no group. Validation in Python can be skipped
            # by a stray script; a CHECK constraint cannot.
            models.CheckConstraint(
                check=(
                    models.Q(
                        owner_type=OwnerType.INDIVIDUAL,
                        user__isnull=False,
                        group__isnull=True,
                    )
                    | models.Q(
                        owner_type=OwnerType.GROUP,
                        user__isnull=True,
                        group__isnull=False,
                    )
                ),
                name="savings_owner_exactly_one",
            ),
            models.CheckConstraint(
                check=models.Q(target_amount_paise__gt=0),
                name="savings_target_positive",
            ),
            models.CheckConstraint(
                check=models.Q(balance_paise__gte=0),
                name="savings_balance_non_negative",
            ),
        ]

    def __str__(self):
        return f"{self.goal_name} ({self.get_owner_type_display()})"

    # -- Derived helpers -------------------------------------------------
    @property
    def progress_percent(self):
        if self.target_amount_paise <= 0:
            return 0
        return min(100, round(self.balance_paise * 100 / self.target_amount_paise, 2))

    @property
    def target_reached(self):
        return self.balance_paise >= self.target_amount_paise

    @property
    def deadline_passed(self):
        return self.deadline is not None and timezone.localdate() > self.deadline

    def is_withdrawal_allowed(self):
        """
        THE LOCK RULE. This is the single source of truth for the abstract's
        "restricting access to deposited funds until a predefined savings
        target or time-bound goal is achieved".

        It lives on the server, in one place. The mobile app may grey out a
        button for a nicer experience, but the app's opinion is never trusted:
        the API re-checks this before moving any money. Demonstrate this in your
        viva by calling the withdrawal endpoint with Postman on a locked goal
        and showing the 403.

        The ONLY other way out is an approved emergency request, which is
        handled in apps.emergency -- not here.
        """
        return self.target_reached or self.deadline_passed

    def member_user_ids(self):
        """Everyone who must consent to an emergency withdrawal."""
        if self.owner_type == OwnerType.INDIVIDUAL:
            return [self.user_id]
        return list(self.group.members.values_list("user_id", flat=True))
