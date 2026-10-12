import { cn } from '@/utils/cn';

/** Wordmark + mark. The mark is the same artwork as the PWA icons in public/icons. */
export function Logo({ size = 'md', showWordmark = true, className }) {
  const box = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12' : 'h-10 w-10';
  const word = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-xl';

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <img
        src="/logo.png"
        alt=""
        aria-hidden="true"
        width={48}
        height={48}
        decoding="async"
        // The tile is white, so a hairline ring keeps it visible on white headers.
        className={cn('shrink-0 rounded-[22%] shadow-field ring-1 ring-ink-200/80', box)}
      />
      {showWordmark && (
        <span className={cn('font-extrabold tracking-tight text-ink-900', word)}>
          Digi<span className="text-brand-700">Bank</span>
        </span>
      )}
    </span>
  );
}

export default Logo;
