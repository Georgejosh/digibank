# DigiBank Backend — Setup

## It is already running on SQLite

`.env` currently has `DB_ENGINE=sqlite`, so the API works right now with no
database server, role or password to configure:

```bash
venv\Scripts\python.exe manage.py runserver
```

Migrations are applied and the schema is identical to the PostgreSQL one. Use
this to keep working; do step 1 below when you want the real thing.

**Moving to PostgreSQL** takes about a minute: run `setup_db.py`, then
`migrate`, then change one line in `.env` to `DB_ENGINE=postgres`. The only
behavioural difference is that SQLite ignores `select_for_update()`, so the row
locks in the deposit and emergency-approval views are no-ops there — SQLite
serialises writes globally so the races cannot happen anyway, but concurrency
should be verified on PostgreSQL before you rely on it.

---

## 1. Create the database and role (PostgreSQL)

`setup_db.py` reads `.env` for the application role name and password, then
creates the role, the database and the schema grants.

```bash
venv\Scripts\python.exe setup_db.py
```

It asks for your **PostgreSQL superuser password** — the one you chose for the
`postgres` account when you installed PostgreSQL 17. It is read with `getpass`,
so it is not echoed to the screen, not written to any file, and used only for
that one connection.

The application role's own password comes from `POSTGRES_PASSWORD` in `.env`,
so you never type it twice and the two cannot drift apart. (Drift is the usual
cause of `password authentication failed for user "digibank"`.)

If the role already exists, the script resets its password to match `.env`
rather than failing.

> Doing it by hand instead? In **SQL Shell (psql)** as `postgres`:
> ```sql
> CREATE ROLE digibank WITH LOGIN PASSWORD 'the_value_from_your_.env';
> CREATE DATABASE digibank OWNER digibank;
> \c digibank
> GRANT ALL ON SCHEMA public TO digibank;
> ALTER SCHEMA public OWNER TO digibank;
> ```
> The last two lines matter on PostgreSQL 15+: without them `migrate` fails
> with *permission denied for schema public* even though the role owns the
> database.

`.env` is in `.gitignore` and never gets committed. `.env.example` is the safe
copy that does.

## 2. Apply the migrations and switch over

```bash
venv\Scripts\python.exe manage.py migrate
```

Then set `DB_ENGINE=postgres` in `.env` and restart `runserver`. (Data does not
move across on its own — the SQLite file keeps whatever you created while on
it.)

## 3. Create an admin account (optional)

```bash
venv\Scripts\python.exe manage.py createsuperuser
```

It asks for email, phone, name and password, because the `User` model uses
email as the login field. Superusers are created pre-verified, so they can
reach `/admin/` without an emailed code.

## 4. Run the server

```bash
venv\Scripts\python.exe manage.py runserver
```

Check it: <http://127.0.0.1:8000/api/health/> should return
`{"status": "ok", "database": "connected"}`.

---

## OTP delivery

Codes are generated with `secrets`, stored **hashed**, expire after
`OTP_VALIDITY_MINUTES` (5), allow `OTP_MAX_ATTEMPTS` (5) guesses, and can be
used exactly once. The plaintext code is never returned in an API response on
any channel — a code that travels in the same response that triggered it proves
nothing, because whoever called the endpoint already has it.

`OTP_DELIVERY_CHANNEL` in `.env` picks how it reaches the user:

| Value | Behaviour |
| --- | --- |
| `auto` *(default)* | Email if `EMAIL_HOST_USER` is set, otherwise console |
| `console` | Prints the code in this terminal. No delivery. |
| `email` | Real email over SMTP |
| `sms` | Real SMS (needs a provider account) |

### Out of the box

With no credentials configured you are on `console`. Register or log in, and
the code appears in the `runserver` terminal:

```
==============================================================
  DigiBank OTP  |  LOGIN
  to    : you@example.com  /  9876543210
  CODE  : 407913
  expires in 5 minutes
==============================================================
```

### Sending real emails (Gmail)

1. Turn on 2-Step Verification on the Google account.
2. Create an **App Password** at <https://myaccount.google.com/apppasswords>.
   A normal Gmail password will not work for SMTP.
3. Put the 16-character app password in `.env`:

```
EMAIL_HOST_USER=youraddress@gmail.com
EMAIL_HOST_PASSWORD=abcdefghijklmnop
DEFAULT_FROM_EMAIL=youraddress@gmail.com
```

4. Restart `runserver`. Codes now arrive by email — the channel flips to
   `email` on its own because `OTP_DELIVERY_CHANNEL=auto`.

### Sending real SMS

SMS needs a paid provider. `pip install twilio`, then in `.env`:

```
OTP_DELIVERY_CHANNEL=sms
SMS_PROVIDER=twilio
SMS_ACCOUNT_SID=...
SMS_AUTH_TOKEN=...
SMS_FROM_NUMBER=+1...
```

A Twilio trial account can only text numbers you have verified in their
console — worth knowing before concluding the code is broken.

---

## The auth flow

There is **no endpoint that turns a password alone into a session.** Getting in
always takes two calls, with a fresh code every single time.

```
Register
  POST /api/auth/register/     -> 201, account created UNVERIFIED, code sent
  POST /api/auth/verify-otp/   -> account verified. Still no session.
     purpose=SIGNUP_VERIFICATION

Login (every time)
  POST /api/auth/login/        -> 200, password OK, code sent. NO token.
  POST /api/auth/verify-otp/   -> 200, access_token + httpOnly refresh cookie
     purpose=LOGIN
```

The access token goes in the response body and lives only in the React app's
memory. The refresh token is set as an `httpOnly`, `SameSite` cookie scoped to
`/api/auth/`, so JavaScript can never read it and an XSS payload cannot steal
the session.

Registering does not log you in, and verifying a signup does not either — that
login needs its own `LOGIN` code. If registration alone granted a session, the
OTP step would be decorative.

---

## Endpoints

| Method | Path |
| --- | --- |
| POST | `/api/auth/register/` |
| POST | `/api/auth/login/` |
| POST | `/api/auth/verify-otp/` |
| POST | `/api/auth/resend-otp/` |
| POST | `/api/auth/refresh/` |
| POST | `/api/auth/logout/` |
| POST | `/api/auth/forgot-password/` |
| GET | `/api/auth/me/` |
| GET | `/api/accounts/bank-accounts/` |
| GET, POST | `/api/savings/individual/` |
| GET | `/api/savings/deposit-targets/` |
| GET, POST | `/api/clubs/` |
| GET | `/api/dashboard/summary/` |
| POST | `/api/payments/deposits/` |
| GET | `/api/transactions/` |
| GET, POST | `/api/emergency/requests/` |
| POST | `/api/emergency/requests/{id}/approve/` |
| POST | `/api/emergency/requests/{id}/reject/` |
| GET | `/api/notifications/` |
| POST | `/api/notifications/{id}/read/` |
| POST | `/api/notifications/read-all/` |

---

## Troubleshooting

**`password authentication failed for user "digibank"`**
The role does not exist, or its password differs from `.env`. Re-run
`setup_db.py` — it resets the password to match.

**`permission denied for schema public`**
PostgreSQL 15+ locked down the `public` schema. Re-run `setup_db.py`, which
issues the grant.

**Login succeeds but the page bounces back to the login screen**
The refresh cookie is being dropped. On plain-HTTP localhost keep
`REFRESH_COOKIE_SECURE=False`; a `Secure` cookie is discarded over HTTP.

**CORS errors in the browser console**
`CORS_ALLOWED_ORIGINS` must list the React origin exactly
(`http://localhost:5173`). Credentialed requests cannot use `*`, so an empty or
wildcard value will fail.

**No code arrives by email**
Check the `runserver` terminal. If the banner says the channel is `console`,
`EMAIL_HOST_USER` is still blank. If SMTP errors, you are probably using a
normal Gmail password instead of an App Password.
