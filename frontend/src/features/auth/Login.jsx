import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, AtSign, Fingerprint, ScanFace } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, PasswordInput } from '@/components/ui/Input';
import { useAuth, useLoginMutation } from '@/hooks/useAuth';
import { useBiometricSupport } from '@/hooks/useBiometrics';
import { friendlyBiometricError } from '@/services/biometricService';
import { loginSchema } from '@/utils/validation';
import { USE_MOCK_API } from '@/services/api';

/**
 * Log in.
 *
 * On success the access token goes into the in-memory store only (see
 * context/AuthContext.jsx) and Django sets the refresh token as an httpOnly
 * cookie. Nothing about the session is written to localStorage here.
 */
export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const loginMutation = useLoginMutation();
  const { loginWithBiometrics } = useAuth();
  const biometrics = useBiometricSupport();
  const [bioPending, setBioPending] = useState(false);
  const [bioError, setBioError] = useState(null);

  // If ProtectedRoute bounced them here, send them back afterwards.
  const redirectTo = location.state?.from?.pathname ?? '/app/dashboard';

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
    defaultValues: { identifier: '', password: '', rememberMe: false },
  });

  const onSubmit = async (values) => {
    try {
      await loginMutation.mutateAsync({
        identifier: values.identifier,
        password: values.password,
        // "Remember me" asks Django for a longer-lived refresh COOKIE. It never
        // means "store the token in the browser" - that is the one thing this
        // app will not do.
        remember_me: values.rememberMe,
      });
      // The password was right, but that alone is not a session: Django has
      // sent a fresh code and we go collect it. See VerifyOtp.
      navigate('/verify-otp', { replace: true, state: { from: redirectTo } });
    } catch {
      // Rendered from loginMutation.error below.
    }
  };

  const onBiometric = async () => {
    setBioError(null);
    setBioPending(true);
    try {
      // The identifier is optional: with it, only that account's devices are
      // offered; without it, the device offers whichever DigiBank passkey it has.
      await loginWithBiometrics(getValues('identifier')?.trim());
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setBioError(error.status ? error.message : friendlyBiometricError(error));
    } finally {
      setBioPending(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <h1 className="text-title text-ink-900">Welcome back</h1>
      <p className="mt-2 text-sm text-ink-500">
        New to DigiBank?{' '}
        <Link to="/register" className="font-semibold text-brand-700 hover:text-brand-800">
          Create an account
        </Link>
      </p>

      <p className="mt-6 rounded-field bg-brand-50 px-3.5 py-2.5 text-xs text-brand-800 ring-1 ring-inset ring-brand-200">
        {USE_MOCK_API
          ? 'Demo build: any email/phone with a password of 4+ characters signs you in.'
          : 'After your password we send a one-time code. Every login needs one.'}
      </p>

      {loginMutation.isError && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-2.5 rounded-field bg-danger-50 p-3.5 text-sm text-danger-700 ring-1 ring-inset ring-danger-100"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{loginMutation.error?.message}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-7 space-y-4">
        <Input
          label="Email or mobile number"
          placeholder="you@example.com"
          autoComplete="username"
          leftIcon={AtSign}
          required
          error={errors.identifier?.message}
          {...register('identifier')}
        />

        <div>
          <PasswordInput
            label="Password"
            placeholder="Your password"
            autoComplete="current-password"
            required
            error={errors.password?.message}
            {...register('password')}
          />
          <div className="mt-2 text-right">
            <Link
              to="/forgot-password"
              className="text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <Checkbox label="Keep me signed in on this device" {...register('rememberMe')} />

        <Button type="submit" size="lg" fullWidth isLoading={loginMutation.isPending} className="!mt-6">
          {loginMutation.isPending ? 'Signing in...' : 'Log in'}
        </Button>
      </form>

      {!USE_MOCK_API && biometrics.supported && (
        <div className="mt-6">
          <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-ink-400">
            <span className="h-px flex-1 bg-ink-200" />
            or
            <span className="h-px flex-1 bg-ink-200" />
          </div>
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            className="mt-4"
            onClick={onBiometric}
            isLoading={bioPending}
          >
            <span className="flex items-center gap-1" aria-hidden="true">
              <ScanFace className="h-5 w-5 text-brand-700" />
              <Fingerprint className="h-5 w-5 text-brand-700" />
            </span>
            {bioPending ? 'Waiting for your scan...' : 'Sign in with face or fingerprint'}
          </Button>
          {bioError && (
            <p role="alert" className="mt-2 text-center text-xs font-medium text-danger-600">
              {bioError}
            </p>
          )}
          <p className="mt-2 text-center text-xs text-ink-400">
            Uses Windows Hello, Face ID, Touch ID or your phone&rsquo;s fingerprint. Set it up once
            under Profile &amp; Security.
          </p>
        </div>
      )}
    </div>
  );
}

export default Login;
