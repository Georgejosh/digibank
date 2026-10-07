"""
Modules: Deposit & Payment  +  Transaction & Ledger
Table:   transactions

LEDGER RULE
-----------
This table is APPEND-ONLY. A row, once SUCCESS, is never updated or deleted.
A mistake is corrected by writing a new compensating row, exactly like a real
bank's general ledger. That is what makes the abstract's "auditable transaction
ledger" true rather than decorative.

balance_after_paise is a snapshot of the savings account balance immediately
after this row was applied. It lets you prove the balance is correct by replaying
the ledger, and makes a tampered row obvious because the chain stops adding up.
"""
from django.conf import settings
from django.db import models


class TransactionType(models.TextChoices):
    DEPOSIT = "DEPOSIT", "Deposit"
    WITHDRAWAL = "WITHDRAWAL", "Withdrawal"


class TransactionStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"    # gateway call started, not confirmed
    SUCCESS = "SUCCESS", "Success"    # money actually moved
    FAILED = "FAILED", "Failed"


class Transaction(models.Model):
    savings_account = models.ForeignKey(
        "savings.SavingsAccount",
        on_delete=models.PROTECT,
        related_name="transactions",
    )
    # Who initiated it. In a group goal this tells you which member deposited,
    # which is what drives the "contributions per member" screen.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="transactions",
    )
    type = models.CharField(max_length=12, choices=TransactionType.choices)
    amount_paise = models.BigIntegerField()
    balance_after_paise = models.BigIntegerField()

    # Razorpay/UPI sandbox reference, so every row can be reconciled with the
    # gateway's own report.
    gateway_ref = models.CharField(max_length=120, blank=True)
    status = models.CharField(
        max_length=10, choices=TransactionStatus.choices, default=TransactionStatus.PENDING
    )

    # Set when this withdrawal came from an approved emergency request. Null for
    # ordinary deposits and for normal unlocked withdrawals.
    emergency_request = models.ForeignKey(
        "emergency.EmergencyRequest",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="transactions",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "transactions"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["savings_account", "-created_at"]),
            models.Index(fields=["user", "-created_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=models.Q(amount_paise__gt=0),
                name="txn_amount_positive",
            ),
            # An idempotency guard: the same gateway reference can never be
            # recorded twice. If the network drops and the app retries the
            # callback, the second insert fails instead of crediting the money
            # a second time. This is the standard fix for double-credit bugs.
            models.UniqueConstraint(
                fields=["gateway_ref"],
                condition=~models.Q(gateway_ref=""),
                name="uniq_gateway_ref",
            ),
        ]

    def __str__(self):
        return f"{self.type} {self.amount_paise}p on #{self.savings_account_id}"

    @property
    def signed_amount_paise(self):
        """Deposits add, withdrawals subtract. Handy for statement views."""
        if self.type == TransactionType.WITHDRAWAL:
            return -self.amount_paise
        return self.amount_paise


# ---------------------------------------------------------------------------
# Digital wallet ledger
# ---------------------------------------------------------------------------

class WalletEntryKind(models.TextChoices):
    TOP_UP = "TOP_UP", "Added from bank"
    BANK_WITHDRAWAL = "BANK_WITHDRAWAL", "Withdrawn to bank"
    TO_SAVINGS = "TO_SAVINGS", "Moved into savings"
    FROM_SAVINGS = "FROM_SAVINGS", "Released from savings"
    # Term lockers were removed on 2026-10-06; these two stay so historical
    # statement rows still render with a label.
    TO_LOCKER = "TO_LOCKER", "Locked in term locker (retired)"
    FROM_LOCKER = "FROM_LOCKER", "Term locker payout (retired)"
    EMERGENCY_RELEASE = "EMERGENCY_RELEASE", "Emergency release"


# Kinds that add money to the wallet. Everything else takes money out.
WALLET_CREDIT_KINDS = {
    WalletEntryKind.TOP_UP,
    WalletEntryKind.FROM_SAVINGS,
    WalletEntryKind.FROM_LOCKER,
    WalletEntryKind.EMERGENCY_RELEASE,
}


class WalletTransaction(models.Model):
    """
    APPEND-ONLY statement for the digital wallet.

    users.digital_wallet_balance_paise is the running total; this table is the
    record of how it got there. Every view that changes the wallet balance
    writes exactly one row here inside the same atomic block, so replaying the
    rows for a user always lands on their current balance.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="wallet_transactions",
    )
    kind = models.CharField(max_length=20, choices=WalletEntryKind.choices)
    amount_paise = models.BigIntegerField()
    # Snapshot of the wallet balance immediately after this row.
    balance_after_paise = models.BigIntegerField()
    reference = models.CharField(max_length=40, unique=True)
    description = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "wallet_transactions"
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["user", "-created_at"])]
        constraints = [
            models.CheckConstraint(
                check=models.Q(amount_paise__gt=0),
                name="wallet_txn_amount_positive",
            ),
            models.CheckConstraint(
                check=models.Q(balance_after_paise__gte=0),
                name="wallet_txn_balance_non_negative",
            ),
        ]

    def __str__(self):
        return f"{self.kind} {self.amount_paise}p for user {self.user_id}"

    @property
    def is_credit(self):
        return self.kind in WALLET_CREDIT_KINDS

    @classmethod
    def record(cls, user, kind, amount_paise, description="", reference=None):
        """
        Write one statement row for a wallet change that has ALREADY been
        applied to `user` (a row-locked instance with the new balance).
        Prefixes make a reference readable on a receipt: TOP-, BNK-, SAV- ...
        """
        import uuid

        prefix = {
            WalletEntryKind.TOP_UP: "TOP",
            WalletEntryKind.BANK_WITHDRAWAL: "BNK",
            WalletEntryKind.TO_SAVINGS: "SAV",
            WalletEntryKind.FROM_SAVINGS: "REL",
            WalletEntryKind.TO_LOCKER: "LCK",
            WalletEntryKind.FROM_LOCKER: "LCP",
            WalletEntryKind.EMERGENCY_RELEASE: "EMG",
        }[kind]
        return cls.objects.create(
            user=user,
            kind=kind,
            amount_paise=amount_paise,
            balance_after_paise=user.digital_wallet_balance_paise,
            reference=reference or f"{prefix}-{uuid.uuid4().hex[:10].upper()}",
            description=description[:255],
        )


# ---------------------------------------------------------------------------
# Payment gateway orders (wallet top-ups)
# ---------------------------------------------------------------------------
class PaymentOrderStatus(models.TextChoices):
    CREATED = "CREATED", "Awaiting payment"
    PAID = "PAID", "Paid and credited"
    FAILED = "FAILED", "Failed"


class PaymentOrder(models.Model):
    """
    One Razorpay order per top-up attempt. The wallet is credited exactly once,
    when the order flips CREATED -> PAID under a row lock (see credit_order).
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="payment_orders")
    provider = models.CharField(max_length=20, default="razorpay")
    order_id = models.CharField(max_length=64, unique=True)
    payment_id = models.CharField(max_length=64, blank=True)
    amount_paise = models.BigIntegerField()
    status = models.CharField(max_length=10, choices=PaymentOrderStatus.choices, default=PaymentOrderStatus.CREATED)
    bank_account = models.ForeignKey(
        "accounts.LinkedBankAccount", on_delete=models.SET_NULL, null=True, blank=True
    )
    wallet_transaction = models.OneToOneField(
        WalletTransaction, on_delete=models.PROTECT, null=True, blank=True, related_name="payment_order"
    )
    method = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "payment_orders"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(check=models.Q(amount_paise__gt=0), name="payment_order_amount_positive"),
        ]

    def __str__(self):
        return f"{self.order_id} {self.status} {self.amount_paise}p"
