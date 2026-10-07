import { cn } from '@/utils/cn';

/**
 * Shown when a list has no rows. Always offers the next action - an empty
 * savings app should invite the first goal, not just say "nothing here".
 */
export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      {Icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
          <Icon aria-hidden="true" className="h-7 w-7 text-brand-600" />
        </div>
      )}
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export default EmptyState;
