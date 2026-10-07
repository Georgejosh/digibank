import { cn } from '@/utils/cn';

/** The surface every piece of content sits on. */
export function Card({ as: Tag = 'div', interactive = false, className, children, ...props }) {
  return (
    <Tag
      className={cn(
        'rounded-card border border-ink-200/70 bg-white shadow-card',
        interactive &&
          'transition-shadow duration-200 hover:shadow-card-hover focus-within:shadow-card-hover',
        className
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ className, children, ...props }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 p-5 pb-0', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ as: Tag = 'h3', className, children, ...props }) {
  return (
    <Tag className={cn('text-heading text-ink-900', className)} {...props}>
      {children}
    </Tag>
  );
}

export function CardBody({ className, children, ...props }) {
  return (
    <div className={cn('p-5', className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }) {
  return (
    <div className={cn('flex items-center gap-3 border-t border-ink-100 px-5 py-4', className)} {...props}>
      {children}
    </div>
  );
}

export default Card;
