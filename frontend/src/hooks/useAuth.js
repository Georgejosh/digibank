import { useMutation } from '@tanstack/react-query';
import { useAuthContext } from '@/context/AuthContext';
import * as authService from '@/services/authService';

/**
 * Auth surface for screens.
 *
 * `useAuth()` reads session state from context (the access token itself never
 * leaves services/tokenStore.js). The mutations below wrap the auth endpoints
 * so login/register get the same isPending / error handling as every other
 * data operation in the app.
 */
export function useAuth() {
  return useAuthContext();
}

/** POST /api/auth/login/ - on success the token goes into memory only. */
export function useLoginMutation() {
  const { login } = useAuthContext();

  return useMutation({
    mutationFn: (credentials) => login(credentials),
  });
}

/**
 * POST /api/auth/register/
 * Does NOT sign the user in: they go to OTP verification first.
 */
export function useRegisterMutation() {
  const { register } = useAuthContext();

  return useMutation({
    mutationFn: (payload) => register(payload),
  });
}

/**
 * POST /api/auth/verify-otp/
 *
 * TODO(backend): real verification compares against the hashed code in the
 * otp_verifications table, enforces expires_at and the attempt limit, and
 * consumes the row. The mock accepts one fixed demo code.
 */
export function useVerifyOtpMutation() {
  return useMutation({
    mutationFn: (payload) => authService.verifyOtp(payload),
  });
}

/** POST /api/auth/resend-otp/ */
export function useResendOtpMutation() {
  return useMutation({
    mutationFn: (payload) => authService.resendOtp(payload),
  });
}

/** POST /api/auth/forgot-password/ */
export function useForgotPasswordMutation() {
  return useMutation({
    mutationFn: (payload) => authService.forgotPassword(payload),
  });
}
