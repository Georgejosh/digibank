import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { OtpVerification } from './OtpVerification';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';

/**
 * The one screen behind both OTP flows.
 *
 * SIGNUP_VERIFICATION -> confirms the account, then sends the user to log in
 *                        (which will itself require a fresh code).
 * LOGIN               -> the verified code came back WITH the session, so this
 *                        is the moment the user actually becomes signed in.
 *
 * Reachable only with a live challenge: `pendingVerification` lives in
 * AuthContext memory, so a reload or a direct visit bounces back to login
 * rather than showing a code box for nobody. Masking of the destination is
 * done by the server - the frontend never receives the full address.
 */
export function VerifyOtp() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { pendingVerification, completeLogin, clearPendingVerification } = useAuth();

  // Login carries forward wherever ProtectedRoute originally wanted to go.
  const redirectTo = location.state?.from ?? '/app/dashboard';

  if (!pendingVerification) {
    return <Navigate to="/login" replace />;
  }

  const isSignup = pendingVerification.purpose === 'SIGNUP_VERIFICATION';

  const handleVerified = (result) => {
    if (isSignup) {
      clearPendingVerification();
      toast.success('Account verified', 'Now log in to finish signing in.');
      navigate('/login', { replace: true });
      return;
    }

    // purpose LOGIN: the response carries the access token and Django has set
    // the refresh cookie, so this is the moment a real session begins.
    completeLogin(result);
    navigate(redirectTo, { replace: true });
  };

  return (
    <div className="animate-fade-in">
      <Link
        to={isSignup ? '/register' : '/login'}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {isSignup ? 'Back to sign up' : 'Back to log in'}
      </Link>

      <h1 className="text-title text-ink-900">
        {isSignup ? 'Verify your account' : 'Confirm it’s you'}
      </h1>
      <p className="mt-2 text-sm text-ink-500">
        {isSignup
          ? `Nearly there, ${pendingVerification.name?.split(' ')[0] ?? 'friend'}.`
          : 'Your password was correct. One more step.'}
      </p>

      <div className="mt-7">
        <OtpVerification
          email={pendingVerification.email}
          purpose={pendingVerification.purpose}
          sentTo={pendingVerification.sentTo}
          channel={pendingVerification.channel}
          expiresInMinutes={pendingVerification.expiresInMinutes}
          resendAfterSeconds={pendingVerification.resendAfterSeconds}
          onVerified={handleVerified}
          submitLabel={isSignup ? 'Verify my account' : 'Log in'}
        />
      </div>
    </div>
  );
}

export default VerifyOtp;
