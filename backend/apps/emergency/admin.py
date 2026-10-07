from django.contrib import admin

from .models import EmergencyApproval, EmergencyRequest, OtpVerification


class EmergencyApprovalInline(admin.TabularInline):
    model = EmergencyApproval
    extra = 0
    readonly_fields = ["user", "decision", "otp_verification", "decided_at"]
    can_delete = False


@admin.register(EmergencyRequest)
class EmergencyRequestAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "savings_account",
        "requested_by",
        "rupees",
        "status",
        "consensus",
        "created_at",
        "expires_at",
    ]
    list_filter = ["status", "created_at"]
    search_fields = ["savings_account__goal_name", "requested_by__email", "reason"]
    inlines = [EmergencyApprovalInline]
    readonly_fields = ["created_at", "resolved_at"]

    @admin.display(description="Amount")
    def rupees(self, obj):
        return "Rs {:,.2f}".format(obj.amount_paise / 100)

    @admin.display(description="Approvals")
    def consensus(self, obj):
        approved, rejected, required = obj.approval_state()
        return "{}/{} approved, {} rejected".format(approved, required, rejected)


@admin.register(OtpVerification)
class OtpVerificationAdmin(admin.ModelAdmin):
    list_display = ["id", "user", "purpose", "created_at", "expires_at", "attempts", "consumed_at"]
    list_filter = ["purpose", "created_at"]
    search_fields = ["user__email"]
    # otp_hash is deliberately not in list_display or search_fields.
    readonly_fields = ["otp_hash", "created_at"]
