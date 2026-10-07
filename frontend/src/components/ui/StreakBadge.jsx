import { Flame } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Daily saving streak.
 *
 * Deliberately small and warm rather than loud: the design direction calls for
 * motivation without the visual language of a gambling app. It sits in the top
 * bar, never in the middle of the balance.
 */
export function StreakBadge({ streak, size = 'md', className }) {
  const current = streak?.current_streak ?? 0;
  const savedToday = streak?.saved_today ?? false;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset',
        size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
        savedToday
          ? 'bg-accent-50 text-accent-800 ring-accent-200'
          : 'bg-ink-100 text-ink-500 ring-ink-200',
        className
      )}
      title={
        savedToday
          ? `${current}-day saving streak. You have already saved today.`
          : `${current}-day saving streak. Save today to keep it alive.`
      }
    >
      <Flame
        aria-hidden="true"
        className={cn(
          size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4',
          savedToday ? 'text-accent-500' : 'text-ink-400'
        )}
      />
      <span className="tabular-nums">{current}</span>
      <span className="sr-only">day saving streak</span>
      {size !== 'sm' && <span className="hidden font-medium sm:inline">day streak</span>}
    </span>
  );
}

export default StreakBadge;
