from django.contrib import admin

from .models import Transaction


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "created_at",
        "type",
        "rupees",
        "savings_account",
        "user",
        "status",
        "gateway_ref",
    ]
    list_filter = ["type", "status", "created_at"]
    search_fields = ["gateway_ref", "user__email", "savings_account__goal_name"]

    # The ledger is append-only. Making every field read-only in the admin means
    # even a superuser cannot quietly rewrite financial history through the UI.
    readonly_fields = [f.name for f in Transaction._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    @admin.display(description="Amount")
    def rupees(self, obj):
        return "Rs {:,.2f}".format(obj.amount_paise / 100)
