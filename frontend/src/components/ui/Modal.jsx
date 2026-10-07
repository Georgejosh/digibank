import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Accessible dialog: portalled to <body>, closes on Escape or backdrop click,
 * traps Tab inside itself and restores focus to whatever opened it.
 *
 * Focus handling matters more than usual here - a confirmation dialog is the
 * last thing standing between a user and moving money, so it must not be
 * possible to tab past it into the page behind.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
  closeOnBackdrop = true,
}) {
  const dialogRef = useRef(null);
  const previouslyFocused = useRef(null);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusables = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE));
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    // Focus the first control so keyboard users start inside the dialog.
    const timer = setTimeout(() => {
      const focusables = dialogRef.current?.querySelectorAll(FOCUSABLE);
      (focusables?.[0] ?? dialogRef.current)?.focus();
    }, 0);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      {/* A real <button>, not a div with onClick: the backdrop is a genuine
          control. It is hidden from assistive tech and taken out of the tab
          order because keyboard and screen-reader users close via Escape or
          the labelled X button, and an unlabelled "close" stop would only be
          noise for them. */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={closeOnBackdrop ? onClose : undefined}
        className="absolute inset-0 animate-fade-in bg-ink-900/45 backdrop-blur-[2px]"
      />
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions --
          jsx-a11y classes role="dialog" as non-interactive, but the WAI-ARIA
          authoring practices for a modal dialog put exactly this Escape/Tab
          handling on the dialog element. Keeping the listener scoped here is
          also safer than a document-level one, which would outlive the modal
          if a cleanup were ever missed. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        // Focus is trapped inside this element, so every keystroke in the
        // dialog bubbles up to here - the correct owner of Escape and Tab.
        onKeyDown={handleKeyDown}
        className={cn(
          'relative z-10 max-h-[92vh] w-full animate-slide-up overflow-y-auto',
          'rounded-t-card bg-white shadow-card-hover outline-none sm:rounded-card',
          { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-lg', xl: 'sm:max-w-2xl' }[size]
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 p-5">
          <div className="min-w-0">
            <h2 className="text-heading text-ink-900">{title}</h2>
            {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="-m-1 shrink-0 rounded-md p-1.5 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">{children}</div>

        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-ink-100 p-5 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default Modal;
