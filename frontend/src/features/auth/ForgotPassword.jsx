import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, ArrowLeft, Mail, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useForgotPasswordMutation } from '@/hooks/useAuth';
import { forgotPasswordSchema } from '@/utils/validation';

/**
 * Password reset request.
 *
 * Two states: the form, and a "check your email" confirmation.
 *
 * The confirmation is shown for ANY well-formed address, including ones with no
 * account. Saying "no user with that email" would turn this form into a way to
 * discover which of your friends have accounts.
 */
export function ForgotPassword() {
  const forgotPasswordMutation = useForgotPasswordMutation();

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    mode: 'onTouched',
    defaultValues: { email: '' },
  });

  const onSubmit = async (values) => {
    try {
      await forgotPasswordMutation.mutateAsync(values);
    } catch {
      // Rendered below.
    }
  };

  if (forgotPasswordMutation.isSuccess) {
    return (
      <div className="animate-fade-in text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-50">
          <MailCheck aria-hidden="true" className="h-7 w-7 text-success-600" />
        </div>

        <h1 className="text-title mt-6 text-ink-900">Check your email</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-500">
          If an account exists for{' '}
          <span className="font-semibold text-ink-900">{getValues('email')}</span>, we&rsquo;ve sent
          a link to reset your password. It expires in 30 minutes.
        </p>

        <div className="mt-8 space-y-3">
          <Link
            to="/login"
            className="inline-flex h-12 w-full items-center justify-center rounded-field bg-brand-700 px-6 text-base font-semibold text-white shadow-field transition-colors hover:bg-brand-800"
          >
            Back to log in
          </Link>
          <button
            type="button"
            onClick={() => forgotPasswordMutation.reset()}
            className="text-sm font-semibold text-ink-500 transition-colors hover:text-ink-800"
          >
            Use a different email address
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Link
        to="/login"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Back to log in
      </Link>

      <h1 className="text-title text-ink-900">Reset your password</h1>
      <p className="mt-2 text-sm text-ink-500">
        Enter the email on your account and we&rsquo;ll send you a reset link.
      </p>

      {forgotPasswordMutation.isError && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-2.5 rounded-field bg-danger-50 p-3.5 text-sm text-danger-700 ring-1 ring-inset ring-danger-100"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{forgotPasswordMutation.error?.message}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-7 space-y-4">
        <Input
          label="Email address"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          leftIcon={Mail}
          required
          error={errors.email?.message}
          {...register('email')}
        />

        <Button type="submit" size="lg" fullWidth isLoading={forgotPasswordMutation.isPending}>
          {forgotPasswordMutation.isPending ? 'Sending link...' : 'Send reset link'}
        </Button>
      </form>
    </div>
  );
}

export default ForgotPassword;
