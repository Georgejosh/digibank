import { cn } from '@/utils/cn';

const TONES = {
  brand: 'bg-brand-600',
  // Amber is reserved for progress/streak/success per the design direction.
  accent: 'bg-accent-500',
  success: 'bg-success-500',
  locked: 'bg-ink-400',
};

/**
 * Amount saved vs target is the most important number on any card, so the bar
 * carries an accessible value and the caller renders the numbers beside it.
 */
export function ProgressBar({
  value = 0,
  tone = 'brand',
  size = 'md',
  showLabel = false,
  label,
  className,
}) {
  const clamped = Math.min(100, Math.max(0, Number(value) || 0));
  const height = size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3' : 'h-2.5';

  return (
    <div className={cn('w-full', className)}>
      <div
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Savings progress'}
        className={cn('w-full overflow-hidden rounded-full bg-ink-100', height)}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-700 ease-out', TONES[tone])}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <p className="mt-1.5 text-xs font-medium text-ink-500">{clamped.toFixed(0)}% funded</p>
      )}
    </div>
  );
}

/** Circular variant, used for the headline goal on the dashboard. */
export function CircularProgress({ value = 0, size = 92, strokeWidth = 8, tone = 'brand', children }) {
  const clamped = Math.min(100, Math.max(0, Number(value) || 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const stroke = { brand: '#17767A', accent: '#F59E0B', success: '#10B981', locked: '#94A4AE' }[tone];

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#EDF1F3"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 700ms ease-out' }}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children ?? <span className="text-sm font-bold text-ink-900">{clamped.toFixed(0)}%</span>}
      </span>
    </div>
  );
}

export default ProgressBar;
