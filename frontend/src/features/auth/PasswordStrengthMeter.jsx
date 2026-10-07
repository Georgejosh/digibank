import { scorePassword } from '@/utils/password';
import { cn } from '@/utils/cn';

const BAR_TONES = {
  danger: 'bg-danger-500',
  accent: 'bg-accent-500',
  success: 'bg-success-500',
  ink: 'bg-ink-200',
};

const TEXT_TONES = {
  danger: 'text-danger-600',
  accent: 'text-accent-700',
  success: 'text-success-700',
  ink: 'text-ink-500',
};

/**
 * Four-segment strength meter under the password field.
 *
 * Guidance, not a gate: the actual minimum is enforced by the zod schema and
 * re-enforced by Django. This just tells the user how they are doing.
 */
export function PasswordStrengthMeter({ password = '' }) {
  const { score, label, tone, hints } = scorePassword(password);
  if (!password) return null;

  return (
    <div className="mt-2">
      <div className="flex gap-1.5" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors duration-300',
              i < score ? BAR_TONES[tone] : 'bg-ink-200'
            )}
          />
        ))}
      </div>
      <p className={cn('mt-1.5 text-xs font-medium', TEXT_TONES[tone])} role="status">
        {label}
        {hints.length > 0 && <span className="font-normal text-ink-500"> - {hints[0]}</span>}
      </p>
    </div>
  );
}

export default PasswordStrengthMeter;
