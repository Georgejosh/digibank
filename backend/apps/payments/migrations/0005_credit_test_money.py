"""
Credits Rs 10,000 of test money to every existing user's wallet, once, with a
statement row so the wallet ledger still replays to the balance. Users who
already received test money are skipped.
"""
import uuid

from django.db import migrations

AMOUNT = 1_000_000  # paise = Rs 10,000


def credit(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    WalletTransaction = apps.get_model("payments", "WalletTransaction")
    for user in User.objects.all():
        if WalletTransaction.objects.filter(user=user, kind="TEST_CREDIT").exists():
            continue
        user.digital_wallet_balance_paise += AMOUNT
        user.save(update_fields=["digital_wallet_balance_paise"])
        WalletTransaction.objects.create(
            user=user,
            kind="TEST_CREDIT",
            amount_paise=AMOUNT,
            balance_after_paise=user.digital_wallet_balance_paise,
            reference=f"TST-{uuid.uuid4().hex[:10].upper()}",
            description="Test money for trying DigiBank",
        )


class Migration(migrations.Migration):
    dependencies = [
        ("payments", "0004_test_credit_kind"),
        ("accounts", "0006_kyc_realtime"),
    ]

    operations = [migrations.RunPython(credit, migrations.RunPython.noop)]
