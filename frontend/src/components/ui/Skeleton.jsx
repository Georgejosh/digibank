import { cn } from '@/utils/cn';

/**
 * Skeletons, not spinners.
 *
 * A spinner says "something is happening"; a skeleton says "your card is
 * arriving and it will look like this". On a savings dashboard that difference
 * is the whole perceived-speed story, so every list and card in this app loads
 * with a skeleton shaped like its real content.
 */
export function Skeleton({ className, ...props }) {
  return (
    <div
      aria-hidden="true"
      className={cn('relative overflow-hidden rounded-md bg-ink-100', className)}
      {...props}
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/70 to-transparent" />
    </div>
  );
}

/** Matches the layout of a savings goal / club card. */
export function SkeletonGoalCard() {
  return (
    <div className="rounded-card border border-ink-200/70 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-1/4" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <Skeleton className="mt-5 h-7 w-1/3" />
      <Skeleton className="mt-4 h-2.5 w-full rounded-full" />
      <div className="mt-3 flex justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

/** Matches a summary tile on the dashboard. */
export function SkeletonStatCard() {
  return (
    <div className="rounded-card border border-ink-200/70 bg-white p-5 shadow-card">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-8 w-32" />
      <Skeleton className="mt-3 h-3 w-20" />
    </div>
  );
}

/** Matches one row in the activity / transaction list. */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-3 w-1/4" />
      </div>
      <Skeleton className="h-4 w-20" />
    </div>
  );
}

export function SkeletonList({ rows = 5 }) {
  return (
    <div className="divide-y divide-ink-100">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

export default Skeleton;
