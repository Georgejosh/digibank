import { cn } from '@/utils/cn';

/** Consistent page title block for every screen inside the dashboard. */
export function PageHeader({ title, description, action, className }) {
  return (
    <header className={cn('mb-6 flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-title text-ink-900">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-500">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export default PageHeader;
