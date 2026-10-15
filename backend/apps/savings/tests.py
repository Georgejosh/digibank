"""Club membership: invites, join codes, join requests and the equal split.

(Deposit and withdrawal rules are tested in apps/payments/tests.py.)
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.notifications.models import Notification
from apps.payments.models import Transaction, TransactionStatus, TransactionType

from .models import ClubInvite, GroupMember, SavingsGroup

User = get_user_model()


def make_user(name, email, phone):
    return User.objects.create_user(name=name, email=email, phone=phone, password="Password123")


@override_settings(EMAIL_PROVIDER="auto", MAIL_RELAY_SECRET="", GMAIL_USER="", GMAIL_APP_PASSWORD="",
                   BREVO_API_KEY="", EMAIL_HOST_PASSWORD="")
class ClubMembershipTests(TestCase):
    def setUp(self):
        cache.clear()
        self.creator = make_user("Reni", "reni@example.com", "9000000001")
        self.priya = make_user("Priya", "priya@example.com", "9000000002")
        self.rohan = make_user("Rohan", "rohan@example.com", "9000000003")
        self.api = APIClient()
        self.as_user(self.creator)
        deadline = (timezone.localdate() + timedelta(days=60)).isoformat()
        res = self.api.post("/api/clubs/", {
            "name": "Beach squad", "goal_name": "Goa trip", "target_amount_paise": 1_200_000,
            "deadline": deadline, "invites": ["Priya@Example.com", "newperson@example.com"],
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.club = SavingsGroup.objects.get(pk=res.data["id"])
        self.created = res.data

    def as_user(self, user):
        self.api.force_authenticate(user=user)

    def deposit(self, user, paise):
        Transaction.objects.create(
            user=user, savings_account=self.club.savings_account, type=TransactionType.DEPOSIT,
            amount_paise=paise, balance_after_paise=paise, status=TransactionStatus.SUCCESS,
        )

    # -- invites by e-mail ---------------------------------------------------
    def test_create_sends_invites_but_nobody_joins_yet(self):
        self.assertEqual(sorted(self.created["invited"]), ["newperson@example.com", "priya@example.com"])
        self.assertEqual(self.club.members.count(), 1)
        invite = ClubInvite.objects.get(email="priya@example.com")
        self.assertEqual(invite.user, self.priya)
        self.assertTrue(Notification.objects.filter(user=self.priya, type="GROUP_INVITE").exists())

    def test_invitee_accepts_from_own_account_and_shows_as_member(self):
        self.as_user(self.priya)
        mine = self.api.get("/api/clubs/invitations/").data["invites"]
        self.assertEqual([i["club_name"] for i in mine], ["Beach squad"])
        res = self.api.post(f"/api/clubs/invitations/{mine[0]['id']}/respond/", {"action": "accept"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(self.club.members.filter(user=self.priya).exists())

        self.as_user(self.creator)
        detail = self.api.get(f"/api/clubs/{self.club.pk}/").data
        statuses = {i["email"]: i["status"] for i in detail["invites"]}
        self.assertEqual(statuses, {"priya@example.com": "ACCEPTED", "newperson@example.com": "PENDING"})
        self.assertEqual({m["name"] for m in detail["members"]}, {"Reni", "Priya"})

    def test_creator_cannot_accept_an_invite_for_someone_else(self):
        invite = ClubInvite.objects.get(email="priya@example.com")
        res = self.api.post(f"/api/clubs/invitations/{invite.pk}/respond/", {"action": "accept"}, format="json")
        self.assertEqual(res.status_code, 404)
        self.assertFalse(self.club.members.filter(user=self.priya).exists())

    def test_invite_waits_for_someone_who_signs_up_later(self):
        late = make_user("New Person", "newperson@example.com", "9000000004")
        self.as_user(late)
        mine = self.api.get("/api/clubs/invitations/").data["invites"]
        self.assertEqual(len(mine), 1)
        self.assertFalse(mine[0]["has_account"])

    def test_duplicate_invite_is_reported_not_repeated(self):
        res = self.api.post(f"/api/clubs/{self.club.pk}/invite/",
                            {"emails": ["priya@example.com", "reni@example.com"]}, format="json")
        results = {r["email"]: r["result"] for r in res.data["results"]}
        self.assertEqual(results, {"priya@example.com": "already_pending", "reni@example.com": "already_member"})

    def test_only_creator_invites(self):
        GroupMember.objects.create(group=self.club, user=self.rohan)
        self.as_user(self.rohan)
        res = self.api.post(f"/api/clubs/{self.club.pk}/invite/", {"emails": ["x@example.com"]}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_creator_can_cancel_a_pending_invite(self):
        invite = ClubInvite.objects.get(email="newperson@example.com")
        res = self.api.post(f"/api/clubs/invitations/{invite.pk}/cancel/")
        self.assertEqual(res.data["status"], "CANCELLED")

    # -- join code -------------------------------------------------------------
    def test_join_code_request_needs_creator_approval(self):
        code = self.created["join_code"]
        self.assertRegex(code, r"^[A-Z2-9]{4}-[A-Z2-9]{4}$")
        self.as_user(self.rohan)
        res = self.api.post("/api/clubs/join/", {"code": code.lower()}, format="json")
        self.assertEqual(res.data["result"], "requested")
        self.assertFalse(self.club.members.filter(user=self.rohan).exists())
        request_row = ClubInvite.objects.get(kind="JOIN_REQUEST", user=self.rohan)
        self.assertTrue(Notification.objects.filter(user=self.creator, title__contains="wants to join").exists())

        # Rohan cannot approve his own request.
        res = self.api.post(f"/api/clubs/invitations/{request_row.pk}/respond/", {"action": "accept"}, format="json")
        self.assertEqual(res.status_code, 404)

        self.as_user(self.creator)
        res = self.api.post(f"/api/clubs/invitations/{request_row.pk}/respond/", {"action": "accept"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(self.club.members.filter(user=self.rohan).exists())

    def test_code_from_an_invited_person_joins_directly(self):
        self.as_user(self.priya)
        res = self.api.post("/api/clubs/join/", {"code": self.created["join_code"]}, format="json")
        self.assertEqual(res.data["result"], "joined")
        self.assertTrue(self.club.members.filter(user=self.priya).exists())

    def test_wrong_code_and_code_hidden_from_members(self):
        self.as_user(self.rohan)
        self.assertEqual(self.api.post("/api/clubs/join/", {"code": "AAAA-AAAA"}, format="json").status_code, 404)
        GroupMember.objects.create(group=self.club, user=self.rohan)
        self.assertIsNone(self.api.get(f"/api/clubs/{self.club.pk}/").data["join_code"])

    def test_non_member_cannot_see_club(self):
        self.as_user(self.rohan)
        self.assertEqual(self.api.get(f"/api/clubs/{self.club.pk}/").status_code, 404)

    # -- contributions and split -----------------------------------------------
    def test_split_shares_and_contributions(self):
        GroupMember.objects.create(group=self.club, user=self.priya)
        GroupMember.objects.create(group=self.club, user=self.rohan)
        self.deposit(self.priya, 150_000)
        res = self.api.post(f"/api/clubs/{self.club.pk}/split/", {"enabled": True}, format="json")
        self.assertTrue(res.data["split_equally"])

        detail = self.api.get(f"/api/clubs/{self.club.pk}/").data
        self.assertEqual(detail["split"]["share_paise"], 400_000)  # 12,000 / 3
        priya = next(m for m in detail["members"] if m["name"] == "Priya")
        self.assertEqual(priya["contributed_paise"], 150_000)
        self.assertEqual(priya["split"]["remaining_paise"], 250_000)
        self.assertEqual(priya["split"]["per_month_paise"], 125_000)  # 2 months left
        self.assertTrue(Notification.objects.filter(user=self.rohan, title__contains="split equally").exists())

    def test_split_rounds_up_so_shares_cover_target(self):
        GroupMember.objects.create(group=self.club, user=self.priya)
        GroupMember.objects.create(group=self.club, user=self.rohan)
        account = self.club.savings_account
        account.target_amount_paise = 1_000_000
        account.save()
        self.api.post(f"/api/clubs/{self.club.pk}/split/", {"enabled": True}, format="json")
        share = self.api.get(f"/api/clubs/{self.club.pk}/").data["split"]["share_paise"]
        self.assertGreaterEqual(share * 3, 1_000_000)

    def test_only_creator_changes_split(self):
        GroupMember.objects.create(group=self.club, user=self.rohan)
        self.as_user(self.rohan)
        res = self.api.post(f"/api/clubs/{self.club.pk}/split/", {"enabled": True}, format="json")
        self.assertEqual(res.status_code, 403)
