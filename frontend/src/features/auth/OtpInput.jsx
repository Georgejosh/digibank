import { useEffect, useRef } from 'react';
import { cn } from '@/utils/cn';

/**
 * Six-digit code input.
 *
 * Behaviour people expect from an OTP field, all of which has to be built by
 * hand because there is no native control for it:
 *  - typing a digit advances to the next box
 *  - Backspace on an empty box steps back and clears the previous one
 *  - arrow keys move between boxes
 *  - pasting "123456" anywhere fills all six
 *  - iOS/Android SMS autofill works via autoComplete="one-time-code"
 *
 * Controlled: the parent owns `value` (a string of up to `length` digits).
 */
export function OtpInput({
  value = '',
  onChange,
  onComplete,
  length = 6,
  disabled = false,
  hasError = false,
  autoFocus = true,
  label = 'Verification code',
}) {
  const inputsRef = useRef([]);

  useEffect(() => {
    if (autoFocus) inputsRef.current[0]?.focus();
  }, [autoFocus]);

  const digits = value.padEnd(length, ' ').slice(0, length).split('');

  const commit = (next) => {
    const cleaned = next.replace(/\D/g, '').slice(0, length);
    onChange?.(cleaned);
    if (cleaned.length === length) onComplete?.(cleaned);
    return cleaned;
  };

  const handleChange = (index, raw) => {
    const typed = raw.replace(/\D/g, '');
    if (!typed) return;

    // Typing over a filled box replaces just that box; a multi-digit paste
    // spreads forward from here.
    const chars = value.split('');
    chars.length = length;
    typed.split('').forEach((char, offset) => {
      if (index + offset < length) chars[index + offset] = char;
    });

    const next = commit(chars.map((c) => c ?? '').join('').trimEnd());
    const focusAt = Math.min(index + typed.length, length - 1);
    inputsRef.current[next.length >= length ? length - 1 : focusAt]?.focus();
  };

  const handleKeyDown = (index, event) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const chars = value.split('');
      if (chars[index]) {
        chars[index] = '';
        commit(chars.join('').replace(/\s/g, ''));
      } else if (index > 0) {
        chars[index - 1] = '';
        commit(chars.join('').replace(/\s/g, ''));
        inputsRef.current[index - 1]?.focus();
      }
      return;
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      inputsRef.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowRight' && index < length - 1) {
      event.preventDefault();
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text');
    const next = commit(pasted);
    inputsRef.current[Math.min(next.length, length - 1)]?.focus();
  };

  return (
    <div role="group" aria-label={label} className="flex justify-between gap-2 sm:gap-3">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          // Only the first box carries this, or the browser tries to autofill
          // the whole code into every box.
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          disabled={disabled}
          value={digit.trim()}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          aria-label={`Digit ${index + 1} of ${length}`}
          aria-invalid={hasError || undefined}
          className={cn(
            'h-14 w-full rounded-field border bg-white text-center text-xl font-bold tabular-nums text-ink-900',
            'shadow-field transition-colors duration-150',
            'focus:outline-none focus:ring-2',
            'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400',
            hasError
              ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/25'
              : 'border-ink-200 focus:border-brand-600 focus:ring-brand-600/20'
          )}
        />
      ))}
    </div>
  );
}

export default OtpInput;
