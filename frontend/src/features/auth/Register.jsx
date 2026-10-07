import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Mail, Phone, User } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, PasswordInput } from '@/components/ui/Input';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import { useRegisterMutation } from '@/hooks/useAuth';
import { registerSchema } from '@/utils/validation';

/**
 * Sign-up.
 *
 * Registering does NOT create a session. On success the user is sent to OTP
 * verification and stays anonymous until the code checks out - the same order
 * Django will enforce, so the frontend never assumes an unverified account is
 * usable.
 */
export function Register() {
  const navigate = useNavigate();
  const registerMutation = useRegisterMutation();

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(registerSchema),
    mode: 'onTouched', // validate when a field is left, not on every keystroke
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      acceptedTerms: false,
    },
  });

  const password = watch('password');

  const onSubmit = async (values) => {
    try {
      await registerMutation.mutateAsync({
        name: values.name,
        email: values.email,
        phone: values.phone,
        password: values.password,
      });
      navigate('/verify-otp', { replace: true });
    } catch (error) {
      // Map DRF field errors ({ email: ["already exists"] }) onto the form.
      const fieldErrors = error?.fieldErrors ?? {};
      Object.entries(fieldErrors).forEach(([field, message]) => {
        if (field in values) setError(field, { type: 'server', message });
      });
    }
  };

  return (
    <div className="animate-fade-in">
      <h1 className="text-title text-ink-900">Create your account</h1>
      <p className="mt-2 text-sm text-ink-500">
        Already saving with us?{' '}
        <Link to="/login" className="font-semibold text-brand-700 hover:text-brand-800">
          Log in
        </Link>
      </p>

      {/* A failure that is not tied to one field (network, 500, rate limit) */}
      {registerMutation.isError && !Object.keys(registerMutation.error?.fieldErrors ?? {}).length && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-2.5 rounded-field bg-danger-50 p-3.5 text-sm text-danger-700 ring-1 ring-inset ring-danger-100"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{registerMutation.error?.message}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-7 space-y-4">
        <Input
          label="Full name"
          placeholder="Aarav Menon"
          autoComplete="name"
          leftIcon={User}
          required
          error={errors.name?.message}
          {...register('name')}
        />

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

        <Input
          label="Mobile number"
          type="tel"
          inputMode="numeric"
          placeholder="9876543210"
          autoComplete="tel"
          leftIcon={Phone}
          required
          hint="We send your verification code here."
          error={errors.phone?.message}
          {...register('phone')}
        />

        <div>
          <PasswordInput
            label="Password"
            placeholder="At least 8 characters"
            autoComplete="new-password"
            required
            error={errors.password?.message}
            {...register('password')}
          />
          <PasswordStrengthMeter password={password} />
        </div>

        <PasswordInput
          label="Confirm password"
          placeholder="Type it once more"
          autoComplete="new-password"
          required
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Checkbox
          label={
            <>
              I agree to the DigiBank{' '}
              <span className="font-semibold text-brand-700">Terms of Service</span> and{' '}
              <span className="font-semibold text-brand-700">Privacy Policy</span>.
            </>
          }
          error={errors.acceptedTerms?.message}
          {...register('acceptedTerms')}
        />

        <Button
          type="submit"
          size="lg"
          fullWidth
          isLoading={registerMutation.isPending}
          className="!mt-6"
        >
          {registerMutation.isPending ? 'Creating account...' : 'Create account'}
        </Button>
      </form>
    </div>
  );
}

export default Register;
