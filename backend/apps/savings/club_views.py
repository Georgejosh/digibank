"""
Club membership: invites by e-mail, join requests by code, the equal split.

WHO MAY DO WHAT
---------------
* Only the creator invites, accepts join requests, turns the split on or off
  and changes the join code.
* An invite is accepted or declined only by the account that owns the invited
  e-mail address - never by the creator on their behalf.
* A join request is accepted or declined only by the creator.

Nobody becomes a member on one person's say-so. Membership is serious here:
every member's approval is required before an emergency withdrawal, so a
stranger slipped into a club could hold everyone's money hostage.
"""
import html
import math

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from apps.notifications.delivery import send_email_quietly
from apps.notifications.models import Notification, NotificationType

from .models import (
    ClubInvite,
    ClubInviteKind,
    ClubInviteStatus,
    GroupMember,
    SavingsAccountStatus,
    SavingsGroup,
    new_join_code,
    normalise_join_code,
)

MAX_INVITES_PER_CALL = 20


class ClubActionThrottle(UserRateThrottle):
    """Invites send e-mail and codes can be guessed - keep both slow."""

    rate = "60/hour"


# ---------------------------------------------------------------------------
# Money maths
# ---------------------------------------------------------------------------
def contributions_by_user(savings_account_id):
    """{user_id: paise deposited} in one query, straight from the ledger."""
    from apps.payments.models import Transaction, TransactionStatus, TransactionType

    rows = (
        Transaction.objects.filter(
            savings_account_id=savings_account_id,
            type=TransactionType.DEPOSIT,
            status=TransactionStatus.SUCCESS,
        )
        .values("user_id")
        .annotate(total=Sum("amount_paise"))
    )
    return {row["user_id"]: row["total"] or 0 for row in rows}


def months_left(deadline):
    """Whole months (at least 1) until the lock period ends, or None."""
    if deadline is None:
        return None
    days = (deadline - timezone.localdate()).days
    return max(1, math.ceil(days / 30)) if days > 0 else 1


def split_plan(group, account, member_count):
    """
    Equal split: target / members, rounded UP to the paisa so the shares never
    add up to less than the target. Returns None while the split is off.
    """
    if not group.split_equally or account is None or member_count <= 0:
        return None
    share = math.ceil(account.target_amount_paise / member_count)
    return {"share_paise": share, "months_left": months_left(account.deadline)}


def member_split(plan, contributed):
    if plan is None:
        return None
    remaining = max(0, plan["share_paise"] - contributed)
    months = plan["months_left"]
    return {
        "share_paise": plan["share_paise"],
        "remaining_paise": remaining,
        "per_month_paise": math.ceil(remaining / months) if months else remaining,
        "paid_up": remaining == 0,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _club_link(group=None):
    base = settings.FRONTEND_URL.rstrip("/")
    return f"{base}/app/clubs/{group.pk}" if group else f"{base}/app/clubs"


def _notify(user, title, body, group, **extra):
    Notification.objects.create(
        user=user,
        type=NotificationType.GROUP_INVITE,
        title=title[:150],
        body=body,
        payload={"screen": "ClubDetail", "club_id": group.pk, **extra},
    )


def _mail(to_email, to_name, subject, lines, button_text, link):
    """A short branded e-mail; failures never block the in-app flow."""
    safe = "".join(f"<p>{html.escape(line)}</p>" for line in lines)
    body_html = f"""<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;color:#1A2227">
  <h2 style="color:#145F65;margin:0 0 16px">DigiBank</h2>
  {safe}
  <p style="margin:24px 0"><a href="{html.escape(link)}" style="background:#145F65;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">{html.escape(button_text)}</a></p>
  <p style="color:#6B7C87;font-size:13px">Not expecting this? You can ignore it - nobody joins a club without accepting.</p>
</div>"""
    text = "\n\n".join(lines) + f"\n\n{button_text}: {link}\n"
    return send_email_quietly(to_email, to_name, subject, body_html, text)


def _member_club(user, club_id):
    return get_object_or_404(
        SavingsGroup.objects.select_related("savings_account", "creator"),
        pk=club_id,
        members__user=user,
    )


def _creator_club(user, club_id):
    group = _member_club(user, club_id)
    if group.creator_id != user.id:
        return None
    return group


def _forbidden(msg="Only the club creator can do this."):
    return Response({"detail": msg}, status=status.HTTP_403_FORBIDDEN)


def _club_open(group):
    account = getattr(group, "savings_account", None)
    return account is not None and account.status == SavingsAccountStatus.ACTIVE


def _add_member(group, user):
    GroupMember.objects.get_or_create(
        group=group, user=user, defaults={"role": GroupMember.Role.MEMBER}
    )


def invite_row(invite):
    return {
        "id": invite.id,
        "kind": invite.kind,
        "email": invite.email,
        "name": invite.user.name if invite.user_id else "",
        "has_account": invite.user_id is not None,
        "status": invite.status,
        "email_sent": invite.email_sent,
        "created_at": invite.created_at,
        "responded_at": invite.responded_at,
    }


def send_invites(group, inviter, emails):
    """
    Invite each address. Existing DigiBank users get an in-app invite plus an
    e-mail; unknown addresses get an e-mail asking them to sign up with that
    address, and the invite waits for them. Returns one result row per address.
    """
    User = get_user_model()
    member_emails = {
        e.lower() for e in group.members.values_list("user__email", flat=True)
    }
    results = []
    seen = set()
    for raw in emails:
        email = raw.strip().lower()
        if not email or email in seen:
            continue
        seen.add(email)
        if email in member_emails:
            results.append({"email": email, "result": "already_member"})
            continue
        invitee = User.objects.filter(email__iexact=email).first()
        try:
            with transaction.atomic():
                invite = ClubInvite.objects.create(
                    group=group, kind=ClubInviteKind.INVITE, email=email,
                    user=invitee, invited_by=inviter,
                )
        except IntegrityError:
            results.append({"email": email, "result": "already_pending"})
            continue

        if invitee is not None:
            _notify(
                invitee,
                f"{inviter.name} invited you to {group.name}",
                f"Join the club saving for {group.savings_account.goal_name}. Accept or decline from Clubs.",
                group, invite_id=invite.id,
            )
            lines = [
                f"Hi {invitee.name},",
                f"{inviter.name} has invited you to join the savings club “{group.name}” on DigiBank.",
                "Open DigiBank and go to Clubs to accept or decline the invitation.",
            ]
            button, link = "Open my invitations", _club_link()
        else:
            lines = [
                "Hello,",
                f"{inviter.name} has invited you to join the savings club “{group.name}” on DigiBank.",
                f"Create a free DigiBank account with this e-mail address ({email}); the invitation will be waiting under Clubs.",
            ]
            button, link = "Create my DigiBank account", f"{settings.FRONTEND_URL.rstrip('/')}/register"
        invite.email_sent = _mail(
            email, invitee.name if invitee else "", f"{inviter.name} invited you to a DigiBank club",
            lines, button, link,
        )
        invite.save(update_fields=["email_sent"])
        results.append({"email": email, "result": "invited", "has_account": invitee is not None})
    return results


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
class InviteSerializer(serializers.Serializer):
    emails = serializers.ListField(
        child=serializers.EmailField(), allow_empty=False, max_length=MAX_INVITES_PER_CALL
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([ClubActionThrottle])
def club_invite(request, club_id):
    group = _creator_club(request.user, club_id)
    if group is None:
        return _forbidden("Only the club creator can invite people.")
    if not _club_open(group):
        return Response({"detail": "This club has unlocked and is no longer taking members."},
                        status=status.HTTP_400_BAD_REQUEST)
    data = InviteSerializer(data=request.data)
    data.is_valid(raise_exception=True)
    results = send_invites(group, request.user, data.validated_data["emails"])
    return Response({"results": results})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def club_split(request, club_id):
    group = _creator_club(request.user, club_id)
    if group is None:
        return _forbidden("Only the club creator can change the split.")
    enabled = bool(request.data.get("enabled"))
    if group.split_equally != enabled:
        group.split_equally = enabled
        group.save(update_fields=["split_equally"])
        if enabled:
            count = group.members.count()
            plan = split_plan(group, group.savings_account, count)
            share = plan["share_paise"] / 100
            for member in group.members.select_related("user").exclude(user=request.user):
                _notify(
                    member.user,
                    f"{group.name} is now split equally",
                    f"Your share is ₹{share:,.2f} of the target, due before the lock period ends.",
                    group,
                )
    return Response({"split_equally": group.split_equally})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def club_new_code(request, club_id):
    """Retire a leaked code. Requests already made with the old one stay."""
    group = _creator_club(request.user, club_id)
    if group is None:
        return _forbidden()
    for _ in range(5):
        group.join_code = new_join_code()
        try:
            with transaction.atomic():
                group.save(update_fields=["join_code"])
            break
        except IntegrityError:
            continue
    return Response({"join_code": group.display_code})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([ClubActionThrottle])
def club_join(request):
    """Ask to join with a club code. The creator decides."""
    code = normalise_join_code(request.data.get("code"))
    group = (
        SavingsGroup.objects.select_related("savings_account", "creator")
        .filter(join_code=code)
        .first()
        if len(code) == 8
        else None
    )
    if group is None:
        return Response({"detail": "No club has that code. Check it with the club creator."},
                        status=status.HTTP_404_NOT_FOUND)
    user = request.user
    if group.members.filter(user=user).exists():
        return Response({"detail": f"You are already a member of {group.name}."},
                        status=status.HTTP_400_BAD_REQUEST)
    if not _club_open(group):
        return Response({"detail": "This club has unlocked and is no longer taking members."},
                        status=status.HTTP_400_BAD_REQUEST)

    email = user.email.lower()
    with transaction.atomic():
        pending = (
            ClubInvite.objects.select_for_update()
            .filter(group=group, email=email, status=ClubInviteStatus.PENDING)
            .first()
        )
        if pending and pending.kind == ClubInviteKind.INVITE:
            # The creator already invited this person - the code is just a
            # second way of saying yes.
            pending.status = ClubInviteStatus.ACCEPTED
            pending.user = user
            pending.responded_at = timezone.now()
            pending.save(update_fields=["status", "user", "responded_at"])
            _add_member(group, user)
            _notify(group.creator, f"{user.name} joined {group.name}",
                    "They accepted your invitation.", group)
            return Response({"result": "joined", "club_id": group.pk, "club_name": group.name})
        if pending:
            return Response({"result": "already_requested", "club_name": group.name})
        request_row = ClubInvite.objects.create(
            group=group, kind=ClubInviteKind.JOIN_REQUEST, email=email, user=user
        )

    _notify(group.creator, f"{user.name} wants to join {group.name}",
            f"{user.name} ({user.email}) used your club code. Accept or decline from the club page.",
            group, invite_id=request_row.id)
    request_row.email_sent = _mail(
        group.creator.email, group.creator.name, f"{user.name} asked to join {group.name}",
        [f"Hi {group.creator.name},",
         f"{user.name} ({user.email}) used your club code and asked to join “{group.name}”.",
         "They will not become a member until you accept."],
        "Review the request", _club_link(group),
    )
    request_row.save(update_fields=["email_sent"])
    return Response({"result": "requested", "club_name": group.name}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_invitations(request):
    """Invites waiting for me, and the join requests I have made."""
    user = request.user
    invites = (
        ClubInvite.objects.filter(
            kind=ClubInviteKind.INVITE, email=user.email.lower(), status=ClubInviteStatus.PENDING
        )
        .select_related("group__savings_account", "invited_by")
        .exclude(group__members__user=user)
    )
    requests = (
        ClubInvite.objects.filter(kind=ClubInviteKind.JOIN_REQUEST, user=user)
        .select_related("group__savings_account")[:20]
    )

    def club_bits(invite):
        account = getattr(invite.group, "savings_account", None)
        return {
            "club_id": invite.group_id,
            "club_name": invite.group.name,
            "goal_name": account.goal_name if account else "",
            "target_amount_paise": account.target_amount_paise if account else 0,
            "deadline": account.deadline if account else None,
            "member_count": invite.group.members.count(),
        }

    return Response({
        "invites": [
            {**invite_row(i), **club_bits(i), "invited_by": i.invited_by.name if i.invited_by else ""}
            for i in invites
        ],
        "join_requests": [{**invite_row(r), **club_bits(r)} for r in requests],
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def respond_invitation(request, invite_id):
    """accept / decline. Invites: the invitee. Join requests: the creator."""
    action = request.data.get("action")
    if action not in ("accept", "decline"):
        return Response({"detail": "action must be accept or decline."}, status=status.HTTP_400_BAD_REQUEST)
    user = request.user

    with transaction.atomic():
        invite = get_object_or_404(
            ClubInvite.objects.select_for_update(of=("self",)).select_related("group__savings_account", "group__creator"),
            pk=invite_id,
        )
        group = invite.group
        if invite.kind == ClubInviteKind.INVITE:
            allowed = invite.email == user.email.lower()
        else:
            allowed = group.creator_id == user.id
        if not allowed:
            # 404, not 403: do not confirm that someone else's invite exists.
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if invite.status != ClubInviteStatus.PENDING:
            return Response({"detail": f"This request is already {invite.status.lower()}."},
                            status=status.HTTP_400_BAD_REQUEST)
        if action == "accept" and not _club_open(group):
            return Response({"detail": "This club has unlocked and is no longer taking members."},
                            status=status.HTTP_400_BAD_REQUEST)

        invite.status = ClubInviteStatus.ACCEPTED if action == "accept" else ClubInviteStatus.DECLINED
        invite.responded_at = timezone.now()
        if invite.kind == ClubInviteKind.INVITE:
            invite.user = user
        invite.save(update_fields=["status", "responded_at", "user"])
        joiner = invite.user
        if action == "accept":
            _add_member(group, joiner)

    if invite.kind == ClubInviteKind.INVITE:
        verb = "accepted" if action == "accept" else "declined"
        _notify(group.creator, f"{user.name} {verb} your invite to {group.name}",
                f"{user.email} {verb} the invitation.", group)
    else:
        if action == "accept":
            _notify(joiner, f"You're in! Welcome to {group.name}",
                    f"{group.creator.name} accepted your request to join.", group)
            _mail(joiner.email, joiner.name, f"You've joined {group.name} on DigiBank",
                  [f"Hi {joiner.name},", f"{group.creator.name} accepted your request to join “{group.name}”."],
                  "Open the club", _club_link(group))
        else:
            _notify(joiner, f"Your request to join {group.name} was declined",
                    "The club creator declined the request.", group)
    return Response({"status": invite.status, "club_id": group.pk})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancel_invitation(request, invite_id):
    """The creator withdraws an invite, or a requester withdraws their request."""
    user = request.user
    with transaction.atomic():
        invite = get_object_or_404(
            ClubInvite.objects.select_for_update(of=("self",)).select_related("group"), pk=invite_id
        )
        if invite.kind == ClubInviteKind.INVITE:
            allowed = invite.group.creator_id == user.id
        else:
            allowed = invite.user_id == user.id
        if not allowed:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if invite.status != ClubInviteStatus.PENDING:
            return Response({"detail": f"This request is already {invite.status.lower()}."},
                            status=status.HTTP_400_BAD_REQUEST)
        invite.status = ClubInviteStatus.CANCELLED
        invite.responded_at = timezone.now()
        invite.save(update_fields=["status", "responded_at"])
    return Response({"status": invite.status})
