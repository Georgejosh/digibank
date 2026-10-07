"""Serializers for emergency withdrawal requests and their approvals."""
from rest_framework import serializers

from .models import EmergencyApproval, EmergencyRequest


class EmergencyRequestSerializer(serializers.ModelSerializer):
    savings_account_name = serializers.CharField(
        source="savings_account.goal_name", read_only=True
    )
    group = serializers.SerializerMethodField()
    group_name = serializers.SerializerMethodField()
    requested_by_name = serializers.CharField(source="requested_by.name", read_only=True)
    approvals = serializers.SerializerMethodField()

    class Meta:
        model = EmergencyRequest
        fields = (
            "id",
            "savings_account",
            "savings_account_name",
            "group",
            "group_name",
            "requested_by",
            "requested_by_name",
            "amount_paise",
            "reason",
            "status",
            "created_at",
            "expires_at",
            "resolved_at",
            "approvals",
        )
        read_only_fields = fields

    def get_group(self, obj):
        group = obj.savings_account.group
        return group.id if group else None

    def get_group_name(self, obj):
        group = obj.savings_account.group
        return group.name if group else ""

    def get_approvals(self, obj):
        """
        The full roll-call: every member who must decide, including the ones
        who have not yet. Showing only the votes cast would hide who the club
        is actually waiting on, which is the single most useful fact here.
        """
        group = obj.savings_account.group
        if group is None:
            return []

        decisions = {a.user_id: a for a in obj.approvals.select_related("user")}
        rows = []
        for member in group.members.select_related("user").all():
            decision = decisions.get(member.user_id)
            rows.append(
                {
                    "user": member.user_id,
                    "name": member.user.name,
                    "decision": decision.decision if decision else None,
                    "decided_at": decision.decided_at if decision else None,
                }
            )
        return rows


class CreateEmergencyRequestSerializer(serializers.Serializer):
    savings_account_id = serializers.IntegerField()
    amount_paise = serializers.IntegerField(min_value=1)
    reason = serializers.CharField(min_length=20, max_length=500, trim_whitespace=True)


class DecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=EmergencyApproval.Decision.choices)
