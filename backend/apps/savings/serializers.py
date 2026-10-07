"""Serializers for individual goals and group clubs."""
from django.db.models import Sum
from rest_framework import serializers

from .models import GroupMember, OwnerType, SavingsAccount, SavingsGroup


def contribution_paise(savings_account_id, user_id):
    """
    How much one member has put into a pool.

    Derived from the ledger rather than stored on group_members: a cached
    per-member total is one more number that can drift away from the
    transactions that produced it, and the ledger is the record we must not
    contradict.
    """
    from apps.payments.models import Transaction, TransactionStatus, TransactionType

    total = Transaction.objects.filter(
        savings_account_id=savings_account_id,
        user_id=user_id,
        type=TransactionType.DEPOSIT,
        status=TransactionStatus.SUCCESS,
    ).aggregate(total=Sum("amount_paise"))["total"]
    return total or 0


class SavingsAccountSerializer(serializers.ModelSerializer):
    progress_percent = serializers.FloatField(read_only=True)
    is_withdrawal_allowed = serializers.SerializerMethodField()

    class Meta:
        model = SavingsAccount
        fields = (
            "id",
            "owner_type",
            "goal_name",
            "target_amount_paise",
            "balance_paise",
            "deadline",
            "status",
            "created_at",
            "progress_percent",
            "is_withdrawal_allowed",
        )
        read_only_fields = fields

    def get_is_withdrawal_allowed(self, obj):
        return obj.is_withdrawal_allowed()


class CreateSavingsGoalSerializer(serializers.Serializer):
    goal_name = serializers.CharField(max_length=150, trim_whitespace=True)
    target_amount_paise = serializers.IntegerField(min_value=1)
    deadline = serializers.DateField(required=False, allow_null=True)

    def validate_deadline(self, value):
        from django.utils import timezone

        if value and value <= timezone.localdate():
            raise serializers.ValidationError("Pick a date in the future.")
        return value

    def create(self, validated_data):
        return SavingsAccount.objects.create(
            owner_type=OwnerType.INDIVIDUAL,
            user=self.context["request"].user,
            group=None,
            **validated_data,
        )


class GroupMemberSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="user.name", read_only=True)
    user = serializers.CharField(source="user_id", read_only=True)
    contributed_paise = serializers.SerializerMethodField()

    class Meta:
        model = GroupMember
        fields = ("id", "user", "name", "role", "joined_at", "contributed_paise")
        read_only_fields = fields

    def get_contributed_paise(self, member):
        account_id = self.context.get("savings_account_id")
        if account_id is None:
            account = getattr(member.group, "savings_account", None)
            account_id = account.id if account else None
        if account_id is None:
            return 0
        return contribution_paise(account_id, member.user_id)


class ClubSerializer(serializers.ModelSerializer):
    """A `groups` row flattened together with its GROUP savings_account."""

    members = serializers.SerializerMethodField()
    member_count = serializers.IntegerField(read_only=True)
    goal_name = serializers.SerializerMethodField()
    target_amount_paise = serializers.SerializerMethodField()
    balance_paise = serializers.SerializerMethodField()
    deadline = serializers.SerializerMethodField()
    account_status = serializers.SerializerMethodField()
    savings_account_id = serializers.SerializerMethodField()
    my_contribution_paise = serializers.SerializerMethodField()
    my_role = serializers.SerializerMethodField()

    class Meta:
        model = SavingsGroup
        fields = (
            "id",
            "name",
            "creator",
            "status",
            "created_at",
            "member_count",
            "members",
            "goal_name",
            "target_amount_paise",
            "balance_paise",
            "deadline",
            "account_status",
            "savings_account_id",
            "my_contribution_paise",
            "my_role",
        )
        read_only_fields = fields

    def _account(self, group):
        return getattr(group, "savings_account", None)

    def get_members(self, group):
        account = self._account(group)
        return GroupMemberSerializer(
            group.members.select_related("user").all(),
            many=True,
            context={**self.context, "savings_account_id": account.id if account else None},
        ).data

    def get_goal_name(self, group):
        account = self._account(group)
        return account.goal_name if account else ""

    def get_target_amount_paise(self, group):
        account = self._account(group)
        return account.target_amount_paise if account else 0

    def get_balance_paise(self, group):
        account = self._account(group)
        return account.balance_paise if account else 0

    def get_deadline(self, group):
        account = self._account(group)
        return account.deadline if account else None

    def get_account_status(self, group):
        account = self._account(group)
        return account.status if account else "ACTIVE"

    def get_savings_account_id(self, group):
        account = self._account(group)
        return account.id if account else None

    def get_my_contribution_paise(self, group):
        account = self._account(group)
        if account is None:
            return 0
        return contribution_paise(account.id, self.context["request"].user.id)

    def get_my_role(self, group):
        member = next(
            (m for m in group.members.all() if m.user_id == self.context["request"].user.id),
            None,
        )
        return member.role if member else "MEMBER"


class CreateClubSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150, trim_whitespace=True)
    goal_name = serializers.CharField(max_length=150, trim_whitespace=True)
    target_amount_paise = serializers.IntegerField(min_value=1)
    deadline = serializers.DateField(required=False, allow_null=True)
    invites = serializers.ListField(
        child=serializers.EmailField(), required=False, allow_empty=True, default=list
    )

    def validate_deadline(self, value):
        from django.utils import timezone

        if value and value <= timezone.localdate():
            raise serializers.ValidationError("Pick a date in the future.")
        return value
