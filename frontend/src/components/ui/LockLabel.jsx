import { CheckCircle2, Lock, LockOpen } from 'lucide-react';
import { Badge } from './Badge';
import { formatDate, formatDayMonth } from '@/utils/date';
import { formatPaiseShort } from '@/utils/money';
import { lockState } from '@/utils/lock';
import { cn } from '@/utils/cn';

/**
 * The locked-fund state, stated the same way everywhere.
 *
 * These components only DESCRIBE the state that utils/lock.js derives - which
 * in turn mirrors the server's rule. Nothing here decides whether money can
 * move.
 */

/** The pill that sits in the corner of a goal or club card. */
export function LockBadge({ goal }) {
  const { unlocked, targetReached } = lockState(goal);

  if (goal.status === 'WITHDRAWN') {
    return (
      <Badge tone="neutral" icon={CheckCircle2}>
        Withdrawn
      </Badge>
    );
  }
  if (unlocked) {
    return (
      <Badge tone="success" icon={targetReached ? CheckCircle2 : LockOpen}>
        {targetReached ? 'Target reached' : 'Unlocked'}
      </Badge>
    );
  }
  return (
    <Badge tone="locked" icon={Lock}>
      Locked
    </Badge>
  );
}

/**
 * The muted one-liner under a progress bar:
 *   "Locked until ₹50K or 30 Nov"
 */
export function LockLabel({ goal, className }) {
  const { unlocked, targetReached, daysLeft } = lockState(goal);

  if (unlocked) {
    return (
      <p className={cn('flex items-center gap-1.5 text-xs font-medium text-success-700', className)}>
        <LockOpen aria-hidden="true" className="h-3.5 w-3.5" />
        {targetReached
          ? 'Target reached - ready to withdraw'
          : 'Deadline passed - ready to withdraw'}
      </p>
    );
  }

  return (
    <p className={cn('flex items-center gap-1.5 text-xs font-medium text-ink-500', className)}>
      <Lock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span>
        Locked until {formatPaiseShort(goal.target_amount_paise)}
        {goal.deadline && (
          <>
            {' '}
            or <span className="text-ink-600">{formatDayMonth(goal.deadline)}</span>
          </>
        )}
      </span>
      {daysLeft !== null && daysLeft >= 0 && daysLeft <= 30 && (
        <span className="text-accent-700">({daysLeft}d left)</span>
      )}
    </p>
  );
}

/** Full sentence version, for detail panels rather than cards. */
export function LockSentence({ goal }) {
  const { unlocked, targetReached } = lockState(goal);
  if (unlocked) {
    return targetReached
      ? 'This goal hit its target and is ready to withdraw.'
      : 'The deadline has passed, so this goal is ready to withdraw.';
  }
  return `These funds stay locked until the balance reaches ${formatPaiseShort(
    goal.target_amount_paise
  )}${goal.deadline ? ` or ${formatDate(goal.deadline)}` : ''}.`;
}

export default LockLabel;
