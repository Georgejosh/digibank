import { Link } from 'react-router-dom';
import { ArrowDownToLine, CalendarDays, ChevronRight, Crown, Divide, Mail } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { AvatarGroup } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { LockBadge, LockLabel } from '@/components/ui/LockLabel';
import { clubAsGoal, lockState } from '@/utils/lock';
import { formatPaise, progressPercent } from '@/utils/money';
import { formatDate } from '@/utils/date';

/**
 * A club (a `groups` row plus its GROUP savings_account).
 *
 * Two numbers matter and both are shown: what the CLUB has pooled, and what
 * YOU put in. Hiding the personal share is how group savings turns into
 * arguments.
 */
export function ClubCard({ club }) {
  const percent = progressPercent(club.balance_paise, club.target_amount_paise);
  // A club's pot is a savings_account like any other, so it reuses the same
  // lock rule rather than a parallel copy of it.
  const goal = clubAsGoal(club);
  const { unlocked } = lockState(goal);

  const memberNames = club.members?.map((m) => m.name) ?? [];

  return (
    <Card interactive>
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-heading text-ink-900">
                <Link to={`/app/clubs/${club.id}`} className="hover:text-brand-700 hover:underline">
                  {club.name}
                </Link>
              </h3>
              {club.my_role === 'CREATOR' && (
                <Badge tone="warning" icon={Crown}>
                  Creator
                </Badge>
              )}
            </div>
            <p className="mt-1 truncate text-sm text-ink-500">{club.goal_name}</p>
          </div>
          <LockBadge goal={goal} />
        </div>

        <p className="text-money mt-5 text-ink-900">{formatPaise(club.balance_paise)}</p>
        <p className="mt-1 text-sm text-ink-500">
          pooled of {formatPaise(club.target_amount_paise, { showDecimals: false })}
        </p>

        <ProgressBar
          value={percent}
          tone={unlocked ? 'success' : 'brand'}
          className="mt-4"
          label={`${club.name} progress`}
        />

        <div className="mt-3 flex items-center justify-between gap-3">
          <LockLabel goal={goal} />
          <span className="shrink-0 text-xs font-bold tabular-nums text-ink-700">
            {percent.toFixed(0)}%
          </span>
        </div>

        {/* Your slice of the pool */}
        <div className="mt-4 rounded-field bg-ink-50 px-3.5 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-medium text-ink-500">Your contribution</span>
            <span className="text-sm font-bold tabular-nums text-ink-900">
              {formatPaise(club.my_contribution_paise)}
            </span>
          </div>
          {club.my_split && (
            <div className="mt-1.5 flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-1 text-xs font-medium text-ink-500">
                <Divide aria-hidden="true" className="h-3 w-3" />
                Your equal share
              </span>
              <span
                className={
                  club.my_split.paid_up
                    ? 'text-xs font-semibold text-success-700'
                    : 'text-xs font-semibold tabular-nums text-ink-700'
                }
              >
                {club.my_split.paid_up
                  ? 'Paid in full'
                  : `${formatPaise(club.my_split.remaining_paise)} left of ${formatPaise(club.my_split.share_paise, { showDecimals: false })}`}
              </span>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-ink-100 pt-4">
          <div className="flex min-w-0 items-center gap-3">
            <AvatarGroup names={memberNames} />
            <span className="truncate text-xs text-ink-500">
              {club.member_count} member{club.member_count === 1 ? '' : 's'}
            </span>
          </div>
          <Link
            to="/app/digilocker?mode=deposit"
            state={{ savingsAccountId: club.savings_account_id }}
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800"
          >
            <ArrowDownToLine aria-hidden="true" className="h-4 w-4" />
            Add money
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {/* Only while still locked - after unlocking, a future "unlocks on"
              date contradicts the "Target reached" badge right above it. */}
          {club.deadline && !unlocked ? (
            <p className="flex items-center gap-1.5 text-xs text-ink-400">
              <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />
              Unlocks on {formatDate(club.deadline)} or at target
            </p>
          ) : (
            <span />
          )}
          <Link
            to={`/app/clubs/${club.id}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800"
          >
            {club.pending_invites > 0 && (
              <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-accent-800">
                <Mail aria-hidden="true" className="h-3 w-3" />
                {club.pending_invites} pending
              </span>
            )}
            Members, invites &amp; details
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}

export default ClubCard;
