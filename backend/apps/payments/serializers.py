"""Serializers for the ledger and the deposit flow."""
from rest_framework import serializers

from .models import Transaction, WalletTransaction


class TransactionSerializer(serializers.ModelSerializer):
    savings_account_name = serializers.CharField(source="savings_account.goal_name", read_only=True)

    class Meta:
        model = Transaction
        fields = (
            "id",
            "savings_account",
            "savings_account_name",
            "user",
            "type",
            "amount_paise",
            "balance_after_paise",
            "gateway_ref",
            "status",
            "emergency_request",
            "created_at",
        )
        read_only_fields = fields


class CreateDepositSerializer(serializers.Serializer):
    savings_account_id = serializers.IntegerField()
    amount_paise = serializers.IntegerField(min_value=1)
    linked_bank_account_id = serializers.IntegerField(required=False, allow_null=True)

    def validate_amount_paise(self, value):
        # 2,00,000 rupees, matching the frontend's single-deposit ceiling.
        if value > 20_000_000:
            raise serializers.ValidationError("Single deposit limit is Rs 2,00,000.")
        return value


class CreateWithdrawalSerializer(serializers.Serializer):
    savings_account_id = serializers.IntegerField()
    amount_paise = serializers.IntegerField(min_value=10000)  # Min Rs 100
    linked_bank_account_id = serializers.IntegerField(required=False, allow_null=True)

    def validate_amount_paise(self, value):
        # 1,00,000 rupees max single withdrawal restriction
        if value > 10_000_000:
            raise serializers.ValidationError("Maximum single withdrawal limit is Rs 1,00,000.")
        return value

class WalletDepositSerializer(serializers.Serializer):
    amount_paise = serializers.IntegerField(min_value=1)
    linked_bank_account_id = serializers.IntegerField(required=False, allow_null=True)

class WalletWithdrawalSerializer(serializers.Serializer):
    amount_paise = serializers.IntegerField(min_value=1)
    linked_bank_account_id = serializers.IntegerField(required=False, allow_null=True)



class WalletTransactionSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    is_credit = serializers.BooleanField(read_only=True)

    class Meta:
        model = WalletTransaction
        fields = (
            "id",
            "kind",
            "kind_label",
            "is_credit",
            "amount_paise",
            "balance_after_paise",
            "reference",
            "description",
            "created_at",
        )
        read_only_fields = fields
