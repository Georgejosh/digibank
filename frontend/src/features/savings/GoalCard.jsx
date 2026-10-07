import { Link } from 'react-router-dom';
import { ArrowDownToLine, CalendarDays } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { LockBadge, LockLabel } from '@/components/ui/LockLabel';
import { lockState } from '@/utils/lock';
import { formatPaise, progressPercent } from '@/utils/money';
import { formatDate } from '@/utils/date';

/**
 * A single savings goal.
 *
 * "Amount saved vs target is the most important number on any card" - so the
 * balance is the largest thing here, the target sits directly beneath it, and
 * the progress bar carries the same story visually.
 */
export function GoalCard({ goal }) {
  const percent = progressPercent(goal.balance_paise, goal.target_amount_paise);
  const { unlocked } = lockState(goal);
  const remaining = Math.max(0, goal.target_amount_paise - goal.balance_paise);

  return (
    <Card interactive>
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-heading text-ink-900">{goal.goal_name}</h3>
            {goal.deadline && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-500">
                <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />
                Target date {formatDate(goal.deadline)}
              </p>
            )}
          </div>
          <LockBadge goal={goal} />
        </div>

        <p className="text-money mt-5 text-ink-900">{formatPaise(goal.balance_paise)}</p>
        <p className="mt-1 text-sm text-ink-500">
          of {formatPaise(goal.target_amount_paise, { showDecimals: false })}
          {remaining > 0 && (
            <span className="text-ink-400">
              {' '}
              &middot; {formatPaise(remaining, { showDecimals: false })} to go
            </span>
          )}
        </p>

        <ProgressBar
          value={percent}
          tone={unlocked ? 'success' : 'brand'}
          className="mt-4"
          label={`${goal.goal_name} progress`}
        />

        <div className="mt-3 flex items-center justify-between gap-3">
          <LockLabel goal={goal} />
          <span className="shrink-0 text-xs font-bold tabular-nums text-ink-700">
            {percent.toFixed(0)}%
          </span>
        </div>

        <div className="mt-4 border-t border-ink-100 pt-4">
          <Link
            to="/app/digilocker?mode=deposit"
            state={{ savingsAccountId: goal.id }}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800"
          >
            <ArrowDownToLine aria-hidden="true" className="h-4 w-4" />
            Add money
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}

export default GoalCard;
