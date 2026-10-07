import { cn } from '@/utils/cn';

/** "Aarav Menon" -> "AM". Falls back to a single letter, then a dash. */
function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '-';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Deterministic tint per person, so the same member keeps the same colour on
 * every card instead of flickering between renders.
 */
const TINTS = [
  'bg-brand-100 text-brand-800',
  'bg-accent-100 text-accent-800',
  'bg-success-100 text-success-700',
  'bg-ink-200 text-ink-700',
  'bg-brand-200 text-brand-900',
];

function tintFor(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 997;
  return TINTS[hash % TINTS.length];
}

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
};

export function Avatar({ name, size = 'md', className, ...props }) {
  return (
    <span
      title={name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold uppercase',
        SIZES[size],
        tintFor(name),
        className
      )}
      {...props}
    >
      {initials(name)}
    </span>
  );
}

/** Overlapping member avatars for club cards. Shows "+N" past `max`. */
export function AvatarGroup({ names = [], max = 4, size = 'sm' }) {
  const shown = names.slice(0, max);
  const overflow = names.length - shown.length;

  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {shown.map((name, i) => (
          <Avatar key={`${name}-${i}`} name={name} size={size} className="ring-2 ring-white" />
        ))}
      </div>
      {overflow > 0 && (
        <span className="ml-2 text-xs font-semibold text-ink-500">+{overflow}</span>
      )}
    </div>
  );
}

export default Avatar;
