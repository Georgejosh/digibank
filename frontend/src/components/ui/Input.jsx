import { forwardRef, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Form controls. All of these forward their ref, which is what lets
 * react-hook-form's `{...register('field')}` work directly:
 *
 *   <Input label="Email" error={errors.email?.message} {...register('email')} />
 *
 * Errors are wired to the input with aria-describedby + aria-invalid so screen
 * readers announce them, not just sighted users.
 */

const fieldStyles = (hasError) =>
  cn(
    'block w-full rounded-field border bg-white px-3.5 text-sm text-ink-900 shadow-field',
    'placeholder:text-ink-400',
    'transition-colors duration-150',
    'focus:outline-none focus:ring-2 focus:ring-offset-0',
    'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400',
    hasError
      ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/25'
      : 'border-ink-200 focus:border-brand-600 focus:ring-brand-600/20'
  );

/** Label + control + error/hint. Used by every control below. */
function Field({ id, label, error, hint, required, children, className }) {
  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-label text-ink-700">
          {label}
          {required && (
            <span className="ml-0.5 text-danger-600" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-danger-600">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export const Input = forwardRef(function Input(
  { label, error, hint, required, className, containerClassName, leftIcon: LeftIcon, id, ...props },
  ref
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <Field
      id={fieldId}
      label={label}
      error={error}
      hint={hint}
      required={required}
      className={containerClassName}
    >
      <div className="relative">
        {LeftIcon && (
          <LeftIcon
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
          />
        )}
        <input
          ref={ref}
          id={fieldId}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          className={cn(fieldStyles(!!error), 'h-11', LeftIcon && 'pl-9', className)}
          {...props}
        />
      </div>
    </Field>
  );
});

/** Password field with a show/hide toggle. */
export const PasswordInput = forwardRef(function PasswordInput(
  { label, error, hint, required, className, containerClassName, id, ...props },
  ref
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <Field
      id={fieldId}
      label={label}
      error={error}
      hint={hint}
      required={required}
      className={containerClassName}
    >
      <div className="relative">
        <input
          ref={ref}
          id={fieldId}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          className={cn(fieldStyles(!!error), 'h-11 pr-11', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-ink-400 transition-colors hover:text-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
        >
          {visible ? (
            <EyeOff aria-hidden="true" className="h-4 w-4" />
          ) : (
            <Eye aria-hidden="true" className="h-4 w-4" />
          )}
        </button>
      </div>
    </Field>
  );
});

/**
 * Rupee amount field. The user types rupees; the caller converts to paise with
 * rupeesToPaise() before sending. `valueAsNumber` on the register call keeps
 * zod's z.number() happy.
 */
export const MoneyInput = forwardRef(function MoneyInput(
  { label, error, hint, required, className, containerClassName, id, ...props },
  ref
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <Field
      id={fieldId}
      label={label}
      error={error}
      hint={hint}
      required={required}
      className={containerClassName}
    >
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-500"
        >
          ₹
        </span>
        <input
          ref={ref}
          id={fieldId}
          type="number"
          inputMode="decimal"
          step="1"
          min="0"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          className={cn(
            fieldStyles(!!error),
            'h-11 pl-8 font-semibold tabular-nums',
            // Hide the number spinners: they are useless on a money field.
            '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
            className
          )}
          {...props}
        />
      </div>
    </Field>
  );
});

export const Select = forwardRef(function Select(
  { label, error, hint, required, className, containerClassName, children, id, ...props },
  ref
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <Field
      id={fieldId}
      label={label}
      error={error}
      hint={hint}
      required={required}
      className={containerClassName}
    >
      <select
        ref={ref}
        id={fieldId}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn(fieldStyles(!!error), 'h-11 pr-9', className)}
        {...props}
      >
        {children}
      </select>
    </Field>
  );
});

export const Textarea = forwardRef(function Textarea(
  { label, error, hint, required, className, containerClassName, rows = 4, id, ...props },
  ref
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <Field
      id={fieldId}
      label={label}
      error={error}
      hint={hint}
      required={required}
      className={containerClassName}
    >
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn(fieldStyles(!!error), 'resize-y py-2.5', className)}
        {...props}
      />
    </Field>
  );
});

export const Checkbox = forwardRef(function Checkbox(
  { label, error, className, id, ...props },
  ref
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-start gap-2.5">
        <input
          ref={ref}
          id={fieldId}
          type="checkbox"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 text-brand-700',
            'focus:ring-2 focus:ring-brand-600/30 focus:ring-offset-0',
            error && 'border-danger-500'
          )}
          {...props}
        />
        <label htmlFor={fieldId} className="text-sm leading-snug text-ink-700">
          {label}
        </label>
      </div>
      {error && (
        <p id={`${fieldId}-error`} role="alert" className="mt-1.5 text-xs font-medium text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
});

export default Input;
