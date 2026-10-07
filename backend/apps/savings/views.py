"""Individual savings goals, clubs, and the dashboard roll-up."""
from django.db import transaction
from django.db.models import Sum
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import (
    GroupMember,
    GroupStatus,
    OwnerType,
    SavingsAccount,
    SavingsAccountStatus,
    SavingsGroup,
)
from .serializers import (
    ClubSerializer,
    CreateClubSerializer,
    CreateSavingsGoalSerializer,
    SavingsAccountSerializer,
    contribution_paise,
)


def _my_clubs(user):
    return (
        SavingsGroup.objects.filter(members__user=user)
        .select_related("savings_account")
        .prefetch_related("members__user")
        .distinct()
    )


# ---------------------------------------------------------------------------
# Individual goals
# ---------------------------------------------------------------------------
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def individual_savings(request):
    if request.method == "POST":
        serializer = CreateSavingsGoalSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        goal = serializer.save()
        return Response(SavingsAccountSerializer(goal).data, status=status.HTTP_201_CREATED)

    goals = SavingsAccount.objects.filter(
        owner_type=OwnerType.INDIVIDUAL, user=request.user
    ).order_by("-created_at")
    return Response(SavingsAccountSerializer(goals, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def deposit_targets(request):
    """
    Every ACTIVE account the user may pay into: their own goals plus the pooled
    account of each club they belong to.

    Unlocked accounts are excluded - once a goal has been reached, adding more
    money to it just traps funds that are already free to withdraw.
    """
    own = SavingsAccount.objects.filter(
        owner_type=OwnerType.INDIVIDUAL,
        user=request.user,
        status=SavingsAccountStatus.ACTIVE,
    )
    club_accounts = SavingsAccount.objects.filter(
        owner_type=OwnerType.GROUP,
        group__members__user=request.user,
        status=SavingsAccountStatus.ACTIVE,
    ).select_related("group")

    payload = SavingsAccountSerializer(own, many=True).data
    for account in club_accounts:
        row = SavingsAccountSerializer(account).data
        row["club_name"] = account.group.name
        payload.append(row)
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def withdrawal_targets(request):
    """
    Returns individual savings accounts that have balance > 0 and are UNLOCKED or ACTIVE.
    """
    accounts = SavingsAccount.objects.filter(
        owner_type=OwnerType.INDIVIDUAL,
        user=request.user,
        balance_paise__gt=0,
    ).order_by("-created_at")
    return Response(SavingsAccountSerializer(accounts, many=True).data)



# ---------------------------------------------------------------------------
# Clubs
# ---------------------------------------------------------------------------
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def clubs(request):
    if request.method == "POST":
        serializer = CreateClubSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # One transaction: a club without its pooled account, or without its
        # creator as a member, is a broken row nothing else can handle.
        with transaction.atomic():
            group = SavingsGroup.objects.create(
                name=data["name"], creator=request.user, status=GroupStatus.ACTIVE
            )
            SavingsAccount.objects.create(
                owner_type=OwnerType.GROUP,
                user=None,
                group=group,
                goal_name=data["goal_name"],
                target_amount_paise=data["target_amount_paise"],
                deadline=data.get("deadline"),
            )
            GroupMember.objects.create(
                group=group, user=request.user, role=GroupMember.Role.CREATOR
            )

        group = _my_clubs(request.user).get(pk=group.pk)
        payload = ClubSerializer(group, context={"request": request}).data

        # TODO(invites): create pending group_members rows and email each
        # address. Accepted and echoed back for now so the frontend contract is
        # already correct, but nothing is sent.
        payload["invited"] = data.get("invites", [])
        return Response(payload, status=status.HTTP_201_CREATED)

    return Response(
        ClubSerializer(_my_clubs(request.user), many=True, context={"request": request}).data
    )


# ---------------------------------------------------------------------------
# Dashboard roll-up
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_summary(request):
    """
    One aggregated call so the dashboard paints in a single round trip instead
    of five parallel requests on a phone connection.
    """
    from django.db.models import Count, Q
    from apps.accounts.serializers import calculate_user_streak
    from apps.emergency.models import EmergencyApproval, EmergencyRequest, EmergencyRequestStatus
    from apps.payments.models import Transaction
    from apps.payments.serializers import TransactionSerializer

    user = request.user

    # Single-pass aggregation for individual savings accounts
    own_goals = SavingsAccount.objects.filter(owner_type=OwnerType.INDIVIDUAL, user=user)
    goals_agg = own_goals.aggregate(
        total_balance=Sum("balance_paise"),
        locked_balance=Sum("balance_paise", filter=Q(status=SavingsAccountStatus.ACTIVE)),
        active_count=Count("id", filter=Q(status=SavingsAccountStatus.ACTIVE)),
    )
    individual_saved = goals_agg["total_balance"] or 0
    locked_goals = goals_agg["locked_balance"] or 0
    active_goals_count = goals_agg["active_count"] or 0

    my_clubs = list(_my_clubs(user))
    club_contributed = sum(
        contribution_paise(group.savings_account.id, user.id)
        for group in my_clubs
        if getattr(group, "savings_account", None)
    )

    # Requests still open where this user has not yet voted.
    decided_ids = EmergencyApproval.objects.filter(user=user).values_list("request_id", flat=True)
    pending_approvals = (
        EmergencyRequest.objects.filter(
            status=EmergencyRequestStatus.PENDING,
            savings_account__group__members__user=user,
        )
        .exclude(id__in=decided_ids)
        .distinct()
        .count()
    )

    recent = (
        Transaction.objects.filter(user=user)
        .select_related("savings_account")
        .order_by("-created_at")[:5]
    )

    return Response(
        {
            "total_saved_paise": individual_saved + club_contributed,
            "individual_saved_paise": individual_saved,
            "club_contributed_paise": club_contributed,
            "active_clubs": sum(1 for g in my_clubs if g.status == GroupStatus.ACTIVE),
            "individual_goals": active_goals_count,
            "locked_paise": locked_goals,
            "pending_approvals": pending_approvals,
            "streak": calculate_user_streak(user),
            "recent_activity": TransactionSerializer(recent, many=True).data,
        }
    )
