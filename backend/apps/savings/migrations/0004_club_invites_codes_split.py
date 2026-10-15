"""
Clubs grow a join code, an equal-split switch and an invite / join-request
table. Existing clubs each get their own fresh code.
"""
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import apps.savings.models


def give_codes(apps, schema_editor):
    Group = apps.get_model("savings", "SavingsGroup")
    used = set()
    for group in Group.objects.all():
        code = apps_code(used)
        group.join_code = code
        group.save(update_fields=["join_code"])


def apps_code(used):
    from apps.savings.models import new_join_code

    while True:
        code = new_join_code()
        if code not in used:
            used.add(code)
            return code


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("savings", "0003_remove_term_lockers"),
    ]

    operations = [
        migrations.AddField(
            model_name="savingsgroup",
            name="join_code",
            field=models.CharField(max_length=8, null=True),
        ),
        migrations.RunPython(give_codes, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="savingsgroup",
            name="join_code",
            field=models.CharField(default=apps.savings.models.new_join_code, max_length=8, unique=True),
        ),
        migrations.AddField(
            model_name="savingsgroup",
            name="split_equally",
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name="ClubInvite",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kind", models.CharField(choices=[("INVITE", "Invited by the creator"), ("JOIN_REQUEST", "Asked to join with the club code")], max_length=16)),
                ("email", models.EmailField(max_length=254)),
                ("status", models.CharField(choices=[("PENDING", "Pending"), ("ACCEPTED", "Accepted"), ("DECLINED", "Declined"), ("CANCELLED", "Cancelled")], default="PENDING", max_length=10)),
                ("email_sent", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("responded_at", models.DateTimeField(blank=True, null=True)),
                ("group", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="invites", to="savings.savingsgroup")),
                ("invited_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="club_invites_sent", to=settings.AUTH_USER_MODEL)),
                ("user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="club_invites", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "club_invites", "ordering": ["-created_at"]},
        ),
        migrations.AddConstraint(
            model_name="clubinvite",
            constraint=models.UniqueConstraint(condition=models.Q(("status", "PENDING")), fields=("group", "email"), name="uniq_open_club_invite"),
        ),
    ]
