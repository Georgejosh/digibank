import { Skeleton, SkeletonStatCard } from '@/components/ui/Skeleton';

/**
 * Shown while a lazily-loaded route bundle downloads.
 *
 * Shaped like a real page rather than a spinner, so a slow connection looks
 * like a page arriving instead of the app hanging.
 */
export function RouteFallback() {
  return (
    <div className="animate-fade-in">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-2 h-4 w-72" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>
      <div className="mt-6 rounded-card border border-ink-200/70 bg-white p-5 shadow-card">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-4 h-3 w-full" />
        <Skeleton className="mt-2.5 h-3 w-5/6" />
        <Skeleton className="mt-2.5 h-3 w-2/3" />
      </div>
      <span className="sr-only" role="status">
        Loading page
      </span>
    </div>
  );
}

export default RouteFallback;
