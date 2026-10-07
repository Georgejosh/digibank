import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, RotateCw, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { OtpInput } from './OtpInput';
import { useResendOtpMutation, useVerifyOtpMutation } from '@/hooks/useAuth';

/**
 * REUSABLE OTP STEP.
 *
 * Generic on purpose - this same block backs three flows:
 *   1. confirming contact details at sign-up  (SIGNUP_VERIFICATION)
 *   2. the second factor on EVERY login       (LOGIN)
 *   3. later, approving an emergency withdrawal (EMERGENCY_APPROVAL)
 *
 * Those match the OtpPurpose choices in backend/apps/emergency/models.py. The
 * caller supplies `email`, `purpose` and `onVerified`; this component owns the
 * input, the resend cooldown and the verify call, and knows nothing about what
 * happens next.
 *
 * The code itself is never sent to the browser - the API only ever says where
 * it was delivered. There is nothing here to read it from.
 */
export function OtpVerification({
  email,
  purpose = 'LOGIN',
  sentTo,
  channel,
  expiresInMinutes = 5,
  resendAfterSeconds = 30,
  onVerified,
  submitLabel = 'Verify and continue',
}) {
  const [code, setCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(resendAfterSeconds);

  const verifyMutation = useVerifyOtpMutation();
  const resendMutation = useResendOtpMutation();

  // Resend cooldown. The server enforces its own throttle and returns 429 with
  // retry_after; this only stops the button being hammered in the first place.
  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const submit = useCallback(
    async (submittedCode) => {
      const value = submittedCode ?? code;
      if (value.length !== 6) return;
      try {
        const result = await verifyMutation.mutateAsync({ email, code: value, purpose });
        onVerified?.(result);
      } catch {
        // Rendered from verifyMutation.error below. Clearing the boxes makes
        // the retry obvious rather than leaving a stale wrong code on screen.
        setCode('');
      }
    },
    [code, email, purpose, verifyMutation, onVerified]
  );

  const handleResend = async () => {
    try {
      const result = await resendMutation.mutateAsync({ email, purpose });
      setSecondsLeft(result?.resend_after_seconds ?? resendAfterSeconds);
      setCode('');
    } catch (error) {
      // Server-side throttle wins over the local timer.
      setSecondsLeft(error?.retryAfter ?? resendAfterSeconds);
    }
  };

  return (
    <div>
      <p className="text-sm text-ink-500">
        We sent a {expiresInMinutes}-minute code to{' '}
        <span className="font-semibold text-ink-900">{sentTo ?? 'your registered contact'}</span>.
      </p>

      {/* Development delivery: with no SMTP credentials configured, Django
          prints the code to its own terminal instead of emailing it. */}
      {channel === 'console' && (
        <p className="mt-4 flex items-start gap-2 rounded-field bg-accent-50 px-3.5 py-2.5 text-xs text-accent-900 ring-1 ring-inset ring-accent-200">
          <Terminal aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            No email is configured, so the code was printed in the Django terminal running{' '}
            <code className="font-mono">manage.py runserver</code>. Add SMTP details to
            backend/.env to receive it by email.
          </span>
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mt-6"
      >
        <OtpInput
          value={code}
          onChange={setCode}
          onComplete={submit} // auto-submit the moment the 6th digit lands
          disabled={verifyMutation.isPending}
          hasError={verifyMutation.isError}
        />

        {verifyMutation.isError && (
          <p
            role="alert"
            className="mt-3 flex items-center gap-2 text-sm font-medium text-danger-600"
          >
            <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
            {verifyMutation.error?.message}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          fullWidth
          className="mt-6"
          isLoading={verifyMutation.isPending}
          disabled={code.length !== 6}
        >
          {verifyMutation.isPending ? 'Verifying...' : submitLabel}
        </Button>
      </form>

      <div className="mt-6 text-center text-sm text-ink-500">
        {secondsLeft > 0 ? (
          <span>
            Didn&rsquo;t get it? Resend in{' '}
            <span className="font-semibold tabular-nums text-ink-700">{secondsLeft}s</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={resendMutation.isPending}
            className="inline-flex items-center gap-1.5 font-semibold text-brand-700 transition-colors hover:text-brand-800 disabled:opacity-60"
          >
            <RotateCw
              aria-hidden="true"
              className={resendMutation.isPending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
            />
            Send a new code
          </button>
        )}
      </div>
    </div>
  );
}

export default OtpVerification;
