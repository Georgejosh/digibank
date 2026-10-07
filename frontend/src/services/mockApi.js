/**
 * IN-MEMORY MOCK BACKEND (Phase 1 only)
 * -------------------------------------
 * Stands in for Django + PostgreSQL so the whole app is clickable with no
 * server running. Every function here mirrors one endpoint in endpoints.js and
 * returns the SAME SHAPE the Django serializer will return, using the real
 * column names from backend/apps/<app>/models.py:
 *
 *   savings_accounts : goal_name, target_amount_paise, balance_paise,
 *                      deadline, status, owner_type
 *   groups           : name, creator, status, created_at
 *   transactions     : type, amount_paise, balance_after_paise, status
 *   notifications    : type, title, body, is_read, created_at
 *
 * All money is INTEGER PAISE. See utils/money.js.
 *
 * The seeded data lives in module memory, so a browser reload resets balances
 * back to the seed. The SESSION deliberately does not reset - see the session
 * block below, which stands in for Django's httpOnly refresh cookie.
 *
 * DELETE THIS FILE once every endpoint in endpoints.js exists in Django.
 */

/* ---------------------------------------------------------------- *
 * Helpers
 * ---------------------------------------------------------------- */

/** Fake network latency so skeleton loaders are actually visible. */
const latency = (ms = 450) => new Promise((resolve) => setTimeout(resolve, ms));

let idCounter = 100;
const nextId = () => String(++idCounter);

const daysFromNow = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const HOUR_MS = 3600000;
const hoursAgo = (hours) => new Date(Date.now() - hours * HOUR_MS).toISOString();

/** Mimics a DRF error response so screens handle mock and real failures alike. */
function apiError(message, status = 400, fieldErrors = {}) {
  const error = new Error(message);
  error.status = status;
  error.fieldErrors = fieldErrors;
  return error;
}

/* ---------------------------------------------------------------- *
 * Seed data
 * ---------------------------------------------------------------- */

const demoUser = {
  id: '1',
  name: 'Aarav Menon',
  email: 'aarav@example.com',
  phone: '9876543210',
  kyc_status: 'VERIFIED',
  date_joined: '2026-01-14T09:12:00Z',
  digital_wallet_balance_paise: 1000000, // 10k rupees
  // Gamification: streak is not a Django table yet.
  // TODO(backend): add a `streaks` table (user, current_streak, longest_streak,
  // last_deposit_date) or derive this from the transactions ledger.
  streak: { current_streak: 12, longest_streak: 27, points: 1240, saved_today: true },
};

const db = {
  users: [demoUser],

  bankAccounts: [
    { id: 'bank-1', bank_name: 'HDFC Bank', masked_number: 'XXXX XXXX 4412', is_primary: true },
    {
      id: 'bank-2',
      bank_name: 'State Bank of India',
      masked_number: 'XXXX XXXX 9087',
      is_primary: false,
    },
  ],

  // savings_accounts rows. owner_type INDIVIDUAL = personal goal,
  // owner_type GROUP = the pot behind a club.
  savingsAccounts: [
    {
      id: 'sa-1',
      owner_type: 'INDIVIDUAL',
      user: '1',
      group: null,
      goal_name: 'Emergency fund',
      target_amount_paise: 5000000,
      balance_paise: 3120000,
      deadline: daysFromNow(120),
      status: 'ACTIVE',
      created_at: '2026-03-02T10:00:00Z',
    },
    {
      id: 'sa-2',
      owner_type: 'INDIVIDUAL',
      user: '1',
      group: null,
      goal_name: 'New laptop',
      target_amount_paise: 8500000,
      balance_paise: 2140000,
      deadline: daysFromNow(210),
      status: 'ACTIVE',
      created_at: '2026-05-19T10:00:00Z',
    },
    {
      id: 'sa-3',
      owner_type: 'INDIVIDUAL',
      user: '1',
      group: null,
      goal_name: 'Semester fees',
      target_amount_paise: 4000000,
      balance_paise: 4000000,
      deadline: daysFromNow(-6),
      status: 'UNLOCKED',
      created_at: '2026-01-20T10:00:00Z',
    },
    {
      id: 'sa-4',
      owner_type: 'GROUP',
      user: null,
      group: 'grp-1',
      goal_name: 'Goa trip - December',
      target_amount_paise: 12000000,
      balance_paise: 6850000,
      deadline: daysFromNow(96),
      status: 'ACTIVE',
      created_at: '2026-04-11T10:00:00Z',
    },
    {
      id: 'sa-5',
      owner_type: 'GROUP',
      user: null,
      group: 'grp-2',
      goal_name: 'Home washing machine',
      target_amount_paise: 3500000,
      balance_paise: 2975000,
      deadline: daysFromNow(38),
      status: 'ACTIVE',
      created_at: '2026-06-01T10:00:00Z',
    },
  ],

  groups: [
    {
      id: 'grp-1',
      name: 'Beach Squad',
      creator: '1',
      status: 'ACTIVE',
      created_at: '2026-04-11T10:00:00Z',
      savings_account: 'sa-4',
    },
    {
      id: 'grp-2',
      name: 'Menon Family',
      creator: '2',
      status: 'ACTIVE',
      created_at: '2026-06-01T10:00:00Z',
      savings_account: 'sa-5',
    },
  ],

  groupMembers: [
    {
      id: 'gm-1',
      group: 'grp-1',
      user: '1',
      name: 'Aarav Menon',
      role: 'CREATOR',
      contributed_paise: 2400000,
    },
    {
      id: 'gm-2',
      group: 'grp-1',
      user: '2',
      name: 'Priya Nair',
      role: 'MEMBER',
      contributed_paise: 1950000,
    },
    {
      id: 'gm-3',
      group: 'grp-1',
      user: '3',
      name: 'Rohan Das',
      role: 'MEMBER',
      contributed_paise: 1500000,
    },
    {
      id: 'gm-4',
      group: 'grp-1',
      user: '4',
      name: 'Sneha Iyer',
      role: 'MEMBER',
      contributed_paise: 1000000,
    },
    {
      id: 'gm-5',
      group: 'grp-2',
      user: '2',
      name: 'Priya Nair',
      role: 'CREATOR',
      contributed_paise: 1500000,
    },
    {
      id: 'gm-6',
      group: 'grp-2',
      user: '1',
      name: 'Aarav Menon',
      role: 'MEMBER',
      contributed_paise: 900000,
    },
    {
      id: 'gm-7',
      group: 'grp-2',
      user: '5',
      name: 'Deepak Menon',
      role: 'MEMBER',
      contributed_paise: 575000,
    },
  ],

  transactions: [
    {
      id: 'tx-1',
      savings_account: 'sa-1',
      savings_account_name: 'Emergency fund',
      user: '1',
      type: 'DEPOSIT',
      amount_paise: 500000,
      balance_after_paise: 3120000,
      status: 'SUCCESS',
      gateway_ref: 'UPI-9F2A41',
      created_at: hoursAgo(5),
    },
    {
      id: 'tx-2',
      savings_account: 'sa-4',
      savings_account_name: 'Goa trip - December',
      user: '1',
      type: 'DEPOSIT',
      amount_paise: 750000,
      balance_after_paise: 6850000,
      status: 'SUCCESS',
      gateway_ref: 'UPI-77C1B0',
      created_at: hoursAgo(28),
    },
    {
      id: 'tx-3',
      savings_account: 'sa-2',
      savings_account_name: 'New laptop',
      user: '1',
      type: 'DEPOSIT',
      amount_paise: 300000,
      balance_after_paise: 2140000,
      status: 'SUCCESS',
      gateway_ref: 'UPI-2D8E55',
      created_at: hoursAgo(52),
    },
    {
      id: 'tx-4',
      savings_account: 'sa-5',
      savings_account_name: 'Home washing machine',
      user: '1',
      type: 'DEPOSIT',
      amount_paise: 250000,
      balance_after_paise: 2975000,
      status: 'SUCCESS',
      gateway_ref: 'UPI-B10C93',
      created_at: hoursAgo(74),
    },
    {
      id: 'tx-5',
      savings_account: 'sa-3',
      savings_account_name: 'Semester fees',
      user: '1',
      type: 'WITHDRAWAL',
      amount_paise: 1500000,
      balance_after_paise: 2500000,
      status: 'SUCCESS',
      gateway_ref: 'NEFT-4471AA',
      created_at: hoursAgo(120),
    },
    {
      id: 'tx-6',
      savings_account: 'sa-1',
      savings_account_name: 'Emergency fund',
      user: '1',
      type: 'DEPOSIT',
      amount_paise: 200000,
      balance_after_paise: 2620000,
      status: 'FAILED',
      gateway_ref: 'UPI-0A44F1',
      created_at: hoursAgo(144),
    },
    {
      id: 'tx-7',
      savings_account: 'sa-4',
      savings_account_name: 'Goa trip - December',
      user: '1',
      type: 'DEPOSIT',
      amount_paise: 1000000,
      balance_after_paise: 6100000,
      status: 'SUCCESS',
      gateway_ref: 'UPI-5521CD',
      created_at: hoursAgo(168),
    },
    {
      id: 'tx-8',
      savings_account: 'sa-2',
      savings_account_name: 'New laptop',
      user: '1',
      type: 'DEPOSIT',
      amount_paise: 400000,
      balance_after_paise: 1840000,
      status: 'PENDING',
      gateway_ref: 'UPI-9911EE',
      created_at: hoursAgo(190),
    },
  ],

  notifications: [
    {
      id: 'n-1',
      type: 'APPROVAL_NEEDED',
      title: 'Priya requested an emergency withdrawal',
      body: 'Beach Squad - ₹15,000 for a medical bill. Every member must approve before funds are released.',
      payload: { emergency_request: 'er-1', group: 'grp-1' },
      is_read: false,
      created_at: hoursAgo(3),
    },
    {
      id: 'n-2',
      type: 'GOAL_REACHED',
      title: 'Semester fees is fully funded',
      body: 'You hit your ₹40,000 target. This goal is now unlocked and ready to withdraw.',
      payload: { savings_account: 'sa-3' },
      is_read: false,
      created_at: hoursAgo(20),
    },
    {
      id: 'n-3',
      type: 'DEPOSIT_RECEIVED',
      title: 'Deposit of ₹5,000 confirmed',
      body: 'Added to Emergency fund from HDFC Bank XXXX 4412.',
      payload: { transaction: 'tx-1' },
      is_read: true,
      created_at: hoursAgo(5),
    },
    {
      id: 'n-4',
      type: 'DEADLINE_NEAR',
      title: 'Home washing machine ends in 38 days',
      body: 'The club is ₹5,250 short of its ₹35,000 target.',
      payload: { savings_account: 'sa-5' },
      is_read: true,
      created_at: hoursAgo(30),
    },
    {
      id: 'n-5',
      type: 'GROUP_INVITE',
      title: 'Rohan invited you to "Cricket Kit Fund"',
      body: 'Target ₹18,000 by 30 Nov. Tap to review the club before joining.',
      payload: { group: 'grp-3' },
      is_read: true,
      created_at: hoursAgo(60),
    },
    {
      id: 'n-6',
      type: 'WITHDRAWAL_COMPLETED',
      title: 'Withdrawal of ₹15,000 completed',
      body: 'Sent to State Bank of India XXXX 9087.',
      payload: { transaction: 'tx-5' },
      is_read: true,
      created_at: hoursAgo(120),
    },
  ],

  emergencyRequests: [
    {
      id: 'er-1',
      savings_account: 'sa-4',
      savings_account_name: 'Goa trip - December',
      group: 'grp-1',
      group_name: 'Beach Squad',
      requested_by: '2',
      requested_by_name: 'Priya Nair',
      amount_paise: 1500000,
      reason:
        'Hospital deposit for my father after an accident. I need this today and will repay into the pool next month.',
      status: 'PENDING',
      created_at: hoursAgo(3),
      expires_at: new Date(Date.now() + 21 * HOUR_MS).toISOString(),
      approvals: [
        { user: '2', name: 'Priya Nair', decision: 'APPROVE', decided_at: hoursAgo(3) },
        { user: '3', name: 'Rohan Das', decision: 'APPROVE', decided_at: hoursAgo(2) },
        { user: '1', name: 'Aarav Menon', decision: null, decided_at: null },
        { user: '4', name: 'Sneha Iyer', decision: null, decided_at: null },
      ],
    },
  ],
};

/**
 * OTP codes are never generated client-side in production. This constant exists
 * purely so a reviewer can walk the signup flow without a real SMS.
 */
export const DEMO_OTP = '123456';

/* ---------------------------------------------------------------- *
 * Session
 * ---------------------------------------------------------------- *
 * Stands in for the refresh token Django will set as an httpOnly cookie.
 *
 * IMPORTANT - what this is and is not:
 *   - It stores NO token and NO credentials. It is an opaque marker saying
 *     "a session exists for this user id", which is all the mock needs to
 *     decide whether /auth/refresh/ should succeed.
 *   - The ACCESS token is still minted fresh on every refresh and still lives
 *     only in services/tokenStore.js memory. That rule is not bent here.
 *
 * Without this, a page reload would drop the mock session and bounce the user
 * to /login, which is NOT how the finished app behaves - Django's httpOnly
 * cookie survives a reload and silently restores the session. Simulating it
 * keeps the demo faithful to the real flow.
 *
 * A real httpOnly cookie cannot be written from JavaScript, so this one is
 * readable. That is a property of the MOCK only and disappears with this file.
 */
const SESSION_COOKIE = 'digibank_mock_session';

function readSessionCookie() {
  const match = document.cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeSessionCookie(userId) {
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(userId)}; path=/; SameSite=Strict`;
}

function clearSessionCookie() {
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; SameSite=Strict`;
}

let session = { user: null };
const fakeToken = () => `mock.access.${Math.random().toString(36).slice(2)}.${Date.now()}`;
const currentUser = () => session.user ?? demoUser;

/* ---------------------------------------------------------------- *
 * Derived helpers
 * ---------------------------------------------------------------- */
const individualGoals = () =>
  db.savingsAccounts.filter((a) => a.owner_type === 'INDIVIDUAL' && a.user === '1');

const myGroupIds = () => db.groupMembers.filter((m) => m.user === '1').map((m) => m.group);

function serialiseClub(group) {
  const account = db.savingsAccounts.find((a) => a.id === group.savings_account);
  const members = db.groupMembers.filter((m) => m.group === group.id);
  const me = members.find((m) => m.user === '1');
  return {
    ...group,
    member_count: members.length,
    members,
    goal_name: account?.goal_name ?? '',
    target_amount_paise: account?.target_amount_paise ?? 0,
    balance_paise: account?.balance_paise ?? 0,
    deadline: account?.deadline ?? null,
    account_status: account?.status ?? 'ACTIVE',
    savings_account_id: account?.id ?? null,
    my_contribution_paise: me?.contributed_paise ?? 0,
    my_role: me?.role ?? 'MEMBER',
  };
}

/* ---------------------------------------------------------------- *
 * The mock "server"
 * ---------------------------------------------------------------- */
export const mockApi = {
  /* ---------------------------- AUTH ---------------------------- */

  async register(payload) {
    await latency(700);
    if (db.users.some((u) => u.email === payload.email?.toLowerCase())) {
      throw apiError('An account with this email already exists.', 400, {
        email: 'An account with this email already exists.',
      });
    }
    const user = {
      id: nextId(),
      name: payload.name,
      email: payload.email.toLowerCase(),
      phone: payload.phone,
      kyc_status: 'PENDING',
      date_joined: new Date().toISOString(),
      streak: { current_streak: 0, longest_streak: 0, points: 0, saved_today: false },
    };
    db.users.push(user);
    // Django would create an otp_verifications row and send the SMS here.
    return { user, otp_sent_to: user.phone, purpose: 'SIGNUP_VERIFICATION' };
  },

  async login({ identifier, password }) {
    await latency(650);
    if (!password || password.length < 4) {
      throw apiError('Incorrect email/phone or password.', 401);
    }
    const id = String(identifier).trim().toLowerCase();
    const user =
      db.users.find((u) => u.email === id || u.phone === id.replace(/^(\+91|0)/, '')) ?? demoUser;

    session = { user };
    writeSessionCookie(user.id);
    // Django sets the refresh token as an httpOnly cookie; only the access
    // token comes back in the body.
    return { access_token: fakeToken(), user };
  },

  async refresh() {
    await latency(250);
    const userId = readSessionCookie();
    if (!userId) {
      throw apiError('Refresh cookie missing or expired.', 401);
    }
    // After a reload the module-level `session` is gone but the cookie is not,
    // so re-hydrate the user from it - exactly what Django does.
    const user = session.user ?? db.users.find((u) => u.id === userId) ?? demoUser;
    session = { user };
    return { access_token: fakeToken(), user };
  },

  async logout() {
    await latency(200);
    session = { user: null };
    clearSessionCookie();
    return { detail: 'Signed out.' };
  },

  async verifyOtp({ code, purpose }) {
    await latency(600);
    if (code !== DEMO_OTP) {
      throw apiError('That code is not correct. Please try again.', 400, {
        code: 'That code is not correct.',
      });
    }
    return { verified: true, purpose };
  },

  async resendOtp({ purpose }) {
    await latency(500);
    return { detail: 'A new code is on its way.', purpose };
  },

  async forgotPassword({ email }) {
    await latency(700);
    // Always the same answer whether or not the address exists - otherwise this
    // endpoint tells an attacker which emails are registered.
    return { detail: `If an account exists for ${email}, a reset link is on its way.` };
  },

  /* -------------------------- DASHBOARD -------------------------- */

  async dashboardSummary() {
    await latency(550);
    const goals = individualGoals();
    const clubs = db.groups.filter((g) => myGroupIds().includes(g.id)).map(serialiseClub);

    const individualSavedPaise = goals.reduce((sum, g) => sum + g.balance_paise, 0);
    const clubContributedPaise = clubs.reduce((sum, c) => sum + c.my_contribution_paise, 0);

    return {
      total_saved_paise: individualSavedPaise + clubContributedPaise,
      individual_saved_paise: individualSavedPaise,
      club_contributed_paise: clubContributedPaise,
      active_clubs: clubs.filter((c) => c.status === 'ACTIVE').length,
      individual_goals: goals.filter((g) => g.status === 'ACTIVE').length,
      locked_paise: goals
        .filter((g) => g.status === 'ACTIVE')
        .reduce((sum, g) => sum + g.balance_paise, 0),
      pending_approvals: db.emergencyRequests.filter(
        (r) => r.status === 'PENDING' && r.approvals.some((a) => a.user === '1' && !a.decision)
      ).length,
      streak: currentUser().streak,
      recent_activity: db.transactions.slice(0, 5),
    };
  },

  /* ---------------------- INDIVIDUAL SAVINGS --------------------- */

  async listSavingsGoals() {
    await latency(500);
    return individualGoals();
  },

  async createSavingsGoal({ goal_name, target_amount_paise, deadline }) {
    await latency(800);
    const goal = {
      id: `sa-${nextId()}`,
      owner_type: 'INDIVIDUAL',
      user: '1',
      group: null,
      goal_name,
      target_amount_paise,
      balance_paise: 0,
      deadline,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    };
    db.savingsAccounts.unshift(goal);
    return goal;
  },

  /* ------------------------ CLUBS (groups) ----------------------- */

  async listClubs() {
    await latency(520);
    return db.groups.filter((g) => myGroupIds().includes(g.id)).map(serialiseClub);
  },

  async createClub({ name, goal_name, target_amount_paise, deadline, invites = [] }) {
    await latency(900);
    const accountId = `sa-${nextId()}`;
    const groupId = `grp-${nextId()}`;

    db.savingsAccounts.unshift({
      id: accountId,
      owner_type: 'GROUP',
      user: null,
      group: groupId,
      goal_name,
      target_amount_paise,
      balance_paise: 0,
      deadline,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    });

    const group = {
      id: groupId,
      name,
      creator: '1',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      savings_account: accountId,
    };
    db.groups.unshift(group);
    db.groupMembers.push({
      id: `gm-${nextId()}`,
      group: groupId,
      user: '1',
      name: currentUser().name,
      role: 'CREATOR',
      contributed_paise: 0,
    });

    // TODO(backend): POST /api/clubs/{id}/invite/ should create pending
    // group_members rows and email each invitee. Stubbed here: the invite list
    // is echoed back but no member row is created.
    return { ...serialiseClub(group), invited: invites };
  },

  /* --------------------------- DEPOSITS -------------------------- */

  async listBankAccounts() {
    await latency(300);
    return db.bankAccounts;
  },

  /** Every savings account the user can pay into (own goals + club goals). */
  async listDepositTargets() {
    await latency(300);
    const clubAccounts = db.groups
      .filter((g) => myGroupIds().includes(g.id))
      .map((g) => {
        const account = db.savingsAccounts.find((a) => a.id === g.savings_account);
        return account ? { ...account, club_name: g.name } : null;
      })
      .filter(Boolean);

    const personal = db.savingsAccounts.filter(
      (a) => a.owner_type === 'INDIVIDUAL' && a.status === 'ACTIVE'
    );
    return [...personal, ...clubAccounts];
  },

  async listWithdrawalTargets() {
    await latency(300);
    return db.savingsAccounts.filter((a) => a.status === 'UNLOCKED');
  },

  async createWithdrawal({ savings_account_id, amount_paise }) {
    await latency(800);
    const account = db.savingsAccounts.find((a) => a.id === savings_account_id);
    if (!account) throw apiError('Account not found');
    if (account.status !== 'UNLOCKED') throw apiError('Goal is locked');
    if (account.balance_paise < amount_paise) throw apiError('Insufficient balance');

    account.balance_paise -= amount_paise;
    if (account.balance_paise === 0) account.status = 'WITHDRAWN';

    demoUser.digital_wallet_balance_paise += amount_paise;

    const newTx = {
      id: `tx-${nextId()}`,
      savings_account: account.id,
      savings_account_name: account.goal_name,
      user: '1',
      type: 'WITHDRAWAL',
      amount_paise,
      balance_after_paise: account.balance_paise,
      status: 'SUCCESS',
      gateway_ref: `MOCK-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    db.transactions.unshift(newTx);
    return { data: newTx };
  },

  async createWalletDeposit({ amount_paise }) {
    await latency(600);
    demoUser.digital_wallet_balance_paise += amount_paise;
    return {
      data: {
        detail: `Deposited Rs ${amount_paise / 100} into digital wallet.`,
        new_balance_paise: demoUser.digital_wallet_balance_paise
      }
    };
  },

  async createWalletWithdrawal({ amount_paise }) {
    await latency(600);
    if (demoUser.digital_wallet_balance_paise < amount_paise) {
      throw apiError('Insufficient digital wallet balance');
    }
    demoUser.digital_wallet_balance_paise -= amount_paise;
    return {
      data: {
        detail: `Withdrew Rs ${amount_paise / 100} from digital wallet.`,
        new_balance_paise: demoUser.digital_wallet_balance_paise
      }
    };
  },
  async createDeposit({ savings_account_id, amount_paise }) {
    await latency(1100);
    const account = db.savingsAccounts.find((a) => a.id === savings_account_id);
    if (!account) throw apiError('That savings goal no longer exists.', 404);

    if (demoUser.digital_wallet_balance_paise < amount_paise) {
      throw apiError('Insufficient digital wallet balance', 400);
    }
    demoUser.digital_wallet_balance_paise -= amount_paise;

    account.balance_paise += amount_paise;
    if (account.balance_paise >= account.target_amount_paise) account.status = 'UNLOCKED';

    // Paying into a club must also credit YOUR share of the pool, or the club
    // card would show a bigger pot with your contribution unchanged.
    if (account.owner_type === 'GROUP') {
      const membership = db.groupMembers.find((m) => m.group === account.group && m.user === '1');
      if (membership) membership.contributed_paise += amount_paise;
    }

    const tx = {
      id: `tx-${nextId()}`,
      savings_account: account.id,
      savings_account_name: account.goal_name,
      user: '1',
      type: 'DEPOSIT',
      amount_paise,
      balance_after_paise: account.balance_paise,
      status: 'SUCCESS',
      gateway_ref: `UPI-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      created_at: new Date().toISOString(),
      linked_bank_account: linked_bank_account_id,
    };
    db.transactions.unshift(tx);

    db.notifications.unshift({
      id: `n-${nextId()}`,
      type: 'DEPOSIT_RECEIVED',
      title: 'Deposit confirmed',
      body: `Added to ${account.goal_name}.`,
      payload: { transaction: tx.id },
      is_read: false,
      created_at: new Date().toISOString(),
    });

    // Depositing keeps the daily streak alive.
    const user = currentUser();
    if (!user.streak.saved_today) {
      const next = user.streak.current_streak + 1;
      user.streak = {
        current_streak: next,
        longest_streak: Math.max(user.streak.longest_streak, next),
        points: user.streak.points + 10,
        saved_today: true,
      };
    }

    return tx;
  },

  /* -------------------------- WITHDRAWALS ------------------------ */

  async listWithdrawalTargets() {
    await latency(300);
    return individualGoals().filter((a) => a.balance_paise > 0);
  },

  async createWithdrawal({ savings_account_id, amount_paise, linked_bank_account_id }) {
    await latency(1100);
    const account = db.savingsAccounts.find((a) => a.id === savings_account_id);
    if (!account) throw apiError('That savings goal no longer exists.', 404);

    if (account.owner_type !== 'INDIVIDUAL' || account.user !== '1') {
      throw apiError('Direct withdrawal is only allowed for your individual savings goals.', 403);
    }

    if (account.status !== 'UNLOCKED') {
      throw apiError('Withdrawal restricted: Goal is still ACTIVE and locked.', 400);
    }

    if (amount_paise > account.balance_paise) {
      throw apiError(`Insufficient balance. Available balance is ₹${(account.balance_paise / 100).toFixed(2)}.`, 400);
    }

    account.balance_paise -= amount_paise;
    if (account.balance_paise === 0) account.status = 'WITHDRAWN';

    const tx = {
      id: `tx-${nextId()}`,
      savings_account: account.id,
      savings_account_name: account.goal_name,
      user: '1',
      type: 'WITHDRAWAL',
      amount_paise,
      balance_after_paise: account.balance_paise,
      status: 'SUCCESS',
      gateway_ref: `WDR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      created_at: new Date().toISOString(),
      linked_bank_account: linked_bank_account_id,
    };
    db.transactions.unshift(tx);

    db.notifications.unshift({
      id: `n-${nextId()}`,
      type: 'WITHDRAWAL_APPROVED',
      title: 'Withdrawal processed',
      body: `Withdrew ₹${(amount_paise / 100).toFixed(2)} from ${account.goal_name}.`,
      payload: { transaction: tx.id },
      is_read: false,
      created_at: new Date().toISOString(),
    });

    return tx;
  },

  /* ------------------------- TRANSACTIONS ------------------------ */

  async listTransactions({ type = 'ALL', status = 'ALL', accountId = 'ALL', search = '' } = {}) {
    await latency(480);
    const term = search.trim().toLowerCase();
    return db.transactions.filter((tx) => {
      if (type !== 'ALL' && tx.type !== type) return false;
      if (status !== 'ALL' && tx.status !== status) return false;
      if (accountId !== 'ALL' && tx.savings_account !== accountId) return false;
      if (term) {
        const haystack = `${tx.savings_account_name} ${tx.gateway_ref}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  },

  /* --------------------- EMERGENCY WITHDRAWAL -------------------- */

  async listEmergencyRequests() {
    await latency(500);
    return db.emergencyRequests;
  },

  async createEmergencyRequest({ savings_account_id, amount_paise, reason }) {
    await latency(900);
    const account = db.savingsAccounts.find((a) => a.id === savings_account_id);
    const group = db.groups.find((g) => g.savings_account === savings_account_id);
    if (!account || !group) throw apiError('Pick a club goal to withdraw from.', 400);

    const members = db.groupMembers.filter((m) => m.group === group.id);
    const request = {
      id: `er-${nextId()}`,
      savings_account: account.id,
      savings_account_name: account.goal_name,
      group: group.id,
      group_name: group.name,
      requested_by: '1',
      requested_by_name: currentUser().name,
      amount_paise,
      reason,
      status: 'PENDING',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * HOUR_MS).toISOString(),
      approvals: members.map((m) => ({
        user: m.user,
        name: m.name,
        // The requester implicitly approves their own request.
        decision: m.user === '1' ? 'APPROVE' : null,
        decided_at: m.user === '1' ? new Date().toISOString() : null,
      })),
    };
    db.emergencyRequests.unshift(request);
    return request;
  },

  /**
   * TODO(backend): the unanimous-consent rule is deliberately NOT implemented
   * here. Counting approvals in the browser would let anyone flip a request to
   * APPROVED from the devtools console. Django decides, guarded by the
   * uniq_group_member constraint plus an OTP and a device signature per
   * approval. This mock only records the current user's own vote.
   */
  async decideEmergencyRequest({ requestId, decision }) {
    await latency(700);
    const request = db.emergencyRequests.find((r) => r.id === requestId);
    if (!request) throw apiError('That request no longer exists.', 404);

    const mine = request.approvals.find((a) => a.user === '1');
    if (mine) {
      mine.decision = decision;
      mine.decided_at = new Date().toISOString();
    }
    if (decision === 'REJECT') request.status = 'REJECTED';
    else if (request.approvals.every((a) => a.decision === 'APPROVE')) request.status = 'APPROVED';

    return request;
  },

  /* ------------------------ NOTIFICATIONS ------------------------ */

  async listNotifications() {
    await latency(420);
    return db.notifications;
  },

  async markNotificationRead(id) {
    await latency(200);
    const n = db.notifications.find((x) => x.id === id);
    if (n) n.is_read = true;
    return n;
  },

  async markAllNotificationsRead() {
    await latency(350);
    db.notifications.forEach((n) => {
      n.is_read = true;
    });
    return db.notifications;
  },
};

export default mockApi;
