import { ArrowDownLeft, ArrowUpRight, Clock, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatPaise } from '@/utils/money';
import { timeAgo } from '@/utils/date';
import { cn } from '@/utils/cn';

/**
 * One ledger row. Shared by the Transactions screen and the dashboard's recent
 * activity list, so a deposit looks identical wherever it appears.
 *
 * A DEPOSIT is money going INTO savings, which is the good direction in this
 * app - hence the inbound arrow and the positive sign.
 */
export function TransactionRow({ transaction, showBalance = false }) {
  const isDeposit = transaction.type === 'DEPOSIT';
  const failed = transaction.status === 'FAILED';
  const pending = transaction.status === 'PENDING';

  const Icon = failed ? XCircle : pending ? Clock : isDeposit ? ArrowDownLeft : ArrowUpRight;

  return (
    <li className="flex items-center gap-3 px-5 py-4">
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
          failed
            ? 'bg-danger-50 text-danger-600'
            : pending
              ? 'bg-accent-50 text-accent-700'
              : isDeposit
                ? 'bg-success-50 text-success-600'
                : 'bg-ink-100 text-ink-600'
        )}
      >
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink-900">
          {transaction.savings_account_name}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-500">
          <span>{isDeposit ? 'Deposit' : 'Withdrawal'}</span>
          <span aria-hidden="true">&middot;</span>
          <span>{timeAgo(transaction.created_at)}</span>
          {transaction.gateway_ref && (
            <>
              <span aria-hidden="true" className="hidden sm:inline">
                &middot;
              </span>
              <span className="hidden font-mono text-[11px] text-ink-400 sm:inline">
                {transaction.gateway_ref}
              </span>
            </>
          )}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p
          className={cn(
            'text-sm font-bold tabular-nums',
            failed ? 'text-ink-400 line-through' : isDeposit ? 'text-success-700' : 'text-ink-900'
          )}
        >
          {isDeposit ? '+' : '-'}
          {formatPaise(transaction.amount_paise)}
        </p>
        {failed && (
          <Badge tone="danger" className="mt-1">
            Failed
          </Badge>
        )}
        {pending && (
          <Badge tone="warning" className="mt-1">
            Pending
          </Badge>
        )}
        {!failed && !pending && showBalance && (
          <p className="mt-0.5 text-xs tabular-nums text-ink-400">
            Bal {formatPaise(transaction.balance_after_paise, { showDecimals: false })}
          </p>
        )}
      </div>
    </li>
  );
}

export default TransactionRow;
