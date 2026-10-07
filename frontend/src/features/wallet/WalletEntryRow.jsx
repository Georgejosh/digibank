import {
  ArrowDownLeft,
  ArrowUpRight,
  KeyRound,
  Landmark,
  Lock,
  LockOpen,
  ShieldAlert,
} from 'lucide-react';
import { formatPaise } from '@/utils/money';
import { timeAgo } from '@/utils/date';
import { cn } from '@/utils/cn';

const KIND_ICON = {
  TOP_UP: ArrowDownLeft,
  BANK_WITHDRAWAL: Landmark,
  TO_SAVINGS: Lock,
  FROM_SAVINGS: LockOpen,
  TO_LOCKER: KeyRound,
  FROM_LOCKER: KeyRound,
  EMERGENCY_RELEASE: ShieldAlert,
};

/** One line of the wallet statement (GET /payments/wallet/transactions/). */
export function WalletEntryRow({ entry, showBalance = true }) {
  const Icon = KIND_ICON[entry.kind] ?? ArrowUpRight;

  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
          entry.is_credit ? 'bg-success-50 text-success-600' : 'bg-ink-100 text-ink-600'
        )}
      >
        <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink-900">{entry.description || entry.kind_label}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-500">
          <span>{entry.kind_label}</span>
          <span aria-hidden="true">&middot;</span>
          <span>{timeAgo(entry.created_at)}</span>
          <span aria-hidden="true" className="hidden sm:inline">&middot;</span>
          <span className="hidden font-mono text-[11px] text-ink-400 sm:inline">{entry.reference}</span>
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p
          className={cn(
            'text-sm font-bold tabular-nums',
            entry.is_credit ? 'text-success-700' : 'text-ink-900'
          )}
        >
          {entry.is_credit ? '+' : '-'}
          {formatPaise(entry.amount_paise)}
        </p>
        {showBalance && (
          <p className="mt-0.5 text-xs tabular-nums text-ink-400">
            Bal {formatPaise(entry.balance_after_paise)}
          </p>
        )}
      </div>
    </li>
  );
}

export default WalletEntryRow;
