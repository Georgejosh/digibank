import { daysUntil } from './date';

/**
 * THE LOCK RULE, in one place.
 *
 * Mirrors SavingsAccount.is_withdrawal_allowed() in
 * backend/apps/savings/models.py: funds are withdrawable once the target is
 * reached OR the deadline has passed. Anything else is locked, and the only
 * other way out is an approved emergency request.
 *
 * This DESCRIBES the state so the UI can render it. It never decides it - the
 * server re-checks before any money moves, and a user who edits this file
 * still gets a 403 from Django.
 */
export function lockState({ balance_paise, target_amount_paise, deadline, status }) {
  const targetReached = balance_paise >= target_amount_paise;
  const daysLeft = daysUntil(deadline);
  const deadlinePassed = daysLeft !== null && daysLeft < 0;
  const unlocked =
    status === 'UNLOCKED' || status === 'WITHDRAWN' || targetReached || deadlinePassed;

  return { unlocked, targetReached, deadlinePassed, daysLeft };
}

/** Shapes a club record into the goal shape lockState/LockLabel expect. */
export function clubAsGoal(club) {
  return {
    balance_paise: club.balance_paise,
    target_amount_paise: club.target_amount_paise,
    deadline: club.deadline,
    status: club.account_status,
  };
}
