"""Test-money credit for new accounts (see settings.TEST_WALLET_CREDIT_PAISE)."""
from django.conf import settings
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender=settings.AUTH_USER_MODEL, dispatch_uid="digibank_test_wallet_credit")
def credit_test_money(sender, instance, created, raw=False, **kwargs):
    amount = settings.TEST_WALLET_CREDIT_PAISE
    if not created or raw or amount <= 0:
        return
    from .models import WalletEntryKind, WalletTransaction

    with transaction.atomic():
        user = sender.objects.select_for_update().get(pk=instance.pk)
        user.digital_wallet_balance_paise += amount
        user.save(update_fields=["digital_wallet_balance_paise"])
        WalletTransaction.record(user, WalletEntryKind.TEST_CREDIT, amount, description="Test money for trying DigiBank")
    instance.digital_wallet_balance_paise = user.digital_wallet_balance_paise
