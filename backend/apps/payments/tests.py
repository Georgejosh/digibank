from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from apps.savings.models import SavingsAccount, OwnerType, SavingsAccountStatus
from apps.payments.models import Transaction, TransactionType

User = get_user_model()

class WithdrawalRestrictionTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            name="Test User",
            email="testuser@example.com",
            phone="9876543210",
            password="Password123"
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.active_goal = SavingsAccount.objects.create(
            owner_type=OwnerType.INDIVIDUAL,
            user=self.user,
            goal_name="Active Goal",
            target_amount_paise=1000000,
            balance_paise=500000,
            status=SavingsAccountStatus.ACTIVE
        )

        self.unlocked_goal = SavingsAccount.objects.create(
            owner_type=OwnerType.INDIVIDUAL,
            user=self.user,
            goal_name="Unlocked Goal",
            target_amount_paise=500000,
            balance_paise=500000,
            status=SavingsAccountStatus.UNLOCKED
        )

    def test_withdrawal_restricted_on_active_goal(self):
        res = self.client.post("/api/payments/withdrawals/", {
            "savings_account_id": self.active_goal.id,
            "amount_paise": 10000
        }, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("Goal is still ACTIVE and locked", res.data["detail"])

    def test_withdrawal_min_max_limits(self):
        # Under min (under Rs 100 / 10000 paise)
        res_min = self.client.post("/api/payments/withdrawals/", {
            "savings_account_id": self.unlocked_goal.id,
            "amount_paise": 5000
        }, format="json")
        self.assertEqual(res_min.status_code, 400)

        # Over max (over Rs 1,00,000 / 10000000 paise)
        res_max = self.client.post("/api/payments/withdrawals/", {
            "savings_account_id": self.unlocked_goal.id,
            "amount_paise": 15000000
        }, format="json")
        self.assertEqual(res_max.status_code, 400)

    def test_successful_withdrawal_on_unlocked_goal(self):
        res = self.client.post("/api/payments/withdrawals/", {
            "savings_account_id": self.unlocked_goal.id,
            "amount_paise": 100000 # Rs 1,000
        }, format="json")
        self.assertEqual(res.status_code, 201)
        self.unlocked_goal.refresh_from_db()
        self.assertEqual(self.unlocked_goal.balance_paise, 400000)


# The simulated top-up only exists while DEBUG is on (the test runner turns it off).
@override_settings(DEBUG=True, PAYMENT_PROVIDER="auto", RAZORPAY_KEY_ID="", RAZORPAY_KEY_SECRET="")
class WalletLedgerTests(TestCase):
    """Every wallet movement writes one statement row, and the rows replay to the balance."""

    def setUp(self):
        from apps.accounts.models import KycStatus, LinkedBankAccount

        self.user = User.objects.create_user(
            name="Ledger User", email="ledger@example.com", phone="9876500000", password="Password123"
        )
        self.user.kyc_status = KycStatus.VERIFIED
        self.user.save()
        self.bank = LinkedBankAccount.objects.create(
            user=self.user, masked_account_no="XXXX1234", ifsc="HDFC0000001", bank_name="HDFC Bank", is_primary=True
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.goal = SavingsAccount.objects.create(
            owner_type=OwnerType.INDIVIDUAL, user=self.user, goal_name="Bike",
            target_amount_paise=300000, status=SavingsAccountStatus.ACTIVE,
        )

    def _replayed_balance(self):
        from apps.payments.models import WalletTransaction

        total = 0
        for row in WalletTransaction.objects.filter(user=self.user).order_by("created_at", "id"):
            total += row.amount_paise if row.is_credit else -row.amount_paise
            self.assertEqual(total, row.balance_after_paise)
        return total

    def test_round_trip_through_savings_is_fully_recorded(self):
        self.client.post("/api/payments/wallet/deposit/", {"amount_paise": 500000}, format="json")
        # Deposit enough to reach the target, which unlocks the goal.
        self.client.post("/api/payments/deposits/", {"savings_account_id": self.goal.id, "amount_paise": 300000}, format="json")
        res = self.client.post("/api/payments/withdrawals/", {"savings_account_id": self.goal.id, "amount_paise": 100000}, format="json")
        self.assertEqual(res.status_code, 201)
        self.client.post("/api/payments/wallet/withdraw/", {"amount_paise": 50000, "linked_bank_account_id": self.bank.id}, format="json")

        self.user.refresh_from_db()
        self.assertEqual(self.user.digital_wallet_balance_paise, 250000)
        self.assertEqual(self._replayed_balance(), 250000)

        statement = self.client.get("/api/payments/wallet/transactions/").data
        self.assertEqual(
            [row["kind"] for row in statement],
            ["BANK_WITHDRAWAL", "FROM_SAVINGS", "TO_SAVINGS", "TOP_UP"],
        )

    def test_failed_deposit_writes_no_statement_row(self):
        res = self.client.post("/api/payments/deposits/", {"savings_account_id": self.goal.id, "amount_paise": 1000}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(self.client.get("/api/payments/wallet/transactions/").data, [])

    def test_deadline_passed_goal_can_be_withdrawn(self):
        import datetime

        self.goal.balance_paise = 100000
        self.goal.deadline = datetime.date(2020, 1, 1)
        self.goal.save()
        res = self.client.post("/api/payments/withdrawals/", {"savings_account_id": self.goal.id, "amount_paise": 100000}, format="json")
        self.assertEqual(res.status_code, 201)
        self.goal.refresh_from_db()
        self.assertEqual(self.goal.status, SavingsAccountStatus.WITHDRAWN)
