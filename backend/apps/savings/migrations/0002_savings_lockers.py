# Hand-written migration for the Savings Locker feature.
# Adds three new tables:
#   savings_lockers       – the locker record and penalty engine
#   locker_ledger_entries – immutable double-entry ledger per locker
#   locker_audit_logs     – forensic audit trail per locker event

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("savings", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ------------------------------------------------------------------
        # 1. savings_lockers
        # ------------------------------------------------------------------
        migrations.CreateModel(
            name="SavingsLocker",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("idempotency_key", models.UUIDField(unique=True)),
                ("goal_name", models.CharField(max_length=150)),
                ("principal_paise", models.BigIntegerField()),
                (
                    "annual_interest_rate_bps",
                    models.PositiveIntegerField(
                        help_text="Annual interest rate in basis points. 600 = 6.00% p.a."
                    ),
                ),
                ("target_duration_months", models.PositiveSmallIntegerField()),
                ("lock_start_date", models.DateField()),
                ("maturity_date", models.DateField()),
                ("accrued_interest_paise", models.BigIntegerField(default=0)),
                ("interest_accrued_up_to", models.DateField(blank=True, null=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("ACTIVE", "Active (locked)"),
                            ("MATURED", "Matured"),
                            ("WITHDRAWN", "Withdrawn at maturity"),
                            ("EARLY_TERMINATED", "Early terminated (penalty applied)"),
                        ],
                        default="ACTIVE",
                        max_length=20,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("closed_at", models.DateTimeField(blank=True, null=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="savings_lockers",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "savings_lockers",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="savingslocker",
            index=models.Index(fields=["user", "status"], name="savings_loc_user_id_status_idx"),
        ),
        migrations.AddIndex(
            model_name="savingslocker",
            index=models.Index(fields=["maturity_date"], name="savings_loc_maturity_date_idx"),
        ),
        migrations.AddConstraint(
            model_name="savingslocker",
            constraint=models.CheckConstraint(
                check=models.Q(principal_paise__gt=0),
                name="locker_principal_positive",
            ),
        ),
        migrations.AddConstraint(
            model_name="savingslocker",
            constraint=models.CheckConstraint(
                check=models.Q(accrued_interest_paise__gte=0),
                name="locker_interest_non_negative",
            ),
        ),
        migrations.AddConstraint(
            model_name="savingslocker",
            constraint=models.CheckConstraint(
                check=models.Q(annual_interest_rate_bps__gt=0),
                name="locker_rate_positive",
            ),
        ),
        migrations.AddConstraint(
            model_name="savingslocker",
            constraint=models.CheckConstraint(
                check=models.Q(maturity_date__gt=models.F("lock_start_date")),
                name="locker_maturity_after_start",
            ),
        ),
        # ------------------------------------------------------------------
        # 2. locker_ledger_entries
        # ------------------------------------------------------------------
        migrations.CreateModel(
            name="LockerLedgerEntry",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "entry_type",
                    models.CharField(
                        choices=[
                            ("DEPOSIT", "Principal deposit"),
                            ("INTEREST_ACCRUAL", "Interest accrual"),
                            ("EARLY_WITHDRAWAL", "Early withdrawal payout"),
                            ("PENALTY_CHARGE", "Penalty charge (forfeited interest)"),
                            ("MATURITY_PAYOUT", "Maturity payout"),
                        ],
                        max_length=20,
                    ),
                ),
                ("debit_paise", models.BigIntegerField(default=0)),
                ("credit_paise", models.BigIntegerField(default=0)),
                ("balance_after_paise", models.BigIntegerField()),
                ("note", models.CharField(blank=True, max_length=255)),
                ("idempotency_key", models.UUIDField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "locker",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="ledger_entries",
                        to="savings.savingslocker",
                    ),
                ),
            ],
            options={
                "db_table": "locker_ledger_entries",
                "ordering": ["created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="lockerledgerentry",
            index=models.Index(
                fields=["locker", "created_at"], name="locker_ledg_locker_id_created_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="lockerledgerentry",
            index=models.Index(
                fields=["entry_type", "created_at"], name="locker_ledg_entry_type_idx"
            ),
        ),
        migrations.AddConstraint(
            model_name="lockerledgerentry",
            constraint=models.CheckConstraint(
                check=models.Q(debit_paise__gte=0),
                name="ledger_debit_non_negative",
            ),
        ),
        migrations.AddConstraint(
            model_name="lockerledgerentry",
            constraint=models.CheckConstraint(
                check=models.Q(credit_paise__gte=0),
                name="ledger_credit_non_negative",
            ),
        ),
        # ------------------------------------------------------------------
        # 3. locker_audit_logs
        # ------------------------------------------------------------------
        migrations.CreateModel(
            name="LockerAuditLog",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "action",
                    models.CharField(
                        choices=[
                            ("LOCKER_CREATED", "Locker created"),
                            ("INTEREST_ACCRUED", "Interest accrued"),
                            ("WITHDRAWAL_PREVIEW", "Withdrawal preview requested"),
                            ("WITHDRAWAL_EXECUTED", "Withdrawal executed"),
                            ("PENALTY_ASSESSED", "Penalty assessed"),
                        ],
                        max_length=32,
                    ),
                ),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("device_id", models.CharField(blank=True, max_length=150)),
                ("principal_snapshot_paise", models.BigIntegerField()),
                ("interest_snapshot_paise", models.BigIntegerField()),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "locker",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="audit_logs",
                        to="savings.savingslocker",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="locker_audit_logs",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "locker_audit_logs",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="lockerauditlog",
            index=models.Index(
                fields=["locker", "created_at"], name="locker_audi_locker_id_created_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="lockerauditlog",
            index=models.Index(
                fields=["user", "created_at"], name="locker_audi_user_id_created_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="lockerauditlog",
            index=models.Index(
                fields=["action", "created_at"], name="locker_audi_action_created_idx"
            ),
        ),
    ]
