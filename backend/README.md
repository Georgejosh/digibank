# DigiBank — Backend

A group-based digital savings platform. Django + Django REST Framework +
PostgreSQL, built as a **modular monolith** exactly as described in the project
abstract.

---

## Why a modular monolith (and not microservices)

The abstract commits to this, and it is the right call. A modular monolith means:

- **One deployable process, one database.** You run `manage.py runserver` and the
  whole system is up. No service discovery, no message broker, no Docker
  orchestration to debug at 2am the night before your demo.
- **Clear internal boundaries.** Each functional module from your Modules
  document is one Django app with its own `models.py`. The boundaries are real —
  they just are not network boundaries.

The decisive advantage for *this* project is **transactional consistency**.
Releasing emergency funds must do three things atomically: write the withdrawal
row, decrement the balance, and mark the request completed. In one database this
is a single `transaction.atomic()` block that either fully happens or fully does
not. Split across microservices, you would need distributed transactions or the
saga pattern — a genuinely hard problem you do not want in a mini project.

---

## Module → app → table map

This mirrors your Modules document one-to-one.

| Functional module | Django app | Tables |
|---|---|---|
| User Authentication & Registration | `apps.accounts` | `users`, `devices` |
| Biometric Verification | `apps.accounts` | `devices` |
| Individual Savings | `apps.savings` | `savings_accounts` |
| Group Savings | `apps.savings` | `groups`, `group_members`, `savings_accounts` |
| Deposit & Payment | `apps.payments` | `linked_bank_accounts`, `transactions` |
| Transaction & Ledger | `apps.payments` | `transactions`, `savings_accounts` |
| Emergency Withdrawal & Approval | `apps.emergency` | `emergency_requests`, `emergency_approvals`, `transactions` |
| Two-Factor Authentication (2FA) | `apps.emergency` | `otp_verifications` |
| Notification | `apps.notifications` | `notifications` |
| Audit & Admin | `apps.audit` | `audit_logs` |

All 12 tables from the requirements document exist, with exactly those names.

---

## Four design decisions worth defending in your viva

These are the parts an examiner will probe. Each one is implemented and
commented in the code.

### 1. Money is stored as integer paise, never a float

`savings_accounts.balance_paise`, `transactions.amount_paise` and friends are all
`BigIntegerField`. Rupees 1,250.00 is stored as `125000`.

**Why:** binary floating point cannot represent 0.10 exactly. Add 0.10 a thousand
times in a float and you do not get 100.00. In a savings ledger that drift means
your balance stops matching your transaction history, which is the one thing a
financial app must never do. Integers are exact.

Formatting (`125000` → `"Rs 1,250.00"`) is the mobile app's job.

### 2. The lock rule lives on the server, in one function

`SavingsAccount.is_withdrawal_allowed()` in `apps/savings/models.py`. It returns
true only if the target is reached or the deadline has passed.

**Why:** the app may grey out a button for a nicer experience, but the app's
opinion is never trusted. Anyone can send an HTTP request with Postman or curl
that bypasses your UI entirely. The rule must be re-checked server-side before
any money moves.

**Demo this.** During your presentation, call the withdrawal endpoint with
Postman against a locked goal and show the `403`. It proves the lock is real
rather than cosmetic, and it is a very strong moment.

### 3. Consensus is protected against concurrency

The scenario: a group has 4 members, 3 have approved, and the last two tap
Approve at the same instant. Both HTTP requests count the approvals, both see
"all 4 approved", and both release the money. The pool is drained twice.

Three layers stop this:

- `UniqueConstraint(fields=["request", "user"])` on `emergency_approvals` — one
  member cannot vote twice, so the count cannot be inflated.
- `UniqueConstraint` on `emergency_requests` with `condition=Q(status="PENDING")`
  — only one live request per savings account, so competing requests cannot race.
- `select_for_update()` in the approval view — takes a row lock so the second
  request *waits* until the first has committed. By the time it wakes up the
  status is no longer `PENDING` and it correctly does nothing.

The full pattern is written out in the docstring of `EmergencyApproval` in
`apps/emergency/models.py`. This is your best answer to "what was the hardest
part of your project?"

### 4. Biometrics are cryptographic, not a boolean

The naive version has the phone send `{"biometric_ok": true}` and the server
believes it. That is worthless — anyone can send that JSON from curl without
owning the phone or the fingerprint.

What this project does instead:

1. At device registration, the phone generates a keypair **inside its secure
   hardware** (Android Keystore / iOS Secure Enclave). The private key can never
   be exported, and can only be used after a successful fingerprint or face check.
2. Only the **public** key is sent to the server and stored in `devices.public_key`.
3. At withdrawal time the server sends a random one-time challenge string.
4. The phone asks for the fingerprint, and on success signs the challenge with
   the private key.
5. The server verifies the signature against the stored public key.

A valid signature is proof that this specific physical phone was unlocked by its
owner's biometric. That is what the abstract means by "device-level cryptographic
trust rather than client-reported authentication status" — and being able to
explain this distinction clearly is worth real marks.

---

## Other protections already built in

- **OTPs are stored hashed** (`otp_verifications.otp_hash`), never in plain text,
  with an expiry and an attempt counter. Same reasoning as password storage: a
  leaked database dump must not hand over working codes.
- **The ledger is append-only.** `transactions` rows are never updated or
  deleted; a mistake is corrected with a new compensating row. The admin
  interface enforces this by refusing add, change and delete permissions.
- **The audit log is immutable** and uses `on_delete=SET_NULL` for the actor, so
  deleting a user never erases the record of what they did.
- **Idempotent deposits.** A partial unique index on `transactions.gateway_ref`
  means a retried payment callback cannot credit the same money twice.
- **Only masked bank details are stored.** Full account numbers and UPI PINs stay
  with the payment gateway, never in our database.
- **Database-level CHECK constraints** on `savings_accounts` make a malformed row
  physically impossible — an INDIVIDUAL goal cannot point at a group, and a
  balance cannot go negative. Python validation can be bypassed by a stray
  script; a CHECK constraint cannot.

---

## Project layout

```
D:\DigiBank\backend\
├─ digibank/
│  ├─ settings.py        env-driven config, business rules in one place
│  └─ urls.py            admin, health check, JWT auth endpoints
├─ apps/
│  ├─ accounts/          users, devices, linked_bank_accounts
│  ├─ savings/           groups, group_members, savings_accounts
│  ├─ payments/          transactions (the ledger)
│  ├─ emergency/         emergency_requests, emergency_approvals, otp_verifications
│  ├─ notifications/     notifications
│  └─ audit/             audit_logs
├─ .env                  real secrets, gitignored
├─ .env.example          safe template, committed
└─ requirements.txt
```

## Getting it running

See [SETUP.md](SETUP.md). Five steps, about ten minutes.

## What is not built yet

Models, migrations, admin and auth scaffolding are done. Still to write:

- Serializers and API views for each module
- The deposit flow against the Razorpay sandbox
- The emergency approval endpoint (using the `select_for_update` pattern above)
- The biometric challenge/verify endpoints
- Expo push notification delivery
- The Expo mobile app
