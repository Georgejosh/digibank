import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpFromLine,
  Flame,
  BadgeCheck,
  Lock,
  PiggyBank,
  Plus,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  Users,
  Vault,
  Wallet,
} from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList, SkeletonStatCard, Skeleton } from '@/components/ui/Skeleton';
import { Amount, PrivacyToggle } from '@/components/money/Amount';
import { TransactionRow } from '@/features/transactions/TransactionRow';
import { WalletEntryRow } from '@/features/wallet/WalletEntryRow';
import { KycBanner } from '@/features/kyc/KycBanner';
import { useDashboardSummary } from '@/hooks/useDashboard';
import { useWalletTransactions } from '@/hooks/useDeposits';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/utils/cn';

const QUICK_ACTIONS = [
  { to: '/app/wallet', label: 'Add money', icon: Plus },
  { to: '/app/digilocker?mode=deposit', label: 'Lock money', icon: Lock },
  { to: '/app/digilocker?mode=withdraw', label: 'Withdraw', icon: ArrowUpFromLine },
  { to: '/app/savings/new', label: 'New goal', icon: PiggyBank },
  { to: '/app/kyc', label: 'KYC', icon: BadgeCheck },
  { to: '/app/transactions', label: 'Statements', icon: Receipt },
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** One summary tile. */
function StatCard({ icon: Icon, label, paise, value, sub, tone = 'brand', to }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    accent: 'bg-accent-50 text-accent-700',
    success: 'bg-success-50 text-success-600',
  };

  const body = (
    <CardBody className="flex items-start gap-4">
      <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-label text-ink-500">{label}</p>
        <p className="mt-1 truncate text-[1.5rem] font-bold leading-tight tracking-tight text-ink-900">
          {paise != null ? <Amount paise={paise} showDecimals={false} /> : value}
        </p>
        {sub && <p className="mt-1 text-xs text-ink-500">{sub}</p>}
      </div>
    </CardBody>
  );

  return to ? (
    <Card as={Link} to={to} interactive className="block">
      {body}
    </Card>
  ) : (
    <Card>{body}</Card>
  );
}

/**
 * The home screen after login.
 *
 * The summary comes from one aggregated query so the page paints in a single
 * round trip; the wallet balance comes from the signed-in user object.
 */
export function Dashboard() {
  const { user } = useAuth();
  const { data, isPending, isError, error, refetch } = useDashboardSummary();
  const { data: walletStatement, isPending: walletLoading } = useWalletTransactions();
  const [activityTab, setActivityTab] = useState('savings');

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const streak = data?.streak;
  const walletPaise = user?.digital_wallet_balance_paise ?? 0;
  const savedPaise = data?.total_saved_paise ?? 0;
  const lockedPaise = data?.locked_paise ?? 0;
  const netWorth = walletPaise + savedPaise;
  const share = (part) => (netWorth > 0 ? Math.max(0, (part / netWorth) * 100) : 0);
  const today = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  return (
    <div className="animate-fade-in">
      {/* ------------------------------------------------ Greeting */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">{today}</p>
          <h1 className="mt-1 text-title text-ink-900">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {streak?.saved_today
              ? 'You have already saved today. Nice work.'
              : 'Lock away anything today to keep your streak alive.'}
          </p>
        </div>
      </header>

      {isError && (
        <Card className="mb-6 border-danger-100 bg-danger-50">
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-danger-700">{error?.message ?? 'Could not load your summary.'}</p>
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </CardBody>
        </Card>
      )}

      {/* ------------------------------------------- Net worth hero */}
      <section className="relative overflow-hidden rounded-[1.25rem] bg-gradient-to-br from-brand-950 via-brand-900 to-brand-700 p-6 text-white shadow-card-hover sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-400/20 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-brand-100">
              Total balance
              <PrivacyToggle tone="dark" className="h-7 w-7" />
            </p>
            {isPending ? (
              <Skeleton className="mt-2 h-10 w-48 bg-white/15" />
            ) : (
              <p className="mt-1 text-[2.5rem] font-bold leading-none tracking-tight">
                <Amount paise={netWorth} />
              </p>
            )}
            <p className="mt-2 text-xs text-brand-200">Wallet plus everything saved in your goals and clubs</p>
          </div>
          <Link
            to="/app/digilocker"
            className="hidden items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand-900 shadow transition-colors hover:bg-brand-50 sm:inline-flex"
          >
            <Vault aria-hidden="true" className="h-4 w-4" />
            Open DigiLocker
          </Link>
        </div>

        {/* Composition bar */}
        {!isPending && (
          <div className="relative mt-6">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
              <span className="bg-accent-400" style={{ width: `${share(walletPaise)}%` }} />
              <span className="bg-brand-300" style={{ width: `${share(lockedPaise)}%` }} />
              <span className="bg-success-500" style={{ width: `${share(Math.max(0, savedPaise - lockedPaise))}%` }} />
            </div>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
              <Legend color="bg-accent-400" label="Wallet" paise={walletPaise} />
              <Legend color="bg-brand-300" label="Locked" paise={lockedPaise} />
              <Legend color="bg-success-500" label="Unlocked & clubs" paise={Math.max(0, savedPaise - lockedPaise)} />
            </dl>
          </div>
        )}
      </section>

      <KycBanner className="mt-5" />

      {/* ------------------------------------------- Quick actions */}
      <nav aria-label="Quick actions" className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6">
        {QUICK_ACTIONS.map(({ to, label, icon: Icon }) => (
          <Link
            key={label}
            to={to}
            className="group flex flex-col items-center gap-2 rounded-card border border-ink-200/70 bg-white px-2 py-3.5 text-center shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-700 group-hover:text-white">
              <Icon aria-hidden="true" className="h-5 w-5" />
            </span>
            <span className="text-xs font-semibold text-ink-700">{label}</span>
          </Link>
        ))}
      </nav>

      {/* ------------------------------------------- Summary tiles */}
      <section aria-label="Savings summary" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isPending ? (
          <>
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
          </>
        ) : (
          <>
            <StatCard
              icon={Wallet}
              label="Wallet"
              paise={walletPaise}
              sub="Free to use or lock away"
              tone="accent"
              to="/app/wallet"
            />
            <StatCard
              icon={PiggyBank}
              label="Personal savings"
              paise={data.individual_saved_paise}
              sub={`${data.individual_goals} active goal${data.individual_goals === 1 ? '' : 's'}`}
              tone="success"
              to="/app/savings"
            />
            <StatCard
              icon={Users}
              label="Club contributions"
              paise={data.club_contributed_paise}
              sub={`${data.active_clubs} active club${data.active_clubs === 1 ? '' : 's'}`}
              to="/app/clubs"
            />
          </>
        )}
      </section>

      {/* ------------------------------- Pending approval nudge */}
      {!isPending && data?.pending_approvals > 0 && (
        <Link
          to="/app/emergency"
          className="mt-6 flex items-center gap-3 rounded-card border border-accent-200 bg-accent-50 p-4 transition-colors hover:bg-accent-100"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white">
            <ShieldAlert aria-hidden="true" className="h-5 w-5 text-accent-600" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-accent-900">
              {data.pending_approvals} emergency request{data.pending_approvals === 1 ? ' needs' : 's need'} your decision
            </p>
            <p className="mt-0.5 text-xs text-accent-800">Club funds stay locked until every member approves.</p>
          </div>
          <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-accent-700" />
        </Link>
      )}

      <section className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* --------------------------------------- Recent activity */}
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
            <h2 className="text-heading text-ink-900">Recent activity</h2>
            <div className="flex items-center gap-3">
              <div className="flex gap-1 rounded-full bg-ink-100 p-1">
                {[
                  { value: 'savings', label: 'Savings' },
                  { value: 'wallet', label: 'Wallet' },
                ].map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setActivityTab(t.value)}
                    aria-pressed={activityTab === t.value}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                      activityTab === t.value ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <Link
                to={activityTab === 'wallet' ? '/app/wallet' : '/app/transactions'}
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800"
              >
                See all
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {activityTab === 'savings' ? (
            isPending ? (
              <SkeletonList rows={4} />
            ) : data?.recent_activity?.length ? (
              <ul className="divide-y divide-ink-100">
                {data.recent_activity.map((transaction) => (
                  <TransactionRow key={transaction.id} transaction={transaction} />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Lock}
                title="No savings activity yet"
                description="Deposits and withdrawals in DigiLocker will show up here."
                action={
                  <Link
                    to="/app/digilocker"
                    className="inline-flex h-11 items-center justify-center rounded-field bg-brand-700 px-5 text-sm font-semibold text-white shadow-field hover:bg-brand-800"
                  >
                    Make your first deposit
                  </Link>
                }
              />
            )
          ) : walletLoading ? (
            <SkeletonList rows={4} />
          ) : walletStatement?.length ? (
            <ul className="divide-y divide-ink-100">
              {walletStatement.slice(0, 5).map((entry) => (
                <WalletEntryRow key={entry.id} entry={entry} showBalance={false} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={Wallet} title="No wallet activity yet" description="Top up your wallet to get started." />
          )}
        </Card>

        <div className="space-y-6">
          {/* Streak */}
          <Card>
            <CardBody>
              {isPending ? (
                <>
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-3 h-8 w-20" />
                  <Skeleton className="mt-3 h-3 w-32" />
                </>
              ) : (
                <>
                  <p className="text-label text-ink-500">Saving streak</p>
                  <div className="mt-2 flex items-baseline gap-2">
                    <Flame
                      aria-hidden="true"
                      className={cn('h-7 w-7', streak?.saved_today ? 'text-accent-500' : 'text-ink-300')}
                    />
                    <span className="text-money tabular-nums text-ink-900">{streak?.current_streak ?? 0}</span>
                    <span className="text-sm text-ink-500">days</span>
                  </div>
                  <p className="mt-2 text-xs text-ink-500">
                    Best: {streak?.longest_streak ?? 0} days &middot; {streak?.points ?? 0} points
                  </p>
                </>
              )}
            </CardBody>
          </Card>

          {/* Security */}
          <Card className="border-success-100 bg-success-50/40">
            <CardBody>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <ShieldCheck aria-hidden="true" className="h-4 w-4 text-success-600" />
                Your account is protected
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-ink-600">
                <li>• 2-step sign-in with a one-time code</li>
                <li>• Auto sign-out after 10 minutes idle</li>
                <li>• DigiBank will never ask for your OTP or password</li>
              </ul>
              <Link to="/app/profile" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800">
                Security settings <ArrowRight aria-hidden="true" className="h-3 w-3" />
              </Link>
            </CardBody>
          </Card>
        </div>
      </section>
    </div>
  );
}

function Legend({ color, label, paise }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn('h-2 w-2 rounded-full', color)} aria-hidden="true" />
      <dt className="text-brand-100">{label}</dt>
      <dd className="font-semibold text-white">
        <Amount paise={paise} showDecimals={false} />
      </dd>
    </div>
  );
}

export default Dashboard;
