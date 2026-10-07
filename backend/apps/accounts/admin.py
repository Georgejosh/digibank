from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import Device, LinkedBankAccount, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ["email"]
    list_display = ["email", "name", "phone", "kyc_status", "is_active", "date_joined"]
    list_filter = ["kyc_status", "is_active", "is_staff"]
    search_fields = ["email", "name", "phone"]

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal info", {"fields": ("name", "phone", "kyc_status")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "name", "phone", "password1", "password2"),
            },
        ),
    )


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ["device_name", "user", "platform", "is_active", "last_used_at"]
    list_filter = ["platform", "is_active"]
    search_fields = ["device_name", "user__email"]
    # The public key is not a secret, but it is noise in a list view.
    readonly_fields = ["public_key", "created_at"]


@admin.register(LinkedBankAccount)
class LinkedBankAccountAdmin(admin.ModelAdmin):
    list_display = ["user", "bank_name", "masked_account_no", "ifsc", "account_holder_name", "is_primary", "verified_at"]
    list_filter = ["is_primary"]
    search_fields = ["user__email", "upi_id"]


# ---------------------------------------------------------------------------
# KYC review
# ---------------------------------------------------------------------------
from django.contrib import messages  # noqa: E402
from django.urls import reverse  # noqa: E402
from django.utils import timezone  # noqa: E402
from django.utils.html import format_html  # noqa: E402

from apps.audit.models import AuditAction, AuditLog  # noqa: E402
from apps.notifications.models import Notification, NotificationType  # noqa: E402
from .models import KycProfile, KycStatus  # noqa: E402


@admin.register(KycProfile)
class KycProfileAdmin(admin.ModelAdmin):
    """
    The reviewer's desk. Open a submission, compare the PAN card, address proof
    and selfie against the typed details and the automatic checks, then use the
    Approve / Reject actions from the list. Rejection needs a reason, which the
    user sees on their KYC screen.
    """

    list_display = ["user", "full_name", "kyc_status", "masked_pan", "checks_summary", "submitted_at", "reviewed_at"]
    list_filter = ["user__kyc_status", "occupation", "address_proof_type"]
    search_fields = ["user__email", "full_name", "pan_last4"]
    actions = ["approve", "reject"]
    readonly_fields = [
        "user", "full_name", "date_of_birth", "full_pan", "aadhaar_last4", "occupation",
        "address_line1", "address_line2", "city", "state", "pincode", "address_proof_type",
        "documents", "auto_checks", "consent_at", "submitted_at", "reviewed_at", "reviewed_by",
    ]
    fields = readonly_fields + ["rejection_reason"]
    exclude = ["pan_encrypted", "pan_document", "address_document", "selfie"]

    def has_add_permission(self, request):
        return False  # only users submit KYC

    @admin.display(description="Status")
    def kyc_status(self, obj):
        return obj.user.get_kyc_status_display()

    @admin.display(description="PAN")
    def full_pan(self, obj):
        return obj.pan_number

    @admin.display(description="Auto checks")
    def checks_summary(self, obj):
        checks = {k: v for k, v in (obj.auto_checks or {}).items() if v is not None}
        passed = sum(1 for v in checks.values() if v)
        return f"{passed}/{len(checks)} passed"

    @admin.display(description="Documents")
    def documents(self, obj):
        links = [
            (label, reverse("kyc-document", args=[obj.pk, field]))
            for field, label in (("pan_document", "PAN card"), ("address_document", "Address proof"), ("selfie", "Selfie"))
        ]
        return format_html(
            " &nbsp;|&nbsp; ".join('<a href="{}" target="_blank" rel="noopener">{}</a>' for _ in links),
            *[item for label, url in links for item in (url, label)],
        )

    def _decide(self, request, queryset, new_status):
        done = 0
        for profile in queryset.select_related("user"):
            if new_status == KycStatus.REJECTED and not profile.rejection_reason.strip():
                self.message_user(
                    request,
                    f"{profile.user.email}: open it, fill in 'Rejection reason', save, then reject.",
                    messages.ERROR,
                )
                continue
            user = profile.user
            user.kyc_status = new_status
            user.save(update_fields=["kyc_status"])
            profile.reviewed_at = timezone.now()
            profile.reviewed_by = request.user
            if new_status == KycStatus.VERIFIED:
                profile.rejection_reason = ""
            profile.save(update_fields=["reviewed_at", "reviewed_by", "rejection_reason"])
            approved = new_status == KycStatus.VERIFIED
            Notification.objects.create(
                user=user,
                type=NotificationType.KYC_UPDATE,
                title="KYC verified" if approved else "KYC needs attention",
                body=(
                    "Your identity is verified. You can now link a bank account and add money."
                    if approved
                    else f"Your KYC was not approved: {profile.rejection_reason}. Please resubmit."
                ),
            )
            AuditLog.record(
                AuditAction.KYC_APPROVED if approved else AuditAction.KYC_REJECTED,
                actor=request.user, entity=profile, metadata={"user": user.email},
            )
            done += 1
        if done:
            self.message_user(request, f"{done} KYC record(s) updated.", messages.SUCCESS)

    @admin.action(description="Approve selected KYC")
    def approve(self, request, queryset):
        self._decide(request, queryset, KycStatus.VERIFIED)

    @admin.action(description="Reject selected KYC (uses each record's rejection reason)")
    def reject(self, request, queryset):
        self._decide(request, queryset, KycStatus.REJECTED)
