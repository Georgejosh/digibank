import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { setAuthFailureHandler } from '@/services/api';
import { clearAccessToken, setAccessToken } from '@/services/tokenStore';
import * as authService from '@/services/authService';
import { signInWithBiometrics } from '@/services/biometricService';

/**
 * AUTH STATE
 * ----------
 * The access token is written to the module-scoped store in
 * services/tokenStore.js and is NEVER put in localStorage, sessionStorage, a
 * cookie this app can read, or the URL. React only holds the user object and a
 * status flag; the token itself stays out of component state so it cannot end
 * up in a devtools snapshot or an error report.
 *
 * On boot we call /api/auth/refresh/. The browser attaches the httpOnly
 * refresh cookie automatically, and Django hands back a fresh access token.
 * That is what makes "no token in storage" survive a page reload.
 */

const AuthContext = createContext(null);

const STATUS = {
  LOADING: 'loading', // boot refresh in flight - render a splash, not the login page
  AUTHENTICATED: 'authenticated',
  ANONYMOUS: 'anonymous',
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(STATUS.LOADING);

  /**
   * Details captured at sign-up so the OTP screen knows who it is verifying.
   * Deliberately in memory: it holds a phone number and must not outlive the
   * tab, and it is cleared as soon as verification finishes.
   */
  const [pendingVerification, setPendingVerification] = useState(null);

  const queryClient = useQueryClient();
  const bootstrapped = useRef(false);

  const applySession = useCallback((session) => {
    setAccessToken(session.access_token);
    setUser(session.user ?? null);
    setStatus(STATUS.AUTHENTICATED);
  }, []);

  const clearSession = useCallback(() => {
    clearAccessToken();
    setUser(null);
    setStatus(STATUS.ANONYMOUS);
    // Drop every cached query: the next user must never see the last one's
    // balances flash on screen before their own data loads.
    queryClient.clear();
  }, [queryClient]);

  /* ---------------------------------------------------------------- *
   * Boot: try to restore the session from the httpOnly refresh cookie.
   * ---------------------------------------------------------------- */
  useEffect(() => {
    // The ref guard - not a cleanup flag - is what makes this run once.
    //
    // StrictMode mounts every effect twice in development. A `cancelled` flag
    // set by the first cleanup would discard the first (and only) refresh
    // response, leaving status stuck on LOADING forever, which renders every
    // gated route as a blank page. The provider lives for the lifetime of the
    // app, so there is no unmount to guard against anyway.
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    (async () => {
      try {
        const session = await authService.refreshSession();
        applySession(session);
      } catch {
        // No valid refresh cookie. Expected on a first visit and after logout -
        // not an error worth surfacing.
        clearAccessToken();
        setStatus(STATUS.ANONYMOUS);
      }
    })();
  }, [applySession]);

  /* ---------------------------------------------------------------- *
   * Let the axios interceptor tear down React state when a refresh
   * fails mid-session (cookie expired while the tab was open).
   * ---------------------------------------------------------------- */
  useEffect(() => {
    setAuthFailureHandler(() => clearSession());
    return () => setAuthFailureHandler(null);
  }, [clearSession]);

  /**
   * Step 1 of login: proves the password and triggers a code.
   *
   * Returns an OTP challenge, NOT a session - `applySession` is deliberately
   * not called here. Every login goes through the code, so a stolen password
   * on its own is not enough to get in.
   */
  const login = useCallback(async (credentials) => {
    const challenge = await authService.login(credentials);
    setPendingVerification({
      email: challenge.email,
      purpose: challenge.purpose ?? 'LOGIN',
      sentTo: challenge.sent_to,
      channel: challenge.channel,
      expiresInMinutes: challenge.expires_in_minutes,
      resendAfterSeconds: challenge.resend_after_seconds,
    });
    return challenge;
  }, []);

  /** Step 2 of login: the verified code came back with a real session. */
  const completeLogin = useCallback(
    (session) => {
      applySession(session);
      setPendingVerification(null);
    },
    [applySession]
  );

  /**
   * Face / fingerprint sign-in. The device's own biometric check plus the
   * hardware-held key it unlocks is itself two factors (something you have,
   * something you are), so Django issues the session directly - no OTP.
   */
  const loginWithBiometrics = useCallback(
    async (identifier) => {
      const session = await signInWithBiometrics(identifier);
      applySession(session);
      setPendingVerification(null);
      return session;
    },
    [applySession]
  );

  const register = useCallback(async (payload) => {
    const challenge = await authService.register(payload);
    // Registration does NOT sign the user in: the account cannot log in until
    // its code is confirmed, which is exactly how Django gates it.
    setPendingVerification({
      email: challenge.email ?? payload.email,
      name: payload.name,
      purpose: challenge.purpose ?? 'SIGNUP_VERIFICATION',
      sentTo: challenge.sent_to,
      channel: challenge.channel,
      expiresInMinutes: challenge.expires_in_minutes,
      resendAfterSeconds: challenge.resend_after_seconds,
    });
    return challenge;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // Even if the server call fails, the local session must go.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  /**
   * Re-fetch /api/auth/me/ and update the user object in place.
   * Call this after any mutation that changes wallet balance so the
   * Wallet / Deposit sidebar numbers refresh without a full reload.
   */
  const refreshUser = useCallback(async () => {
    try {
      const fresh = await authService.fetchMe();
      setUser(fresh);
    } catch {
      // Silently ignore — the user is still authenticated.
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === STATUS.AUTHENTICATED,
      isLoading: status === STATUS.LOADING,
      login,
      completeLogin,
      loginWithBiometrics,
      register,
      logout,
      refreshUser,
      pendingVerification,
      setPendingVerification,
      clearPendingVerification: () => setPendingVerification(null),
    }),
    [user, status, login, completeLogin, loginWithBiometrics, register, logout, refreshUser, pendingVerification]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Read auth state. Throws if used outside the provider, which is a bug. */
export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used inside <AuthProvider>');
  }
  return context;
}

export { STATUS as AUTH_STATUS };
