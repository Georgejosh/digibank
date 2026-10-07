from django.contrib import admin

from .models import GroupMember, SavingsAccount, SavingsGroup


class GroupMemberInline(admin.TabularInline):
    model = GroupMember
    extra = 0


@admin.register(SavingsGroup)
class SavingsGroupAdmin(admin.ModelAdmin):
    list_display = ["name", "creator", "status", "member_count", "created_at"]
    list_filter = ["status"]
    search_fields = ["name", "creator__email"]
    inlines = [GroupMemberInline]


@admin.register(SavingsAccount)
class SavingsAccountAdmin(admin.ModelAdmin):
    list_display = [
        "goal_name",
        "owner_type",
        "owner_label",
        "rupees_balance",
        "rupees_target",
        "progress_percent",
        "deadline",
        "status",
        "withdrawal_allowed",
    ]
    list_filter = ["owner_type", "status"]
    search_fields = ["goal_name", "user__email", "group__name"]
    # Balance is derived from the ledger, never typed in by hand.
    readonly_fields = ["balance_paise", "created_at"]

    @admin.display(description="Owner")
    def owner_label(self, obj):
        return obj.user or obj.group

    @admin.display(description="Balance")
    def rupees_balance(self, obj):
        return "Rs {:,.2f}".format(obj.balance_paise / 100)

    @admin.display(description="Target")
    def rupees_target(self, obj):
        return "Rs {:,.2f}".format(obj.target_amount_paise / 100)

    @admin.display(boolean=True, description="Unlockable")
    def withdrawal_allowed(self, obj):
        return obj.is_withdrawal_allowed()
