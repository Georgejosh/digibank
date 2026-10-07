import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * The only button in the app. Variants are fixed on purpose - if a screen
 * needs a new look, add a variant here rather than one-off classes, so all
 * four of us stay visually consistent.
 */
const VARIANTS = {
  primary:
    'bg-brand-700 text-white shadow-field hover:bg-brand-800 active:bg-brand-900 focus-visible:outline-brand-700',
  secondary:
    'bg-white text-brand-800 ring-1 ring-inset ring-ink-200 shadow-field hover:bg-ink-50 active:bg-ink-100 focus-visible:outline-brand-700',
  ghost: 'bg-transparent text-brand-700 hover:bg-brand-50 active:bg-brand-100 focus-visible:outline-brand-700',
  danger:
    'bg-danger-600 text-white shadow-field hover:bg-danger-700 active:bg-danger-700 focus-visible:outline-danger-600',
  // Reserved for streak / celebratory actions only.
  accent:
    'bg-accent-500 text-accent-900 shadow-field hover:bg-accent-400 active:bg-accent-600 focus-visible:outline-accent-600',
};

const SIZES = {
  sm: 'h-9 px-3.5 text-sm gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

export const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    type = 'button',
    isLoading = false,
    fullWidth = false,
    leftIcon: LeftIcon,
    rightIcon: RightIcon,
    className,
    children,
    disabled,
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      // A loading button must not be clickable twice - that is a double deposit.
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-field font-semibold',
        'transition-colors duration-150',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {isLoading ? (
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
      ) : (
        LeftIcon && <LeftIcon aria-hidden="true" className="h-4 w-4" />
      )}
      {children}
      {!isLoading && RightIcon && <RightIcon aria-hidden="true" className="h-4 w-4" />}
    </button>
  );
});

export default Button;
