"""
KYC submission and real bank-account linking.

KYC FLOW
--------
  PENDING --submit--> SUBMITTED --staff approves--> VERIFIED
                          \\--staff rejects--> REJECTED --resubmit--> SUBMITTED

At submission DigiBank runs automatic checks (PAN structure, Aadhaar checksum,
age, PIN code, name match) and stores the results for the reviewer. A human
then compares the documents and selfie in the Django admin. Wallet top-ups and
bank linking stay closed until the status is VERIFIED.

BANK LINKING
------------
The IFSC is checked live against Razorpay's public IFSC directory, which also
supplies the real bank and branch name. The account must be in the KYC name.
Only a masked number and a keyed fingerprint are stored - never the number.
"""
import json
import re
import urllib.error
import urllib.request
from datetime import date
from functools import lru_cache

from django.conf import settings
from django.contrib.admin.views.decorators import staff_member_required
from django.db import transaction
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.audit.models import AuditLog
from .crypto import encrypt, fingerprint
from .models import KycProfile, KycStatus, LinkedBankAccount

PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
IFSC_RE = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")
PINCODE_RE = re.compile(r"^[1-9][0-9]{5}$")
MAX_BANK_ACCOUNTS = 3


# ---------------------------------------------------------------------------
# Validators
# ---------------------------------------------------------------------------
# Verhoeff tables - the checksum UIDAI uses for the 12th Aadhaar digit.
_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 7, 8, 6, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]


def aadhaar_is_valid(number: str) -> bool:
    if not re.fullmatch(r"[2-9][0-9]{11}", number or ""):
        return False
    c = 0
    for i, digit in enumerate(reversed(number)):
        c = _D[c][_P[i % 8][int(digit)]]
    return c == 0


def _tokens(name):
    return {t for t in re.split(r"[^a-z]+", (name or "").lower()) if len(t) > 1}


def names_match(a, b):
    """At least one real name token in common - tolerant of initials and order."""
    return bool(_tokens(a) & _tokens(b))


def _age(dob):
    today = timezone.localdate()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


_SIGNATURES = {
    b"\xff\xd8\xff": "image",  # JPEG
    b"\x89PNG": "image",
    b"%PDF": "pdf",
}


def _file_kind(upload):
    head = upload.read(12)
    upload.seek(0)
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image"
    for sig, kind in _SIGNATURES.items():
        if head.startswith(sig):
            return kind
    return None


def _check_upload(upload, label, images_only=False):
    """Validates by content, not by the filename the browser claims."""
    if upload is None:
        return f"{label} is required."
    if upload.size > settings.KYC_MAX_UPLOAD_BYTES:
        return f"{label} must be under 5 MB."
    kind = _file_kind(upload)
    if kind is None or (images_only and kind != "image"):
        return f"{label} must be a {'JPG, PNG or WEBP image' if images_only else 'JPG, PNG, WEBP or PDF file'}."
    return None


# ---------------------------------------------------------------------------
# KYC endpoints
# ---------------------------------------------------------------------------
def _kyc_payload(user):
    profile = getattr(user, "kyc", None)
    data = {"status": user.kyc_status, "profile": None}
    if profile:
        data["profile"] = {
            "full_name": profile.full_name,
            "date_of_birth": profile.date_of_birth,
            "masked_pan": profile.masked_pan,
            "aadhaar_last4": profile.aadhaar_last4,
            "occupation": profile.occupation,
            "city": profile.city,
            "state": profile.state,
            "pincode": profile.pincode,
            "address_proof_type": profile.address_proof_type,
            "submitted_at": profile.submitted_at,
            "reviewed_at": profile.reviewed_at,
            "rejection_reason": profile.rejection_reason,
        }
    return data


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def kyc_status(request):
    return Response(_kyc_payload(request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser])
def kyc_submit(request):
    user = request.user
    if user.kyc_status in (KycStatus.SUBMITTED, KycStatus.VERIFIED):
        return Response(
            {"detail": f"Your KYC is already {user.get_kyc_status_display().lower()}."},
            status=status.HTTP_409_CONFLICT,
        )

    d = request.data
    errors = {}
    full_name = (d.get("full_name") or "").strip()
    pan = (d.get("pan") or "").strip().upper()
    aadhaar = re.sub(r"\D", "", d.get("aadhaar") or "")
    occupation = d.get("occupation") or ""
    proof_type = d.get("address_proof_type") or ""
    address = {k: (d.get(k) or "").strip() for k in ("address_line1", "address_line2", "city", "state", "pincode")}

    if len(full_name) < 3:
        errors["full_name"] = "Enter your full name as printed on your PAN card."
    try:
        dob = date.fromisoformat(d.get("date_of_birth") or "")
    except ValueError:
        dob = None
        errors["date_of_birth"] = "Enter a valid date of birth."
    if dob and _age(dob) < 18:
        errors["date_of_birth"] = "You must be 18 or older to complete KYC."
    if not PAN_RE.match(pan):
        errors["pan"] = "PAN must look like ABCDE1234F."
    elif pan[3] != "P":
        errors["pan"] = "That is not an individual PAN (the 4th letter must be P)."
    if proof_type == KycProfile.AddressProof.AADHAAR and not aadhaar_is_valid(aadhaar):
        errors["aadhaar"] = "That Aadhaar number is not valid. Check all 12 digits."
    if occupation not in KycProfile.Occupation.values:
        errors["occupation"] = "Choose your occupation."
    if proof_type not in KycProfile.AddressProof.values:
        errors["address_proof_type"] = "Choose an address proof."
    if len(address["address_line1"]) < 5:
        errors["address_line1"] = "Enter your house / street address."
    if not address["city"]:
        errors["city"] = "Enter your city."
    if not address["state"]:
        errors["state"] = "Enter your state."
    if not PINCODE_RE.match(address["pincode"]):
        errors["pincode"] = "PIN code must be 6 digits."
    if str(d.get("consent")).lower() not in ("true", "1", "yes", "on"):
        errors["consent"] = "Please give consent to verify your details."

    files = request.FILES
    for field, label, images_only in (
        ("pan_document", "PAN card", False),
        ("address_document", "Address proof", False),
        ("selfie", "Selfie", True),
    ):
        problem = _check_upload(files.get(field), label, images_only)
        if problem:
            errors[field] = problem

    if errors:
        first = next(iter(errors.values()))
        return Response({"detail": first, **errors}, status=status.HTTP_400_BAD_REQUEST)

    auto_checks = {
        "pan_structure": True,
        "pan_holder_type_individual": True,
        # 5th PAN letter is the first letter of the holder's surname.
        "pan_surname_initial_matches": pan[4] == (full_name.split()[-1][:1].upper() if full_name else ""),
        "aadhaar_checksum": aadhaar_is_valid(aadhaar) if aadhaar else None,
        "age_18_plus": True,
        "name_matches_account": names_match(full_name, user.name),
    }

    now = timezone.now()
    with transaction.atomic():
        KycProfile.objects.filter(user=user).delete()  # a resubmission replaces the old one
        KycProfile.objects.create(
            user=user,
            full_name=full_name,
            date_of_birth=dob,
            pan_encrypted=encrypt(pan),
            pan_last4=pan[-4:],
            aadhaar_last4=aadhaar[-4:] if aadhaar else "",
            occupation=occupation,
            pan_document=files["pan_document"],
            address_proof_type=proof_type,
            address_document=files["address_document"],
            selfie=files["selfie"],
            auto_checks=auto_checks,
            consent_at=now,
            submitted_at=now,
            **address,
        )
        user.kyc_status = KycStatus.SUBMITTED
        user.save(update_fields=["kyc_status"])

    AuditLog.record("KYC_SUBMITTED", actor=user, metadata={"auto_checks": auto_checks})
    return Response(_kyc_payload(user), status=status.HTTP_201_CREATED)


@staff_member_required
def kyc_document(request, pk, field):
    """Staff-only download of a KYC document (used from the Django admin)."""
    if field not in ("pan_document", "address_document", "selfie"):
        raise Http404
    profile = KycProfile.objects.filter(pk=pk).first()
    if profile is None or not getattr(profile, field):
        raise Http404
    AuditLog.record("KYC_DOCUMENT_VIEWED", actor=request.user, entity=profile, metadata={"field": field})
    return FileResponse(getattr(profile, field).open("rb"))


# ---------------------------------------------------------------------------
# Bank accounts
# ---------------------------------------------------------------------------
class IfscLookupError(Exception):
    pass


@lru_cache(maxsize=512)
def lookup_ifsc(code):
    """Live lookup against Razorpay's free public IFSC directory."""
    if not IFSC_RE.match(code):
        return None
    try:
        with urllib.request.urlopen(f"https://ifsc.razorpay.com/{code}", timeout=6) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise IfscLookupError(str(exc)) from exc
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise IfscLookupError(str(exc)) from exc
    return {
        "ifsc": data.get("IFSC", code),
        "bank": data.get("BANK", ""),
        "branch": data.get("BRANCH", ""),
        "city": data.get("CITY", ""),
        "state": data.get("STATE", ""),
        "bank_code": data.get("BANKCODE", code[:4]),
        "upi": bool(data.get("UPI")),
        "imps": bool(data.get("IMPS")),
        "neft": bool(data.get("NEFT")),
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ifsc_lookup(request, code):
    code = code.strip().upper()
    try:
        info = lookup_ifsc(code)
    except IfscLookupError:
        return Response({"detail": "Could not reach the IFSC directory. Try again."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    if info is None:
        return Response({"detail": "No bank branch has that IFSC code."}, status=status.HTTP_404_NOT_FOUND)
    return Response(info)


def serialize_bank(acc):
    return {
        "id": acc.id,
        "bank_name": acc.bank_name or (acc.ifsc[:4].upper() if acc.ifsc else "Linked account"),
        "branch": acc.branch,
        "ifsc": acc.ifsc,
        "masked_number": acc.masked_account_no,
        "account_holder_name": acc.account_holder_name,
        "account_type": acc.account_type,
        "upi_id": acc.upi_id,
        "is_primary": acc.is_primary,
        "verified_at": acc.verified_at,
        "bank_code": acc.ifsc[:4] if acc.ifsc else "",
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser])
def bank_accounts(request):
    user = request.user
    if request.method == "GET":
        accounts = LinkedBankAccount.objects.filter(user=user).order_by("-is_primary", "created_at")
        return Response([serialize_bank(a) for a in accounts])

    if user.kyc_status != KycStatus.VERIFIED:
        return Response(
            {"detail": "Complete KYC before linking a bank account.", "code": "kyc_required"},
            status=status.HTTP_403_FORBIDDEN,
        )

    d = request.data
    holder = (d.get("account_holder_name") or "").strip()
    number = re.sub(r"\s", "", str(d.get("account_number") or ""))
    confirm = re.sub(r"\s", "", str(d.get("confirm_account_number") or ""))
    ifsc = (d.get("ifsc") or "").strip().upper()
    acc_type = d.get("account_type") or LinkedBankAccount.AccountType.SAVINGS

    if not re.fullmatch(r"\d{9,18}", number):
        return Response({"detail": "Account number must be 9 to 18 digits."}, status=status.HTTP_400_BAD_REQUEST)
    if number != confirm:
        return Response({"detail": "The two account numbers do not match."}, status=status.HTTP_400_BAD_REQUEST)
    if acc_type not in LinkedBankAccount.AccountType.values:
        return Response({"detail": "Choose savings or current."}, status=status.HTTP_400_BAD_REQUEST)
    kyc_name = getattr(getattr(user, "kyc", None), "full_name", user.name)
    if not names_match(holder, kyc_name):
        return Response(
            {"detail": f"The account must be in your own name ({kyc_name}). Third-party accounts are not allowed."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        info = lookup_ifsc(ifsc)
    except IfscLookupError:
        return Response({"detail": "Could not verify the IFSC right now. Try again."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    if info is None:
        return Response({"detail": "No bank branch has that IFSC code."}, status=status.HTTP_400_BAD_REQUEST)

    fp = fingerprint(f"{ifsc[:4]}:{number}")
    existing = LinkedBankAccount.objects.filter(account_fingerprint=fp).first()
    if existing:
        msg = "You have already linked this account." if existing.user_id == user.id else "This account is linked to another DigiBank user."
        return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        mine = LinkedBankAccount.objects.select_for_update().filter(user=user)
        if mine.count() >= MAX_BANK_ACCOUNTS:
            return Response({"detail": f"You can link up to {MAX_BANK_ACCOUNTS} bank accounts."}, status=status.HTTP_400_BAD_REQUEST)
        acc = LinkedBankAccount.objects.create(
            user=user,
            account_holder_name=holder,
            masked_account_no=f"XXXX{number[-4:]}",
            ifsc=ifsc,
            bank_name=info["bank"],
            branch=info["branch"],
            account_type=acc_type,
            account_fingerprint=fp,
            is_primary=not mine.exists(),
            verified_at=timezone.now(),
        )
    AuditLog.record("BANK_LINKED", actor=user, entity=acc, metadata={"ifsc": ifsc, "bank": info["bank"]})
    return Response(serialize_bank(acc), status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def bank_account_detail(request, account_id):
    acc = LinkedBankAccount.objects.filter(pk=account_id, user=request.user).first()
    if acc is None:
        return Response({"detail": "Bank account not found."}, status=status.HTTP_404_NOT_FOUND)
    with transaction.atomic():
        was_primary = acc.is_primary
        acc.delete()
        if was_primary:
            nxt = LinkedBankAccount.objects.filter(user=request.user).order_by("created_at").first()
            if nxt:
                nxt.is_primary = True
                nxt.save(update_fields=["is_primary"])
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bank_account_make_primary(request, account_id):
    acc = LinkedBankAccount.objects.filter(pk=account_id, user=request.user).first()
    if acc is None:
        return Response({"detail": "Bank account not found."}, status=status.HTTP_404_NOT_FOUND)
    with transaction.atomic():
        LinkedBankAccount.objects.filter(user=request.user, is_primary=True).update(is_primary=False)
        acc.is_primary = True
        acc.save(update_fields=["is_primary"])
    return Response(serialize_bank(acc))
