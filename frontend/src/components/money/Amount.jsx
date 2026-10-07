import { Eye, EyeOff } from 'lucide-react';
import { usePrivacy } from '@/context/PrivacyContext';
import { formatPaise } from '@/utils/money';
import { cn } from '@/utils/cn';

/**
 * A balance that respects the "hide balances" toggle. Use it for the headline
 * numbers (wallet, totals); ledger rows and confirmations stay visible because
 * the user is actively reading them.
 */
export function Amount({ paise, showDecimals = true, sign = '', className }) {
  const { hidden } = usePrivacy();

  if (hidden) {
    return (
      <span className={cn('tabular-nums', className)} aria-label="Balance hidden">
        ₹ ••••••
      </span>
    );
  }
  return (
    <span className={cn('tabular-nums', className)}>
      {sign}
      {formatPaise(paise, { showDecimals })}
    </span>
  );
}

/** The eye button. `tone="dark"` for use on the dark balance cards. */
export function PrivacyToggle({ tone = 'light', className }) {
  const { hidden, toggle } = usePrivacy();
  const Icon = hidden ? EyeOff : Eye;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      aria-label={hidden ? 'Show balances' : 'Hide balances'}
      title={hidden ? 'Show balances' : 'Hide balances'}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors',
        tone === 'dark'
          ? 'text-white/70 hover:bg-white/10 hover:text-white'
          : 'text-ink-500 hover:bg-ink-100 hover:text-ink-800',
        className
      )}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}

export default Amount;
