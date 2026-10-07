from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ["created_at", "action", "actor", "entity_type", "entity_id", "ip_address"]
    list_filter = ["action", "created_at"]
    search_fields = ["actor__email", "entity_type", "action"]
    readonly_fields = [f.name for f in AuditLog._meta.fields]
    date_hierarchy = "created_at"

    # Immutable by construction: no adding, no editing, no deleting.
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
