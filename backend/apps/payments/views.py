"""Deposits and the transaction ledger."""
import uuid

from django.db import transaction as db_transaction

from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.biometrics import biometric_gate
from apps.notifications.models import Notification, NotificationType
from apps.savings.models import OwnerType, SavingsAccount, SavingsAccountStatus
from .models import (
    Transaction,
    TransactionStatus,
    TransactionType,
    WalletEntryKind,
    WalletTransaction,
)
from .serializers import CreateDepositSerializer, TransactionSerializer, WalletTransactionSerializer


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def transactions(request):
    """
    The user's ledger, filtered server-side so a phone never downloads rows it
    is not going to show.
    """
    queryset = Transaction.objects.filter(user=request.user).select_related("savings_account")

    tx_type = request.query_params.get("type")
    tx_status = request.query_params.get("status")
    account = request.query_params.get("savings_account")
    search = request.query_params.get("search")

    if tx_type:
        queryset = queryset.filter(type=tx_type)
    if tx_status:
        queryset = queryset.filter(status=tx_status)
    if account:
        queryset = queryset.filter(savings_account_id=account)
    if search:
        from django.db.models import Q

        queryset = queryset.filter(
            Q(savings_account__goal_name__icontains=search) | Q(gateway_ref__icontains=search)
        )

    return Response(TransactionSerializer(queryset[:200], many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_deposit(request):
    """
    Pay into a goal or a club pool.

    TODO(gateway): this is where the Razorpay handshake goes. Today the row is
    written straight as SUCCESS; the real flow will create it as PENDING and let
    a gateway webhook settle it, which is why the frontend already renders a
    PENDING state.
    """
    serializer = CreateDepositSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    # The whole write is one transaction, and the account row is locked for the
    # duration. Two deposits landing at once would otherwise both read the same
    # starting balance and the second would overwrite the first's total.
    with db_transaction.atomic():
        user = request.user.__class__.objects.select_for_update().get(pk=request.user.pk)
        
        if user.digital_wallet_balance_paise < data["amount_paise"]:
            return Response(
                {"detail": "Insufficient funds in your digital wallet."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            account = SavingsAccount.objects.select_for_update().get(
                pk=data["savings_account_id"]
            )
        except SavingsAccount.DoesNotExist:
            return Response(
                {"detail": "That savings goal no longer exists."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Authorisation: your own goal, or a club you are actually a member of.
        # Never trust the id in the request body to belong to the caller.
        if account.owner_type == OwnerType.INDIVIDUAL:
            permitted = account.user_id == request.user.id
        else:
            permitted = account.group.members.filter(user=request.user).exists()

        if not permitted:
            return Response(
                {"detail": "You cannot pay into this goal."}, status=status.HTTP_403_FORBIDDEN
            )

        if account.status != SavingsAccountStatus.ACTIVE:
            return Response(
                {"detail": "This goal is no longer accepting deposits."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        new_balance = account.balance_paise + data["amount_paise"]
        account.balance_paise = new_balance
        if new_balance >= account.target_amount_paise:
            account.status = SavingsAccountStatus.UNLOCKED
        account.save(update_fields=["balance_paise", "status"])

        user.digital_wallet_balance_paise -= data["amount_paise"]
        user.save(update_fields=["digital_wallet_balance_paise"])

        ref = f"UPI-{uuid.uuid4().hex[:8].upper()}"
        WalletTransaction.record(
            user,
            WalletEntryKind.TO_SAVINGS,
            data["amount_paise"],
            description=f"Deposited into {account.goal_name}",
            reference=ref,
        )

        tx = Transaction.objects.create(
            savings_account=account,
            user=request.user,
            type=TransactionType.DEPOSIT,
            amount_paise=data["amount_paise"],
            balance_after_paise=new_balance,
            status=TransactionStatus.SUCCESS,
            gateway_ref=ref,
        )

        Notification.objects.create(
            user=request.user,
            type=NotificationType.DEPOSIT_RECEIVED,
            title="Deposit confirmed",
            body=f"Added to {account.goal_name}.",
            payload={"transaction": tx.id, "savings_account": account.id},
        )

        if account.status == SavingsAccountStatus.UNLOCKED:
            Notification.objects.create(
                user=request.user,
                type=NotificationType.GOAL_REACHED,
                title=f"{account.goal_name} is fully funded",
                body="This goal is now unlocked and ready to withdraw.",
                payload={"savings_account": account.id},
            )

    return Response(TransactionSerializer(tx).data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_withdrawal(request):
    """
    Withdraw funds from an unlocked savings goal into a linked bank account.

    Withdrawal Restrictions:
    1. Account must belong to the caller (Group savings require Emergency Approval flow).
    2. Account status must be UNLOCKED (target reached or deadline passed). ACTIVE accounts cannot be withdrawn directly.
    3. Minimum withdrawal: Rs 100 (10,000 paise).
    4. Maximum single withdrawal: Rs 1,00,000 (10,000,000 paise).
    5. Balance check: Cannot withdraw more than the available account balance.
    """
    from .serializers import CreateWithdrawalSerializer

    blocked = biometric_gate(request)
    if blocked:
        return blocked

    serializer = CreateWithdrawalSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    with db_transaction.atomic():
        user = request.user.__class__.objects.select_for_update().get(pk=request.user.pk)
        
        try:
            account = SavingsAccount.objects.select_for_update().get(
                pk=data["savings_account_id"]
            )
        except SavingsAccount.DoesNotExist:
            return Response(
                {"detail": "That savings goal no longer exists."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Restriction 1: Ownership check (Individual goals only; group goals require consensus via Emergency flow)
        if account.owner_type != OwnerType.INDIVIDUAL or account.user_id != request.user.id:
            return Response(
                {"detail": "Direct withdrawal is only allowed for your individual savings goals. Group savings require Emergency Approval consensus."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Restriction 2: THE LOCK RULE. Delegated to the model so a goal whose
        # deadline has passed opens even though no deposit flipped its status.
        if account.status == SavingsAccountStatus.ACTIVE and account.deadline_passed:
            account.status = SavingsAccountStatus.UNLOCKED
            account.save(update_fields=["status"])
        if account.status != SavingsAccountStatus.UNLOCKED or not account.is_withdrawal_allowed():
            return Response(
                {"detail": "Withdrawal restricted: Goal is still ACTIVE and locked. You can only withdraw from UNLOCKED goals or request an Emergency withdrawal."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Restriction 3: Balance check
        if data["amount_paise"] > account.balance_paise:
            return Response(
                {"detail": f"Insufficient balance. Available balance is Rs {account.balance_paise / 100:,.2f}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Process withdrawal
        new_balance = account.balance_paise - data["amount_paise"]
        account.balance_paise = new_balance
        if new_balance == 0:
            account.status = SavingsAccountStatus.WITHDRAWN
        account.save(update_fields=["balance_paise", "status"])

        user.digital_wallet_balance_paise += data["amount_paise"]
        user.save(update_fields=["digital_wallet_balance_paise"])

        ref = f"WDR-{uuid.uuid4().hex[:8].upper()}"
        WalletTransaction.record(
            user,
            WalletEntryKind.FROM_SAVINGS,
            data["amount_paise"],
            description=f"Withdrawn from {account.goal_name}",
            reference=ref,
        )

        tx = Transaction.objects.create(
            savings_account=account,
            user=request.user,
            type=TransactionType.WITHDRAWAL,
            amount_paise=data["amount_paise"],
            balance_after_paise=new_balance,
            status=TransactionStatus.SUCCESS,
            gateway_ref=ref,
        )

        Notification.objects.create(
            user=request.user,
            type=NotificationType.WITHDRAWAL_COMPLETED,
            title="Withdrawal processed",
            body=f"Rs {data['amount_paise'] / 100:,.2f} from {account.goal_name} is now in your wallet.",
            payload={"transaction": tx.id, "savings_account": account.id},
        )

    return Response(TransactionSerializer(tx).data, status=status.HTTP_201_CREATED)


def _bank_label(user, bank_id, required=False):
    """Describe the linked account for the statement, refusing someone else's."""
    from apps.accounts.models import LinkedBankAccount

    if not bank_id:
        return None if required else "your bank"
    bank = LinkedBankAccount.objects.filter(pk=bank_id, user=user).first()
    if bank is None:
        return None
    tail = bank.masked_account_no or bank.upi_id or "linked account"
    return f"{bank.bank_name or bank.ifsc[:4].upper()} {tail}"


def _kyc_gate(user):
    from apps.accounts.models import KycStatus

    if user.kyc_status != KycStatus.VERIFIED:
        return Response(
            {"detail": "Complete KYC verification before moving money in or out of DigiBank.", "code": "kyc_required"},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def wallet_transactions(request):
    """The wallet statement, newest first. ?kind=TOP_UP filters by entry kind."""
    queryset = WalletTransaction.objects.filter(user=request.user)
    kind = request.query_params.get("kind")
    if kind:
        queryset = queryset.filter(kind=kind)
    return Response(WalletTransactionSerializer(queryset[:200], many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def wallet_deposit(request):
    """
    SIMULATED top-up for development only. Refused whenever Razorpay is the
    provider or DEBUG is off - otherwise anyone could mint wallet money.
    Real top-ups go through topup_order / topup_verify below.
    """
    from .gateway import simulated_allowed
    from .serializers import WalletDepositSerializer

    if not simulated_allowed():
        return Response(
            {"detail": "Add money through the payment gateway.", "code": "use_gateway"},
            status=status.HTTP_403_FORBIDDEN,
        )
    blocked = _kyc_gate(request.user)
    if blocked:
        return blocked
    serializer = WalletDepositSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    label = _bank_label(request.user, data.get("linked_bank_account_id"))
    if label is None:
        return Response(
            {"detail": "That bank account is not linked to you."},
            status=status.HTTP_403_FORBIDDEN,
        )

    with db_transaction.atomic():
        user = request.user.__class__.objects.select_for_update().get(pk=request.user.pk)
        user.digital_wallet_balance_paise += data["amount_paise"]
        user.save(update_fields=["digital_wallet_balance_paise"])
        entry = WalletTransaction.record(
            user, WalletEntryKind.TOP_UP, data["amount_paise"],
            description=f"Added from {label} (test mode)",
        )

    return Response({
        "detail": f"Deposited Rs {data['amount_paise'] / 100:,.2f} into digital wallet.",
        "new_balance_paise": user.digital_wallet_balance_paise,
        "transaction": WalletTransactionSerializer(entry).data,
    }, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def wallet_withdraw(request):
    """
    Send wallet money to one of the user's own verified bank accounts.

    The wallet debit and statement row are real. The bank transfer itself is
    recorded for settlement but not yet pushed out automatically - automated
    payouts need a RazorpayX (business) account; see README.
    """
    from .serializers import WalletWithdrawalSerializer

    serializer = WalletWithdrawalSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    # Cheap checks first, so a failed KYC/bank check never burns a biometric approval.
    blocked = _kyc_gate(request.user)
    if blocked:
        return blocked
    label = _bank_label(request.user, data.get("linked_bank_account_id"), required=True)
    if label is None:
        return Response(
            {"detail": "Choose one of your own linked bank accounts.", "code": "bank_required"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    blocked = biometric_gate(request)
    if blocked:
        return blocked

    with db_transaction.atomic():
        user = request.user.__class__.objects.select_for_update().get(pk=request.user.pk)
        if user.digital_wallet_balance_paise < data["amount_paise"]:
            return Response({
                "detail": f"Insufficient digital wallet balance. Available: Rs {user.digital_wallet_balance_paise / 100:,.2f}"
            }, status=status.HTTP_400_BAD_REQUEST)

        user.digital_wallet_balance_paise -= data["amount_paise"]
        user.save(update_fields=["digital_wallet_balance_paise"])
        entry = WalletTransaction.record(
            user, WalletEntryKind.BANK_WITHDRAWAL, data["amount_paise"],
            description=f"Sent to {label}",
        )

    return Response({
        "detail": f"Withdrew Rs {data['amount_paise'] / 100:,.2f} from digital wallet.",
        "new_balance_paise": user.digital_wallet_balance_paise,
        "transaction": WalletTransactionSerializer(entry).data,
    }, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Real wallet top-ups through Razorpay
# ---------------------------------------------------------------------------
from django.conf import settings  # noqa: E402
from django.utils import timezone  # noqa: E402
from rest_framework.permissions import AllowAny  # noqa: E402

from apps.audit.models import AuditAction, AuditLog  # noqa: E402
from . import gateway  # noqa: E402
from .models import PaymentOrder, PaymentOrderStatus  # noqa: E402


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def payments_config(request):
    """What the top-up screen needs to know: which provider, and its public key."""
    provider = gateway.provider()
    return Response({
        "provider": provider,
        "key_id": settings.RAZORPAY_KEY_ID if provider == "razorpay" else "",
        "test_mode": provider == "simulated" or gateway.is_test_mode(),
        "simulated_allowed": gateway.simulated_allowed(),
        "min_paise": settings.WALLET_TOPUP_MIN_PAISE,
        "max_paise": settings.WALLET_TOPUP_MAX_PAISE,
    })


def credit_order(order_id, payment_id, method=""):
    """
    Idempotently credit a paid order to its owner's wallet. Safe to call from
    both the checkout callback and the webhook, in either order, any number of
    times: the row lock plus the CREATED -> PAID check means one credit only.
    """
    from apps.accounts.models import User

    with db_transaction.atomic():
        order = PaymentOrder.objects.select_for_update().filter(order_id=order_id).first()
        if order is None:
            return None
        if order.status == PaymentOrderStatus.PAID:
            return order
        user = User.objects.select_for_update().get(pk=order.user_id)
        user.digital_wallet_balance_paise += order.amount_paise
        user.save(update_fields=["digital_wallet_balance_paise"])
        source = order.bank_account.bank_name if order.bank_account else "Razorpay"
        via = f"{method.upper()} - " if method else ""
        entry = WalletTransaction.record(
            user,
            WalletEntryKind.TOP_UP,
            order.amount_paise,
            description=f"Added via {via}{source}",
            reference=payment_id,
        )
        order.status = PaymentOrderStatus.PAID
        order.payment_id = payment_id
        order.method = method[:20]
        order.wallet_transaction = entry
        order.paid_at = timezone.now()
        order.save(update_fields=["status", "payment_id", "method", "wallet_transaction", "paid_at"])
        Notification.objects.create(
            user=user,
            type=NotificationType.DEPOSIT_RECEIVED,
            title="Money added to your wallet",
            body=f"Rs {order.amount_paise / 100:,.2f} received. Ref {payment_id}.",
            payload={"payment_order": order.id},
        )
        AuditLog.record(AuditAction.WALLET_TOPUP, actor=user, entity=order, metadata={"payment_id": payment_id})
    return order


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def topup_order(request):
    blocked = _kyc_gate(request.user)
    if blocked:
        return blocked
    if gateway.provider() != "razorpay":
        return Response(
            {"detail": "The payment gateway is not configured on this server.", "code": "gateway_not_configured"},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    try:
        amount = int(request.data.get("amount_paise"))
    except (TypeError, ValueError):
        return Response({"detail": "Enter an amount."}, status=status.HTTP_400_BAD_REQUEST)
    lo, hi = settings.WALLET_TOPUP_MIN_PAISE, settings.WALLET_TOPUP_MAX_PAISE
    if not lo <= amount <= hi:
        return Response(
            {"detail": f"Top-ups must be between Rs {lo / 100:,.0f} and Rs {hi / 100:,.0f}."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from apps.accounts.models import LinkedBankAccount

    bank = None
    bank_id = request.data.get("linked_bank_account_id")
    if bank_id:
        bank = LinkedBankAccount.objects.filter(pk=bank_id, user=request.user).first()
        if bank is None:
            return Response({"detail": "That bank account is not linked to you."}, status=status.HTTP_403_FORBIDDEN)

    receipt = f"wallet-{request.user.pk}-{uuid.uuid4().hex[:10]}"
    try:
        rz = gateway.create_order(amount, receipt, {"user_id": str(request.user.pk), "purpose": "wallet_topup"})
    except gateway.GatewayError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

    PaymentOrder.objects.create(user=request.user, order_id=rz["id"], amount_paise=amount, bank_account=bank)
    user = request.user
    return Response({
        "order_id": rz["id"],
        "amount_paise": amount,
        "currency": "INR",
        "key_id": settings.RAZORPAY_KEY_ID,
        "test_mode": gateway.is_test_mode(),
        "prefill": {"name": user.name, "email": user.email, "contact": user.phone},
        # Razorpay netbanking codes match the IFSC bank prefix (HDFC, SBIN, ICIC...).
        "bank_code": bank.ifsc[:4] if bank and bank.ifsc else "",
    }, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def topup_verify(request):
    order_id = request.data.get("razorpay_order_id") or ""
    payment_id = request.data.get("razorpay_payment_id") or ""
    signature = request.data.get("razorpay_signature") or ""

    order = PaymentOrder.objects.filter(order_id=order_id, user=request.user).first()
    if order is None:
        return Response({"detail": "Unknown payment order."}, status=status.HTTP_404_NOT_FOUND)
    if not gateway.signature_is_valid(order_id, payment_id, signature):
        AuditLog.record(AuditAction.WALLET_TOPUP, actor=request.user, entity=order, metadata={"error": "bad_signature"})
        return Response({"detail": "Payment could not be verified."}, status=status.HTTP_400_BAD_REQUEST)

    method = ""
    try:
        method = gateway.fetch_payment(payment_id).get("method", "")
    except gateway.GatewayError:
        pass  # the signature already proves the payment; method is cosmetic

    order = credit_order(order_id, payment_id, method)
    user = request.user.__class__.objects.get(pk=request.user.pk)
    return Response({
        "detail": "Money added to your wallet.",
        "new_balance_paise": user.digital_wallet_balance_paise,
        "transaction": WalletTransactionSerializer(order.wallet_transaction).data,
    })


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def razorpay_webhook(request):
    """
    Server-to-server confirmation from Razorpay. Configure in the Razorpay
    dashboard: URL https://<your-domain>/api/payments/razorpay/webhook/,
    events payment.captured and order.paid, secret = RAZORPAY_WEBHOOK_SECRET.
    """
    if not gateway.webhook_signature_is_valid(request.body, request.headers.get("X-Razorpay-Signature")):
        return Response({"detail": "Invalid signature."}, status=status.HTTP_400_BAD_REQUEST)
    event = request.data.get("event")
    entity = ((request.data.get("payload") or {}).get("payment") or {}).get("entity") or {}
    if event in ("payment.captured", "order.paid") and entity.get("order_id"):
        credit_order(entity["order_id"], entity.get("id", ""), entity.get("method", ""))
    return Response({"ok": True})
