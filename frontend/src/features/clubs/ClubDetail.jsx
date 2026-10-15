import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowDownToLine,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Crown,
  Divide,
  KeyRound,
  Mail,
  RefreshCw,
  Send,
  Share2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Textarea } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SkeletonGoalCard } from '@/components/ui/Skeleton';
import { LockBadge, LockLabel } from '@/components/ui/LockLabel';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  useCancelInvitation,
  useClub,
  useClubSplit,
  useInviteToClub,
  useNewClubCode,
  useRespondInvitation,
} from '@/hooks/useClubs';
import { useToast } from '@/context/ToastContext';
import { clubAsGoal, lockState } from '@/utils/lock';
import { formatPaise, progressPercent } from '@/utils/money';
import { formatDate, timeAgo } from '@/utils/date';
import { parseInviteEmails } from '@/utils/validation';
import { cn } from '@/utils/cn';

const STATUS = {
  PENDING: { tone: 'warning', label: 'Pending' },
  ACCEPTED: { tone: 'success', label: 'Accepted' },
  DECLINED: { tone: 'danger', label: 'Declined' },
  CANCELLED: { tone: 'neutral', label: 'Cancelled' },
};

function StatusBadge({ status }) {
  const s = STATUS[status] ?? STATUS.PENDING;
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

function SectionTitle({ icon: Icon, title, count, children }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-heading text-ink-900">
        <Icon aria-hidden="true" className="h-5 w-5 text-brand-600" />
        {title}
        {count != null && (
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-bold text-ink-600">{count}</span>
        )}
      </h2>
      {children}
    </div>
  );
}

/** /app/clubs/:clubId - everything about one club. */
export function ClubDetail() {
  const { clubId } = useParams();
  const { data: club, isPending, isError, error, refetch } = useClub(clubId);

  if (isPending) {
    return (
      <div className="grid gap-4">
        <SkeletonGoalCard />
        <SkeletonGoalCard />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="animate-fade-in">
        <BackLink />
        <Card>
          <EmptyState
            icon={Users}
            title={error?.status === 404 ? 'Club not found' : 'Could not load this club'}
            description={
              error?.status === 404
                ? 'It does not exist, or you are not a member of it.'
                : error?.message
            }
            action={
              error?.status !== 404 && (
                <Button variant="secondary" onClick={() => refetch()}>
                  Try again
                </Button>
              )
            }
          />
        </Card>
      </div>
    );
  }

  const isCreator = club.my_role === 'CREATOR';
  const open = club.account_status === 'ACTIVE';

  return (
    <div className="animate-fade-in">
      <BackLink />
      <Overview club={club} open={open} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Members club={club} />
          {isCreator && <JoinRequests club={club} />}
          {isCreator && <Invites club={club} open={open} />}
        </div>
        <aside className="space-y-4">
          {isCreator && open && <JoinCode club={club} />}
          <SplitCard club={club} isCreator={isCreator} open={open} />
        </aside>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/app/clubs"
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800"
    >
      <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      Back to clubs
    </Link>
  );
}

function Overview({ club, open }) {
  const percent = progressPercent(club.balance_paise, club.target_amount_paise);
  const goal = clubAsGoal(club);
  const { unlocked } = lockState(goal);
  const mine = club.my_split;

  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">{club.name}</h1>
              {club.my_role === 'CREATOR' && (
                <Badge tone="warning" icon={Crown}>
                  Creator
                </Badge>
              )}
              {club.split_equally && (
                <Badge tone="brand" icon={Divide}>
                  Split equally
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-500">{club.goal_name}</p>
          </div>
          <LockBadge goal={goal} />
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Pooled so far" value={formatPaise(club.balance_paise)} strong />
          <Stat label="Club target" value={formatPaise(club.target_amount_paise, { showDecimals: false })} />
          <Stat label="You contributed" value={formatPaise(club.my_contribution_paise)} />
        </div>

        <ProgressBar
          value={percent}
          tone={unlocked ? 'success' : 'brand'}
          className="mt-5"
          label={`${club.name} progress`}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <LockLabel goal={goal} />
          <span className="text-xs font-bold tabular-nums text-ink-700">{percent.toFixed(0)}%</span>
        </div>

        {open && (
          <div className="mt-5 flex flex-col gap-3 border-t border-ink-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-600">
              {mine
                ? mine.paid_up
                  ? 'You have paid your full share. Thank you!'
                  : `Your share left: ${formatPaise(mine.remaining_paise)}` +
                    (club.split?.months_left > 1
                      ? ` - about ${formatPaise(mine.per_month_paise)} a month until ${formatDate(club.deadline)}.`
                      : club.deadline
                        ? ` - due by ${formatDate(club.deadline)}.`
                        : '.')
                : club.deadline
                  ? `Unlocks on ${formatDate(club.deadline)} or when the target is reached.`
                  : 'Unlocks when the target is reached.'}
            </p>
            <Link
              to="/app/digilocker?mode=deposit"
              state={{
                savingsAccountId: club.savings_account_id,
                amountPaise: mine && !mine.paid_up ? mine.per_month_paise : undefined,
              }}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-field bg-brand-700 px-5 text-sm font-semibold text-white shadow-field transition-colors hover:bg-brand-800"
            >
              <ArrowDownToLine aria-hidden="true" className="h-4 w-4" />
              {mine && !mine.paid_up ? 'Pay my share' : 'Add money'}
            </Link>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Stat({ label, value, strong }) {
  return (
    <div className="rounded-field bg-ink-50 px-4 py-3">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className={cn('mt-1 font-bold tabular-nums text-ink-900', strong ? 'text-2xl' : 'text-lg')}>{value}</p>
    </div>
  );
}

function Members({ club }) {
  const pool = club.balance_paise || 0;
  const members = [...club.members].sort((a, b) => b.contributed_paise - a.contributed_paise);

  return (
    <Card>
      <CardBody>
        <SectionTitle icon={Users} title="Members" count={club.member_count} />
        <ul className="divide-y divide-ink-100">
          {members.map((m) => {
            const share = m.split;
            const ofPool = pool > 0 ? Math.round((m.contributed_paise * 100) / pool) : 0;
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={m.name} />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink-900">
                      {m.name}
                      {m.role === 'CREATOR' && <Crown aria-label="Creator" className="h-3.5 w-3.5 text-accent-600" />}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {m.email || 'Member'} · joined {formatDate(m.joined_at)}
                    </p>
                  </div>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-sm font-bold tabular-nums text-ink-900">{formatPaise(m.contributed_paise)}</p>
                  <p className="text-xs text-ink-500">{ofPool}% of the pool</p>
                </div>
                {share && (
                  <div className="w-full sm:w-44">
                    <ProgressBar
                      value={progressPercent(m.contributed_paise, share.share_paise)}
                      tone={share.paid_up ? 'success' : 'brand'}
                      label={`${m.name} share progress`}
                    />
                    <p className={cn('mt-1 text-xs', share.paid_up ? 'font-semibold text-success-700' : 'text-ink-500')}>
                      {share.paid_up
                        ? 'Share paid in full'
                        : `${formatPaise(share.remaining_paise)} left of ${formatPaise(share.share_paise, { showDecimals: false })}`}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}

function JoinRequests({ club }) {
  const respond = useRespondInvitation();
  const pending = club.join_requests.filter((r) => r.status === 'PENDING');
  const history = club.join_requests.filter((r) => r.status !== 'PENDING');
  if (club.join_requests.length === 0) return null;

  return (
    <Card className={pending.length ? 'border-accent-200' : undefined}>
      <CardBody>
        <SectionTitle icon={KeyRound} title="Join requests" count={pending.length || null} />
        <p className="-mt-2 mb-3 text-sm text-ink-500">People who used your club code. Nobody joins until you accept.</p>
        <ul className="divide-y divide-ink-100">
          {[...pending, ...history].map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar name={r.name || r.email} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-900">{r.name || r.email}</p>
                <p className="truncate text-xs text-ink-500">
                  {r.email} · asked {timeAgo(r.created_at)}
                </p>
              </div>
              {r.status === 'PENDING' ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={respond.isPending}
                    onClick={() => respond.mutate({ id: r.id, action: 'decline' })}
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    disabled={respond.isPending}
                    onClick={() => respond.mutate({ id: r.id, action: 'accept' })}
                  >
                    <Check aria-hidden="true" className="h-4 w-4" />
                    Accept
                  </Button>
                </div>
              ) : (
                <StatusBadge status={r.status} />
              )}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function Invites({ club, open }) {
  const [text, setText] = useState('');
  const invite = useInviteToClub();
  const cancel = useCancelInvitation();
  const emails = parseInviteEmails(text);
  const bad = emails.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  const submit = async (event) => {
    event.preventDefault();
    if (!emails.length || bad.length) return;
    try {
      await invite.mutateAsync({ clubId: club.id, emails });
      setText('');
    } catch {
      // toast shown by the hook
    }
  };

  const counts = club.invites.reduce((acc, i) => ({ ...acc, [i.status]: (acc[i.status] ?? 0) + 1 }), {});

  return (
    <Card>
      <CardBody>
        <SectionTitle icon={Mail} title="Invitations sent" count={club.invites.length || null}>
          {club.invites.length > 0 && (
            <p className="text-xs text-ink-500">
              {counts.ACCEPTED ?? 0} accepted · {counts.PENDING ?? 0} pending · {counts.DECLINED ?? 0} declined
            </p>
          )}
        </SectionTitle>

        {open && (
          <form onSubmit={submit} noValidate className="mb-5 space-y-3 rounded-field bg-ink-50 p-4">
            <Textarea
              label="Invite by email"
              rows={2}
              placeholder={'priya@example.com, rohan@example.com'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              error={bad.length ? `Not a valid email: ${bad.join(', ')}` : undefined}
              hint="They get the invite in their DigiBank account and by email, and must accept it themselves."
            />
            <div className="flex justify-end">
              <Button type="submit" size="sm" isLoading={invite.isPending} disabled={!emails.length || bad.length > 0}>
                <Send aria-hidden="true" className="h-4 w-4" />
                Send invite{emails.length > 1 ? 's' : ''}
              </Button>
            </div>
          </form>
        )}

        {club.invites.length === 0 ? (
          <p className="text-sm text-ink-500">No invitations yet.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {club.invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar name={i.name || i.email} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-900">{i.name || i.email}</p>
                  <p className="truncate text-xs text-ink-500">
                    {i.name ? `${i.email} · ` : ''}
                    {i.has_account ? 'Has a DigiBank account' : 'No account yet - asked to sign up'}
                    {' · '}sent {timeAgo(i.created_at)}
                    {i.responded_at && ` · ${STATUS[i.status]?.label.toLowerCase()} ${timeAgo(i.responded_at)}`}
                  </p>
                </div>
                <StatusBadge status={i.status} />
                {i.status === 'PENDING' && (
                  <Button size="sm" variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate(i.id)}>
                    Cancel
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function JoinCode({ club }) {
  const toast = useToast();
  const regenerate = useNewClubCode();
  const [copied, setCopied] = useState(false);
  const message = `Join my DigiBank savings club "${club.name}". Open ${window.location.origin}/app/clubs, choose "Join with a code" and enter ${club.join_code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(club.join_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy', 'Select the code and copy it manually.');
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Join ${club.name} on DigiBank`, text: message });
      } catch {
        // user closed the share sheet
      }
    } else {
      await navigator.clipboard.writeText(message).catch(() => {});
      toast.success('Invite message copied', 'Paste it into WhatsApp, SMS or email.');
    }
  };

  return (
    <Card className="border-brand-200 bg-brand-50/60">
      <CardBody>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-900">
          <KeyRound aria-hidden="true" className="h-4 w-4 text-brand-600" />
          Club code
        </h2>
        <p className="mt-3 select-all text-center font-mono text-3xl font-bold tracking-[0.2em] text-brand-900">
          {club.join_code}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={copy}>
            {copied ? <CheckCircle2 aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button size="sm" onClick={share}>
            <Share2 aria-hidden="true" className="h-4 w-4" />
            Share
          </Button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-brand-800">
          Anyone with this code can <strong>ask</strong> to join - you accept or decline each request.
        </p>
        <button
          type="button"
          onClick={() => regenerate.mutate(club.id)}
          disabled={regenerate.isPending}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-900 disabled:opacity-50"
        >
          <RefreshCw aria-hidden="true" className={cn('h-3.5 w-3.5', regenerate.isPending && 'animate-spin')} />
          Get a new code (the old one stops working)
        </button>
      </CardBody>
    </Card>
  );
}

function SplitCard({ club, isCreator, open }) {
  const split = useClubSplit();
  const on = club.split_equally;
  const share = club.split?.share_paise;

  if (!isCreator && !on) return null;

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <Divide aria-hidden="true" className="h-4 w-4 text-brand-600" />
            Split equally
          </h2>
          {isCreator && open && (
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label="Split the target equally between members"
              disabled={split.isPending}
              onClick={() => split.mutate({ clubId: club.id, enabled: !on })}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
                on ? 'bg-brand-700' : 'bg-ink-300'
              )}
            >
              <span
                className={cn(
                  'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
                  on ? 'translate-x-5' : 'translate-x-0.5'
                )}
              />
            </button>
          )}
        </div>
        {on ? (
          <>
            <p className="mt-3 text-2xl font-bold tabular-nums text-ink-900">
              {formatPaise(share)} <span className="text-sm font-medium text-ink-500">per member</span>
            </p>
            <p className="mt-1 text-sm text-ink-600">
              {formatPaise(club.target_amount_paise, { showDecimals: false })} ÷ {club.member_count} member
              {club.member_count === 1 ? '' : 's'}
              {club.deadline && `, to be paid before ${formatDate(club.deadline)}`}.
            </p>
            {club.split?.months_left > 1 && (
              <p className="mt-2 text-xs text-ink-500">
                That is about {formatPaise(Math.ceil(share / club.split.months_left))} a month over{' '}
                {club.split.months_left} months. The share is recalculated when members join.
              </p>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-ink-600">
            Turn this on to divide the target equally. Every member then sees their share, what they have paid and
            what is left until the lock period ends.
          </p>
        )}
        {!isCreator && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-500">
            <UserPlus aria-hidden="true" className="h-3.5 w-3.5" />
            Set by the club creator.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

export default ClubDetail;
