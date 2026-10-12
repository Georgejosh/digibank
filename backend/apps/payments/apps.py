from django.apps import AppConfig


class PaymentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.payments"
    label = "payments"
    verbose_name = "Deposit, Payment & Ledger"

    def ready(self):
        from . import signals  # noqa: F401  registers the test-money credit
