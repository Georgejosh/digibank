import { cn } from '@/utils/cn';

const TONES = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
  success: 'bg-success-50 text-success-700 ring-success-100',
  warning: 'bg-accent-50 text-accent-800 ring-accent-200',
  danger: 'bg-danger-50 text-danger-700 ring-danger-100',
  // "locked" is muted on purpose: a locked goal is a calm, normal state, not
  // an alarm. See the design direction note on locked-fund styling.
  locked: 'bg-ink-100 text-ink-600 ring-ink-200',
};

/** Small status pill. `icon` takes a lucide component, not an element. */
export function Badge({ tone = 'neutral', icon: Icon, className, children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1',
        'text-xs font-semibold ring-1 ring-inset',
        TONES[tone],
        className
      )}
      {...props}
    >
      {Icon && <Icon aria-hidden="true" className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}

export default Badge;
