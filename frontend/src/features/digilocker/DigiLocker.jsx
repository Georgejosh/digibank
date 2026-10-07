import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  CalendarClock,
  CheckCircle2,
  Info,
  Lock,
  LockOpen,
  PiggyBank,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Users,
  Vault,
  Wallet,
} from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { MoneyInput } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton, SkeletonGoalCard } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Amount, PrivacyToggle } from '@/components/money/Amount';
import { TransferModal } from '@/components/money/TransferModal';
import { useAuth } from '@/hooks/useAuth';
import {
  useCreateDeposit,
  useCreateWithdrawal,
  useDepositTargets,
  useWithdrawalTargets,
} from '@/hooks/useDeposits';
import { useBiometricApproval } from '@/hooks/useBiometrics';
import { useToast } from '@/context/ToastContext';
import { formatPaise, progressPercent, rupeesToPaise } from '@/utils/money';
import { formatDate } from '@/utils/date';
import { lockState } from '@/utils/lock';
import { cn } from '@/utils/cn';

/*
 * Limits mirror the Django serializers (CreateDepositSerializer and
 * CreateWithdrawalSerializer). They are here to give an instant message, not
 * to enforce anything - the API re-validates every request.
 */
const LIMITS = {
  deposit: { min: 1, max: 200000 },
  withdraw: { min: 100, max: 100000 },
};
const QUICK_AMOUNTS = { deposit: [500, 1000, 2000, 5000], withdraw: [500, 1000, 5000, 10000] };
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'goal', label: 'My goals' },
  { value: 'club', label: 'Clubs' },
];

/**
 * DigiLocker - deposit and withdrawal as one locker.
 *
 * Every goal and club pool is a compartment. Money only ever moves between a
 * compartment and the user's own Digital Wallet:
 *
 *   Deposit:   Wallet  ->  compartment   (POST /payments/deposits/)
 *   Withdraw:  compartment  ->  Wallet   (POST /payments/withdrawals/)
 *
 * The page only DESCRIBES which compartments are open; whether money may
 * actually leave one is decided by Django on every request.
 */
export function DigiLocker() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get('mode') === 'withdraw' ? 'withdraw' : 'deposit';
  const isDeposit = mode === 'deposit';

  const { user } = useAuth();
  const walletPaise = user?.digital_wallet_balance_paise ?? 0;

  const { data: depositTargets, isPending: depositLoading } = useDepositTargets();
  const { data: withdrawalTargets, isPending: withdrawLoading } = useWithdrawalTargets();
  const createDeposit = useCreateDeposit();
  const createWithdrawal = useCreateWithdrawal();
  const biometric = useBiometricApproval();
  const toast = useToast();

  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(
    location.state?.savingsAccountId ?? searchParams.get('account') ?? null
  );
  const [amount, setAmount] = useState('');
  const [touched, setTouched] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [receipt, setReceipt] = useState(null);

  // One list of compartments: everything the user may pay into, plus anything
  // they may withdraw from (an unlocked goal no longer accepts deposits).
  const compartments = useMemo(() => {
    const byId = new Map();
    const depositIds = new Set((depositTargets ?? []).map((t) => String(t.id)));
    const withdrawIds = new Set((withdrawalTargets ?? []).map((t) => String(t.id)));
    [...(depositTargets ?? []), ...(withdrawalTargets ?? [])].forEach((t) => {
      const id = String(t.id);
      if (byId.has(id)) return;
      const lock = lockState(t);
      byId.set(id, {
        ...t,
        id,
        kind: t.club_name || t.owner_type === 'GROUP' ? 'club' : 'goal',
        canDeposit: depositIds.has(id),
        // Displayed from the server's own is_withdrawal_allowed flag.
        canWithdraw: withdrawIds.has(id) && (t.is_withdrawal_allowed ?? lock.unlocked),
        unlocked: t.is_withdrawal_allowed ?? lock.unlocked,
        daysLeft: lock.daysLeft,
      });
    });
    return [...byId.values()];
  }, [depositTargets, withdrawalTargets]);

  const isLoading = depositLoading || withdrawLoading;
  const lockerTotal = compartments.reduce((sum, c) => sum + (c.balance_paise ?? 0), 0);
  const unlockedCount = compartments.filter((c) => c.canWithdraw).length;
  const visible = compartments.filter((c) => filter === 'all' || c.kind === filter);

  const usable = (c) => (isDeposit ? c.canDeposit : c.canWithdraw);
  const selected = compartments.find((c) => c.id === String(selectedId));
  const selectedUsable = selected && usable(selected);

  // Keep a valid compartment selected as the mode or the data changes.
  useEffect(() => {
    if (!compartments.length) return;
    if (!selected || !usable(selected)) {
      const first = compartments.find(usable);
      setSelectedId(first ? first.id : selected?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, compartments]);

  const switchMode = (next) => {
    const params = new URLSearchParams(searchParams);
    params.set('mode', next);
    setSearchParams(params, { replace: true });
    setAmount('');
    setTouched(false);
  };

  // ---- Amount validation (UX only) --------------------------------------
  const amountRupees = Number(amount);
  const amountPaise = rupeesToPaise(amount);
  const sourcePaise = isDeposit ? walletPaise : selected?.balance_paise ?? 0;
  const limits = LIMITS[mode];
  let amountError = null;
  if (amount === '' || !Number.isFinite(amountRupees) || amountRupees <= 0) {
    amountError = 'Enter an amount';
  } else if (amountRupees < limits.min) {
    amountError = `Minimum is ₹${limits.min.toLocaleString('en-IN')}`;
  } else if (amountRupees > limits.max) {
    amountError = `Maximum per transaction is ₹${limits.max.toLocaleString('en-IN')}`;
  } else if (amountPaise > sourcePaise) {
    amountError = isDeposit
      ? 'Not enough money in your wallet'
      : 'More than this compartment holds';
  }

  const maxPaise = Math.min(sourcePaise, limits.max * 100);
  const compartmentAfter = selected
    ? selected.balance_paise + (isDeposit ? amountPaise : -amountPaise)
    : 0;
  const walletAfter = walletPaise + (isDeposit ? -amountPaise : amountPaise);
  const projectedPercent = selected
    ? progressPercent(Math.max(0, compartmentAfter), selected.target_amount_paise)
    : 0;

  const canReview = selectedUsable && !amountError;

  const walletParty = { icon: Wallet, label: 'Digital Wallet', sub: user?.name };
  const compartmentParty = selected
    ? {
        icon: selected.kind === 'club' ? Users : PiggyBank,
        label: selected.goal_name,
        sub: selected.club_name ? `Club · ${selected.club_name}` : 'Personal goal',
      }
    : { icon: Vault, label: 'Choose a compartment' };
  const from = isDeposit ? walletParty : compartmentParty;
  const to = isDeposit ? compartmentParty : walletParty;
  const mutation = isDeposit ? createDeposit : createWithdrawal;

  const openReview = () => {
    setTouched(true);
    if (canReview) {
      setReceipt(null);
      setReviewOpen(true);
    }
  };

  const confirm = async () => {
    // Withdrawals may need a face/fingerprint scan first. Deposits never do -
    // locking money away is not the risky direction.
    let biometricToken;
    if (!isDeposit) {
      try {
        biometricToken = await biometric.approve();
      } catch (error) {
        toast.error('Scan not confirmed', error.message);
        return;
      }
    }
    try {
      const tx = await mutation.mutateAsync({
        savings_account_id: Number(selected.id),
        amount_paise: amountPaise,
        biometric_token: biometricToken,
      });
      setReceipt({
        amount_paise: tx.amount_paise,
        reference: tx.gateway_ref,
        created_at: tx.created_at,
        message: isDeposit
          ? `Locked into ${tx.savings_account_name}`
          : `Released to your Digital Wallet`,
      });
      setAmount('');
      setTouched(false);
    } catch {
      // The hook's toast shows the server's reason; close the dialog so the
      // user can correct the amount.
      setReviewOpen(false);
    }
  };

  const closeReview = () => {
    if (mutation.isPending) return;
    setReviewOpen(false);
    setReceipt(null);
  };

  return (
    <div className="animate-fade-in">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">
            Secure savings vault
          </p>
          <h1 className="mt-1 text-title text-ink-900">DigiLocker</h1>
          <p className="mt-1 max-w-xl text-sm text-ink-500">
            Lock money from your wallet into a goal, or release unlocked savings back to your
            wallet. Money never leaves your own accounts.
          </p>
        </div>
      </header>

      {/* ------------------------------------------------ Vault header */}
      <section
        aria-label="Locker overview"
        className="relative overflow-hidden rounded-[1.25rem] bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 p-5 text-white shadow-card-hover sm:p-7"
      >
        <VaultBackdrop />
        <div className="relative grid items-center gap-6 md:grid-cols-[1fr_auto_1fr]">
          <BalanceBlock
            icon={Wallet}
            label="Wallet balance"
            paise={walletPaise}
            footer={
              <Link to="/app/wallet" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-200 hover:text-white">
                <Plus aria-hidden="true" className="h-3.5 w-3.5" /> Add money
              </Link>
            }
            action={<PrivacyToggle tone="dark" />}
          />

          <VaultDial mode={mode} />

          <BalanceBlock
            align="right"
            icon={Vault}
            label="Inside your locker"
            paise={lockerTotal}
            footer={
              <span className="text-xs text-brand-200">
                {compartments.length} compartment{compartments.length === 1 ? '' : 's'} ·{' '}
                {unlockedCount} unlocked
              </span>
            }
          />
        </div>

        {/* Mode switch */}
        <div
          role="tablist"
          aria-label="Locker action"
          className="relative mx-auto mt-6 grid max-w-md grid-cols-2 rounded-full bg-white/10 p-1 ring-1 ring-inset ring-white/15"
        >
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-full bg-white shadow transition-transform duration-300 ease-out',
              isDeposit ? 'translate-x-1' : 'translate-x-[calc(100%+0.25rem)]'
            )}
          />
          {[
            { value: 'deposit', label: 'Deposit', sub: 'Wallet → Locker', icon: ArrowDownToLine },
            { value: 'withdraw', label: 'Withdraw', sub: 'Locker → Wallet', icon: ArrowUpFromLine },
          ].map(({ value, label, sub, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => switchMode(value)}
              className={cn(
                'relative z-10 flex flex-col items-center rounded-full px-3 py-2 transition-colors',
                mode === value ? 'text-brand-900' : 'text-white/80 hover:text-white'
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Icon aria-hidden="true" className="h-4 w-4" />
                {label}
              </span>
              <span className={cn('text-[11px]', mode === value ? 'text-brand-700' : 'text-white/60')}>
                {sub}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* --------------------------------------- Compartments + panel */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="Locker compartments">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-heading text-ink-900">
              {isDeposit ? 'Choose where to lock it' : 'Choose what to release'}
            </h2>
            <div className="flex gap-1 rounded-full bg-ink-100 p-1">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilter(f.value)}
                  aria-pressed={filter === f.value}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                    filter === f.value ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <SkeletonGoalCard />
              <SkeletonGoalCard />
            </div>
          ) : !compartments.length ? (
            <Card>
              <EmptyState
                icon={Vault}
                title="Your locker is empty"
                description="Create a savings goal or join a club - each one becomes a compartment here."
                action={
                  <Link
                    to="/app/savings/new"
                    className="inline-flex h-11 items-center gap-2 rounded-field bg-brand-700 px-5 text-sm font-semibold text-white shadow-field hover:bg-brand-800"
                  >
                    <Plus aria-hidden="true" className="h-4 w-4" /> Create a goal
                  </Link>
                }
              />
            </Card>
          ) : !visible.length ? (
            <Card>
              <CardBody className="py-10 text-center text-sm text-ink-500">
                Nothing in this view.
              </CardBody>
            </Card>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {visible.map((c) => (
                <li key={c.id}>
                  <Compartment
                    compartment={c}
                    mode={mode}
                    usable={usable(c)}
                    selected={selected?.id === c.id}
                    onSelect={() => setSelectedId(c.id)}
                  />
                </li>
              ))}
            </ul>
          )}

          <Link
            to="/app/savings/new"
            className="mt-4 flex items-center justify-center gap-2 rounded-card border-2 border-dashed border-ink-200 p-4 text-sm font-semibold text-ink-500 transition-colors hover:border-brand-300 hover:text-brand-700"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Add a new compartment
          </Link>
        </section>

        {/* Action panel */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="overflow-hidden">
            <div className="border-b border-ink-100 bg-ink-50/60 px-5 py-4">
              <p className="text-label text-ink-500">{isDeposit ? 'Deposit' : 'Withdraw'}</p>
              <FlowStrip from={from} to={to} />
            </div>

            <CardBody className="space-y-4">
              {isLoading ? (
                <>
                  <Skeleton className="h-11 w-full" />
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="h-12 w-full" />
                </>
              ) : (
                <>
                  <div>
                    <MoneyInput
                      label="Amount"
                      placeholder="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      onBlur={() => amount && setTouched(true)}
                      error={touched && selectedUsable ? amountError : undefined}
                      disabled={!selectedUsable}
                    />
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {QUICK_AMOUNTS[mode].map((value) => (
                        <button
                          key={value}
                          type="button"
                          disabled={!selectedUsable}
                          onClick={() => {
                            setAmount(String(value));
                            setTouched(true);
                          }}
                          className={cn(
                            'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50',
                            amountRupees === value
                              ? 'bg-brand-700 text-white'
                              : 'bg-ink-100 text-ink-700 hover:bg-ink-200'
                          )}
                        >
                          ₹{value.toLocaleString('en-IN')}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={!selectedUsable || maxPaise <= 0}
                        onClick={() => {
                          setAmount(String(Math.floor(maxPaise / 100)));
                          setTouched(true);
                        }}
                        className="rounded-full px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 transition-colors hover:bg-brand-50 disabled:opacity-50"
                      >
                        Max
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-ink-500">
                      Available {isDeposit ? 'in wallet' : 'to release'}:{' '}
                      <span className="font-semibold text-ink-800">{formatPaise(sourcePaise)}</span>
                    </p>
                  </div>

                  {!selectedUsable && selected && (
                    <LockedNotice compartment={selected} mode={mode} />
                  )}

                  {isDeposit && walletPaise === 0 && (
                    <div className="flex items-start gap-2.5 rounded-field bg-accent-50 p-3 text-xs text-accent-900">
                      <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />
                      <p>
                        Your wallet is empty.{' '}
                        <Link to="/app/wallet" className="font-semibold underline">
                          Add money to your wallet
                        </Link>{' '}
                        first, then lock it here.
                      </p>
                    </div>
                  )}

                  {selectedUsable && amountPaise > 0 && !amountError && (
                    <div className="rounded-field border border-brand-100 bg-brand-50/50 p-3.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-800">
                        After this {isDeposit ? 'deposit' : 'withdrawal'}
                      </p>
                      <dl className="mt-2 space-y-1.5 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-ink-600">Wallet</dt>
                          <dd className="font-semibold tabular-nums text-ink-900">{formatPaise(walletAfter)}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="truncate pr-2 text-ink-600">{selected.goal_name}</dt>
                          <dd className="font-semibold tabular-nums text-ink-900">{formatPaise(compartmentAfter)}</dd>
                        </div>
                      </dl>
                      <ProgressBar
                        value={projectedPercent}
                        size="sm"
                        tone={projectedPercent >= 100 ? 'success' : 'brand'}
                        className="mt-3"
                        label="Projected progress"
                      />
                      {isDeposit && projectedPercent >= 100 && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-success-700">
                          <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
                          This completes the goal and unlocks it.
                        </p>
                      )}
                    </div>
                  )}

                  <Button
                    size="lg"
                    fullWidth
                    onClick={openReview}
                    disabled={!selectedUsable}
                    leftIcon={isDeposit ? Lock : LockOpen}
                  >
                    {isDeposit ? 'Review deposit' : 'Review withdrawal'}
                  </Button>

                  <p className="flex items-center justify-center gap-1.5 text-[11px] text-ink-400">
                    <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
                    No fees · Instant · Every move is recorded in your statement
                  </p>
                </>
              )}
            </CardBody>
          </Card>

          <Card className="mt-4">
            <CardBody className="space-y-3 text-sm">
              <h3 className="font-semibold text-ink-900">How DigiLocker works</h3>
              <Rule icon={Lock} title="Deposits lock instantly">
                Money moves from your wallet into a compartment and stays until its target or date is reached.
              </Rule>
              <Rule icon={LockOpen} title="Withdrawals go to your wallet">
                Unlocked goals release straight back to your Digital Wallet, ready to use or send to your bank.
              </Rule>
              <Rule icon={ShieldAlert} title="Clubs need everyone">
                Club money only leaves through an emergency request every member approves.
              </Rule>
            </CardBody>
          </Card>
        </aside>
      </div>

      <TransferModal
        open={reviewOpen}
        onClose={closeReview}
        title={isDeposit ? 'Confirm deposit' : 'Confirm withdrawal'}
        amountPaise={amountPaise}
        from={from}
        to={to}
        confirmLabel={isDeposit ? 'Lock money' : biometric.required ? 'Scan & release' : 'Release to wallet'}
        biometric={!isDeposit && biometric.required}
        details={[
          { label: 'Transfer fee', value: '₹0.00' },
          { label: 'Wallet after', value: formatPaise(walletAfter) },
          { label: `${selected?.goal_name ?? 'Compartment'} after`, value: formatPaise(compartmentAfter), emphasis: true },
        ]}
        onConfirm={confirm}
        isLoading={mutation.isPending || biometric.isScanning}
        scanning={biometric.isScanning}
        receipt={receipt}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function BalanceBlock({ icon: Icon, label, paise, footer, action, align = 'left' }) {
  return (
    <div className={cn('min-w-0', align === 'right' && 'md:text-right')}>
      <div className={cn('flex items-center gap-2', align === 'right' && 'md:justify-end')}>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
          <Icon aria-hidden="true" className="h-4 w-4 text-brand-100" />
        </span>
        <p className="text-sm font-medium text-brand-100">{label}</p>
        {action}
      </div>
      <p className="mt-2 truncate text-[2rem] font-bold leading-tight tracking-tight">
        <Amount paise={paise} />
      </p>
      <div className="mt-1">{footer}</div>
    </div>
  );
}

/** The combination dial: turns one way to deposit, the other to withdraw. */
function VaultDial({ mode }) {
  const ticks = Array.from({ length: 40 }, (_, i) => i);
  return (
    <div className="mx-auto hidden md:block" aria-hidden="true">
      <div className="relative h-36 w-36 rounded-full bg-gradient-to-br from-white/20 to-white/5 p-2 shadow-[inset_0_2px_12px_rgba(0,0,0,0.35)] ring-1 ring-white/20">
        <svg
          viewBox="0 0 100 100"
          className={cn(
            'h-full w-full transition-transform duration-700 ease-out',
            mode === 'deposit' ? 'rotate-0' : 'rotate-[135deg]'
          )}
        >
          <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
          {ticks.map((i) => (
            <line
              key={i}
              x1="50"
              y1="5"
              x2="50"
              y2={i % 5 === 0 ? 12 : 9}
              stroke={i === 0 ? '#FCB02F' : 'rgba(255,255,255,0.45)'}
              strokeWidth={i === 0 ? 2.2 : 1}
              transform={`rotate(${i * 9} 50 50)`}
            />
          ))}
        </svg>
        <div className="absolute inset-7 flex items-center justify-center rounded-full bg-gradient-to-br from-brand-700 to-brand-900 shadow-lg ring-1 ring-white/25">
          {mode === 'deposit' ? (
            <Lock className="h-9 w-9 text-white" />
          ) : (
            <LockOpen className="h-9 w-9 text-accent-300" />
          )}
        </div>
      </div>
    </div>
  );
}

function VaultBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-brand-500/20 blur-3xl" />
      <div className="absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-accent-400/10 blur-3xl" />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, #fff 0 1px, transparent 1px 56px), repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 56px)',
        }}
      />
    </div>
  );
}

function FlowStrip({ from, to }) {
  const FromIcon = from.icon;
  const ToIcon = to.icon;
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-brand-700 ring-1 ring-ink-200">
          <FromIcon aria-hidden="true" className="h-4 w-4" />
        </span>
        <span className="truncate text-sm font-semibold text-ink-900">{from.label}</span>
      </div>
      <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-400" />
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <span className="truncate text-right text-sm font-semibold text-ink-900">{to.label}</span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-white">
          <ToIcon aria-hidden="true" className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function Compartment({ compartment: c, mode, usable, selected, onSelect }) {
  const percent = progressPercent(c.balance_paise, c.target_amount_paise);
  const Icon = c.kind === 'club' ? Users : PiggyBank;

  let statusLine;
  if (c.unlocked) {
    statusLine = { icon: LockOpen, text: 'Unlocked · ready to release', tone: 'text-success-700' };
  } else if (c.deadline) {
    statusLine = {
      icon: CalendarClock,
      text: `Locked until ${formatDate(c.deadline)}${c.daysLeft != null && c.daysLeft >= 0 ? ` · ${c.daysLeft}d left` : ''}`,
      tone: 'text-ink-500',
    };
  } else {
    statusLine = { icon: Lock, text: 'Locked until target is reached', tone: 'text-ink-500' };
  }
  const StatusIcon = statusLine.icon;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'group relative w-full overflow-hidden rounded-card border bg-white text-left shadow-card transition-all duration-200',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        selected
          ? 'border-brand-500 ring-2 ring-brand-500/30'
          : 'border-ink-200/70 hover:-translate-y-0.5 hover:shadow-card-hover',
        !usable && !selected && 'opacity-70'
      )}
    >
      {/* Locker door strip */}
      <div
        className={cn(
          'flex items-center justify-between px-4 py-2.5',
          c.unlocked ? 'bg-success-50' : 'bg-ink-50'
        )}
      >
        <span className="flex items-center gap-2">
          <span className="flex gap-0.5" aria-hidden="true">
            <span className="h-3 w-1 rounded-full bg-ink-300" />
            <span className="h-3 w-1 rounded-full bg-ink-300" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            {c.kind === 'club' ? 'Club compartment' : 'Personal compartment'}
          </span>
        </span>
        <span
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full transition-colors',
            c.unlocked ? 'bg-success-100 text-success-700' : 'bg-white text-ink-500 ring-1 ring-ink-200',
            selected && 'bg-brand-700 text-white ring-0'
          )}
        >
          {c.unlocked ? <LockOpen aria-hidden="true" className="h-3.5 w-3.5" /> : <Lock aria-hidden="true" className="h-3.5 w-3.5" />}
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <Icon aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-900">{c.goal_name}</p>
            {c.club_name && <p className="truncate text-xs text-ink-500">{c.club_name}</p>}
          </div>
        </div>

        <p className="mt-3 text-lg font-bold tabular-nums text-ink-900">
          {formatPaise(c.balance_paise)}
          <span className="ml-1.5 text-xs font-medium text-ink-400">
            of {formatPaise(c.target_amount_paise, { showDecimals: false })}
          </span>
        </p>
        <ProgressBar
          value={percent}
          size="sm"
          tone={c.unlocked ? 'success' : 'brand'}
          className="mt-2"
          label={`${c.goal_name} progress`}
        />

        <p className={cn('mt-3 flex items-center gap-1.5 text-xs font-medium', statusLine.tone)}>
          <StatusIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{statusLine.text}</span>
        </p>

        {!usable && (
          <p className="mt-1.5 text-[11px] font-medium text-ink-400">
            {mode === 'deposit'
              ? 'Goal reached - no longer accepts deposits'
              : c.kind === 'club'
                ? 'Club funds: emergency approval only'
                : 'Still locked - cannot withdraw yet'}
          </p>
        )}
      </div>
    </button>
  );
}

function LockedNotice({ compartment, mode }) {
  if (mode === 'deposit') {
    return (
      <div className="flex items-start gap-2.5 rounded-field bg-success-50 p-3 text-xs text-success-700">
        <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <p>This goal is complete. Switch to <strong>Withdraw</strong> to release it to your wallet.</p>
      </div>
    );
  }
  if (compartment.kind === 'club') {
    return (
      <div className="flex items-start gap-2.5 rounded-field bg-accent-50 p-3 text-xs text-accent-900">
        <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />
        <p>
          Club money can only be released when every member approves.{' '}
          <Link to="/app/emergency" className="font-semibold underline">
            Raise an emergency request
          </Link>
          .
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5 rounded-field bg-ink-50 p-3 text-xs text-ink-700">
      <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />
      <p>
        This compartment is still locked. It opens when the target is reached
        {compartment.deadline ? ` or on ${formatDate(compartment.deadline)}` : ''}.
      </p>
    </div>
  );
}

function Rule({ icon: Icon, title, children }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      </span>
      <div>
        <p className="font-medium text-ink-900">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{children}</p>
      </div>
    </div>
  );
}

export default DigiLocker;
