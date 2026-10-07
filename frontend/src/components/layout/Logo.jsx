import { cn } from '@/utils/cn';

/** Wordmark + mark. The mark matches the PWA icon in public/icons. */
export function Logo({ size = 'md', showWordmark = true, className }) {
  const box = size === 'sm' ? 'h-8 w-8 text-base' : size === 'lg' ? 'h-12 w-12 text-2xl' : 'h-10 w-10 text-xl';
  const word = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-xl';

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex items-center justify-center rounded-xl font-extrabold text-white',
          'bg-gradient-to-b from-brand-600 to-brand-900 shadow-field',
          box
        )}
      >
        D
      </span>
      {showWordmark && (
        <span className={cn('font-extrabold tracking-tight text-ink-900', word)}>
          Digi<span className="text-brand-700">Bank</span>
        </span>
      )}
    </span>
  );
}

export default Logo;
