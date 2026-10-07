"""
Emergency withdrawal: request, and the unanimous approval that releases it.

THE RULE THIS MODULE ENFORCES
-----------------------------
Club money is locked until the target or the deadline. The single exception is
an emergency request that EVERY member approves. Not a majority - everyone -
and one rejection kills it outright.

The decision is made here, on the server, and nowhere else. The browser renders
the roll-call but never decides: a client-side tally could be flipped from the
devtools console.
"""
from django.db import IntegrityError, transaction as db_transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.notifications.models import Notification, NotificationType
from apps.payments.models import (
    Transaction,
    TransactionStatus,
    TransactionType,
    WalletEntryKind,
    WalletTransaction,
)
from apps.savings.models import OwnerType, SavingsAccount
from .models import EmergencyApproval, EmergencyRequest, EmergencyRequestStatus
from .serializers import (
    CreateEmergencyRequestSerializer,
    DecisionSerializer,
    EmergencyRequestSerializer,
)


from django.db.models import Q

def _visible_requests(user):
    """Requests on any club this user belongs to, or their own individual goals."""
    return (
        EmergencyRequest.objects.filter(
            Q(savings_account__group__members__user=user) | Q(savings_account__user=user)
        )
        .select_related("savings_account__group", "requested_by")
        .prefetch_related("approvals", "savings_account__group__members__user")
        .distinct()
    )


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def emergency_requests(request):
    if request.method == "POST":
        return _create_request(request)
    return Response(EmergencyRequestSerializer(_visible_requests(request.user), many=True).data)


def _create_request(request):
    serializer = CreateEmergencyRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    try:
        account = SavingsAccount.objects.select_related("group").get(
            pk=data["savings_account_id"]
        )
    except SavingsAccount.DoesNotExist:
        return Response({"detail": "That goal does not exist."}, status=status.HTTP_404_NOT_FOUND)

    if account.owner_type == OwnerType.GROUP:
        if account.group is None or not account.group.members.filter(user=request.user).exists():
            return Response(
                {"detail": "You are not a member of this club."}, status=status.HTTP_403_FORBIDDEN
            )
    elif account.owner_type == OwnerType.INDIVIDUAL:
        if account.user != request.user:
            return Response(
                {"detail": "You do not own this savings goal."}, status=status.HTTP_403_FORBIDDEN
            )

    if account.is_withdrawal_allowed():
        return Response(
            {"detail": "This goal is already unlocked - withdraw normally instead."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if data["amount_paise"] > account.balance_paise:
        return Response(
            {"detail": "Not enough balance for this emergency request."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        with db_transaction.atomic():
            emergency = EmergencyRequest.objects.create(
                savings_account=account,
                requested_by=request.user,
                amount_paise=data["amount_paise"],
                reason=data["reason"],
                status=EmergencyRequestStatus.PENDING,
            )
            # The requester implicitly approves their own request.
            EmergencyApproval.objects.create(
                request=emergency,
                user=request.user,
                decision=EmergencyApproval.Decision.APPROVE,
            )
            
            if emergency.has_full_consensus():
                _release_funds(emergency, account.group)
            elif account.group:
                _notify_members(
                    account.group,
                    exclude_user=request.user,
                    type=NotificationType.APPROVAL_NEEDED,
                    title=f"{request.user.name} requested an emergency withdrawal",
                    body=f"{account.group.name} - every member must approve before funds are released.",
                    payload={"emergency_request": emergency.id, "group": account.group.id},
                )
    except IntegrityError:
        # The uniq_pending_emergency_per_account constraint fired: one live
        # request per pool, so two members cannot race to drain it.
        return Response(
            {"detail": "This club already has a pending emergency request."},
            status=status.HTTP_409_CONFLICT,
        )

    emergency = _visible_requests(request.user).get(pk=emergency.pk)
    return Response(EmergencyRequestSerializer(emergency).data, status=status.HTTP_201_CREATED)


def _notify_members(group, *, exclude_user, **kwargs):
    Notification.objects.bulk_create(
        [
            Notification(user=member.user, **kwargs)
            for member in group.members.select_related("user").all()
            if member.user_id != exclude_user.id
        ]
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def approve(request, request_id):
    return _decide(request, request_id, EmergencyApproval.Decision.APPROVE)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def reject(request, request_id):
    return _decide(request, request_id, EmergencyApproval.Decision.REJECT)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def decide(request, request_id):
    serializer = DecisionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    return _decide(request, request_id, serializer.validated_data["decision"])


def _decide(request, request_id, decision):
    """
    Record one member's vote, and release the money only on full consensus.

    Follows the locking recipe documented on EmergencyApproval: if two members
    tap Approve at the same instant, both could otherwise see "all approved" and
    both release the funds. select_for_update() makes the second request wait at
    the row lock; by the time it proceeds the status is no longer PENDING, the
    .get() misses, and no second release happens.
    """
    with db_transaction.atomic():
        try:
            emergency = (
                EmergencyRequest.objects.select_for_update()
                .select_related("savings_account__group")
                .get(pk=request_id, status=EmergencyRequestStatus.PENDING)
            )
        except EmergencyRequest.DoesNotExist:
            return Response(
                {"detail": "That request is no longer open."},
                status=status.HTTP_409_CONFLICT,
            )

        group = emergency.savings_account.group
        if group is None or not group.members.filter(user=request.user).exists():
            return Response(
                {"detail": "You are not a member of this club."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if emergency.is_expired:
            emergency.status = EmergencyRequestStatus.EXPIRED
            emergency.resolved_at = timezone.now()
            emergency.save(update_fields=["status", "resolved_at"])
            return Response(
                {"detail": "That request has expired."}, status=status.HTTP_409_CONFLICT
            )

        try:
            EmergencyApproval.objects.create(
                request=emergency, user=request.user, decision=decision
            )
        except IntegrityError:
            # uniq_approval_per_member: a member cannot vote twice.
            return Response(
                {"detail": "You have already voted on this request."},
                status=status.HTTP_409_CONFLICT,
            )

        if decision == EmergencyApproval.Decision.REJECT:
            emergency.status = EmergencyRequestStatus.REJECTED
            emergency.resolved_at = timezone.now()
            emergency.save(update_fields=["status", "resolved_at"])
            _notify_members(
                group,
                exclude_user=request.user,
                type=NotificationType.EMERGENCY_REJECTED,
                title="Emergency request rejected",
                body=f"{request.user.name} rejected the request. The funds stay locked.",
                payload={"emergency_request": emergency.id},
            )
        elif emergency.has_full_consensus():
            _release_funds(emergency, group)

    emergency = _visible_requests(request.user).get(pk=emergency.pk)
    return Response(EmergencyRequestSerializer(emergency).data)


def _release_funds(emergency, group):
    """
    Every member has approved: move the money and close the request.

    Called only from inside the row lock in _decide().
    """
    account = SavingsAccount.objects.select_for_update().get(pk=emergency.savings_account_id)

    if emergency.amount_paise > account.balance_paise:
        # The pool shrank since the request was raised.
        emergency.status = EmergencyRequestStatus.REJECTED
        emergency.resolved_at = timezone.now()
        emergency.save(update_fields=["status", "resolved_at"])
        return

    new_balance = account.balance_paise - emergency.amount_paise
    account.balance_paise = new_balance
    account.save(update_fields=["balance_paise"])

    # Credit requester's digital wallet balance atomically
    requester = emergency.requested_by.__class__.objects.select_for_update().get(pk=emergency.requested_by_id)
    requester.digital_wallet_balance_paise += emergency.amount_paise
    requester.save(update_fields=["digital_wallet_balance_paise"])
    WalletTransaction.record(
        requester, WalletEntryKind.EMERGENCY_RELEASE, emergency.amount_paise,
        description=f"Emergency release from {account.goal_name}",
    )

    Transaction.objects.create(
        savings_account=account,
        user=emergency.requested_by,
        type=TransactionType.WITHDRAWAL,
        amount_paise=emergency.amount_paise,
        balance_after_paise=new_balance,
        status=TransactionStatus.SUCCESS,
        gateway_ref=f"EMG-{emergency.id}",
        emergency_request=emergency,
    )

    emergency.status = EmergencyRequestStatus.COMPLETED
    emergency.resolved_at = timezone.now()
    emergency.save(update_fields=["status", "resolved_at"])

    if group:
        Notification.objects.bulk_create(
            [
                Notification(
                    user=member.user,
                    type=NotificationType.WITHDRAWAL_COMPLETED,
                    title="Emergency withdrawal approved by everyone",
                    body=f"{emergency.requested_by.name}'s request was released from {group.name}.",
                    payload={"emergency_request": emergency.id},
                )
                for member in group.members.select_related("user").all()
            ]
        )
    else:
        Notification.objects.create(
            user=emergency.requested_by,
            type=NotificationType.WITHDRAWAL_COMPLETED,
            title="Emergency withdrawal approved",
            body=f"Your emergency request was released from {account.goal_name}.",
            payload={"emergency_request": emergency.id},
        )
