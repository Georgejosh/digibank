# DigiBank — Frontend (Phase 1)

React frontend for **DigiBank**, a group-based digital savings app.

DigiBank is **savings-only**. There is no peer-to-peer transfer anywhere in the
product: money goes into a goal, stays locked until that goal's target or
deadline is reached, and comes back out to the person who put it in. Group
goals ("clubs") add one exception — an emergency withdrawal that **every**
member must approve.

This app talks to the **live Django + PostgreSQL API** in `../backend`. Auth,
goals, clubs, deposits, the ledger, notifications and emergency approvals are
all real. Real one-time codes are sent on sign-up and on **every** login. The
payment gateway is still stubbed — deposits move numbers, not money.

---

## Quick start

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173.

The Django API must be running too — see `backend/SETUP.md`.

### Walking the app as a reviewer

| Step | What to do |
| --- | --- |
| Sign up | Any name / email / 10-digit Indian mobile / password with upper, lower and a digit |
| Verify | A **real 6-digit code** is sent. With no SMTP configured it is printed in the Django `runserver` terminal. |
| Log in | Password, then **another fresh code** — every login needs one |
| Explore | Dashboard → Goals → Clubs → Deposit → Emergency → History → Notifications |

There is no fixed demo code. Codes are random, hashed in the database, expire
in 5 minutes, allow 5 attempts and work once.

### Running without a backend

Set `VITE_USE_MOCK_API=true` in `.env.local` to serve every request from
`src/services/mockApi.js` instead. Useful for pure UI work with no Django
running; the mock's fixed demo code is `123456`.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 5173 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build (use this to test the PWA/service worker) |
| `npm run lint` | ESLint — must pass with zero warnings before you push |
| `npm run lint:fix` | Auto-fix what ESLint can |
| `npm run format` | Prettier across the project |

---

## Tech stack

| Concern | Choice |
| --- | --- |
| Build | Vite |
| UI | React 18, function components + hooks only |
| Routing | React Router v6, lazy routes past login |
| Styling | Tailwind CSS (mobile-first) |
| Server state | TanStack Query |
| Forms | react-hook-form + zod |
| HTTP | one configured Axios instance |
| Icons | lucide-react |
| Quality | ESLint + Prettier (shared config, committed) |

---

## Folder structure

```
src/
  components/
    ui/          Button, Input, Card, Modal, Toast, ProgressBar, Badge,
                 Skeleton, Avatar, LockLabel, StreakBadge, EmptyState
    layout/      Navbar, Sidebar, BottomNav, AuthLayout, DashboardLayout
    ErrorBoundary.jsx
  features/
    landing/     Public marketing page
    auth/        Login, Register, ForgotPassword, VerifyOtp, OtpVerification
    dashboard/   Summary tiles, streak, recent activity
    savings/     Individual goal list + create form
    clubs/       Club list + create form + emergency explainer
    deposit/     Deposit flow
    emergency/   Emergency request + approval roll-call
    transactions/Filterable ledger
    notifications/
  context/       AuthContext, ToastContext
  hooks/         One hook per data operation, each wrapping TanStack Query
  services/      api.js (Axios), endpoints.js, tokenStore.js, mockApi.js,
                 and one service per domain
  routes/        AppRoutes, ProtectedRoute, PublicOnlyRoute, RouteFallback
  utils/         money, date, lock, validation, password, cn
```

---

## Four decisions worth knowing before you edit anything

### 1. Money is always integer **paise**

Mirrors the backend rule in `backend/apps/savings/models.py`. `0.1 + 0.2 !== 0.3`
in JavaScript, so floats drift and balances stop matching the ledger.

- The API only ever sends/receives `*_paise` integers.
- Forms collect **rupees**; convert at the boundary with `rupeesToPaise()`.
- Display with `formatPaise()` / `formatPaiseShort()` from `utils/money.js`.

### 2. Login is two steps, every time

`POST /auth/login/` proves the password and returns an **OTP challenge, not a
session**. `POST /auth/verify-otp/` with `purpose: "LOGIN"` is what returns the
access token. No endpoint turns a password alone into a session, so a stolen
password is not enough without the inbox the code goes to.

`features/auth/OtpVerification.jsx` is deliberately generic — it backs signup
verification, login, and later the emergency-withdrawal 2FA, all through the
same `purpose` prop.

### 3. The access token lives in memory and nowhere else

`services/tokenStore.js` holds it in a module variable. **Never** put it in
`localStorage`, `sessionStorage`, a readable cookie, or a URL — anything
JavaScript can read, an XSS payload can steal.

The refresh token is an **httpOnly, SameSite cookie set by Django**, scoped to
`/api/auth/`, which this app can never read. On boot, `AuthContext` calls
`/api/auth/refresh/`; the browser attaches that cookie and Django returns a new
access token. That is how a session survives a reload without storing anything
JavaScript can reach.

`api.js` also refreshes silently on any `401` and replays the original request,
de-duplicating concurrent refreshes so five parallel queries trigger one refresh
rather than five.

### 4. The frontend never decides whether money can move

`utils/lock.js` mirrors `SavingsAccount.is_withdrawal_allowed()` so the UI can
*describe* a locked goal. It does not *enforce* anything. Likewise the
unanimous-approval rule is documented and visualised, but only Django counts
the votes — counting them in the browser would let anyone flip a request to
`APPROVED` from the devtools console.

---
## Talking to the Django API

`services/api.js` is the single configured Axios instance. Each domain service
calls it directly; the `USE_MOCK_API` branch is a fallback for working offline,
not the default path any more.

Two settings in `.env.local`:

```
VITE_API_BASE_URL=/api
VITE_USE_MOCK_API=false
```

**`/api` is a relative path on purpose.** The Vite dev server proxies it to
Django (`server.proxy` in `vite.config.js`), so the browser sees a single
origin.

That is not a convenience — it is load-bearing. The refresh token is a
`SameSite` cookie. Pointing this at `http://127.0.0.1:8000` while the app runs
on `http://localhost:5173` makes every API call cross-site (`localhost` and
`127.0.0.1` count as different sites), so the browser refuses to attach that
cookie to the XHR and every silent refresh returns 401 — you get logged out on
any page reload. Same-origin makes the cookie first-party, and removes CORS
preflights from development for free.

In production, serve the SPA and the API from one domain and set this to that
domain's `/api`.

### Endpoints in use

| Method | Path | |
| --- | --- | --- |
| POST | `/api/auth/register/` | → OTP challenge |
| POST | `/api/auth/login/` | → OTP challenge (no token) |
| POST | `/api/auth/verify-otp/` | → session, for `purpose: LOGIN` |
| POST | `/api/auth/resend-otp/` | |
| POST | `/api/auth/refresh/` | reads the httpOnly cookie |
| POST | `/api/auth/logout/` | |
| POST | `/api/auth/forgot-password/` | |
| GET | `/api/accounts/bank-accounts/` | |
| GET, POST | `/api/savings/individual/` | |
| GET | `/api/savings/deposit-targets/` | own goals + club pools |
| GET, POST | `/api/clubs/` | |
| GET | `/api/dashboard/summary/` | one call, whole dashboard |
| POST | `/api/payments/deposits/` | |
| GET | `/api/transactions/` | server-side filtering |
| GET, POST | `/api/emergency/requests/` | |
| POST | `/api/emergency/requests/{id}/approve/` | |
| POST | `/api/emergency/requests/{id}/reject/` | |
| GET | `/api/notifications/` | |
| POST | `/api/notifications/{id}/read/`, `/read-all/` | |

---

## Still stubbed

Each has a `TODO` comment where it slots in:

- **Payment gateway** — deposits are written straight as `SUCCESS`. The real
  Razorpay flow returns `PENDING` and settles on a webhook, which is why the UI
  already renders a pending state.
- **Club invitations** — addresses are accepted and echoed back, but no email
  is sent and no pending member row is created.
- **OTP on emergency approval** — `OtpVerification` already accepts
  `purpose="EMERGENCY_APPROVAL"`; the approve button does not gate on it yet.
- **Biometric device signatures** — the `devices` table and its public-key
  design exist in the backend; nothing signs a challenge yet.
- **Real SMS** — email delivery works today; SMS needs a paid provider.

---

## PWA

`public/manifest.json` plus a minimal service worker in `public/sw.js`
(app-shell caching; **API responses are never cached** — a stale balance is
worse than no balance). The worker registers in production builds only, so it
cannot serve stale bundles during development.

To test it: `npm run build && npm run preview`.

---

## Conventions

- Function components and hooks only. No class components (the one exception is
  `ErrorBoundary`, which React requires to be a class).
- Every data operation goes through a hook in `src/hooks/`, even while mocked.
- Cache keys live in `src/hooks/queryKeys.js` — never inline a key.
- New colours go in `tailwind.config.js` as tokens, not as hex values in JSX.
- Lists and cards load with **skeletons**, not spinners.
- Run `npm run lint` before pushing; CI-style zero-warning policy.

> DigiBank is a student project, not a licensed financial institution.
> Never enter real bank details.
