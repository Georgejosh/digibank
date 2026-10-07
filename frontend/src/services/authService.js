import api, { USE_MOCK_API } from './api';
import { ENDPOINTS } from './endpoints';
import mockApi from './mockApi';

/**
 * Auth calls.
 *
 * TWO-STEP LOGIN
 * --------------
 * `login()` proves the password and returns an OTP CHALLENGE, never a token.
 * `verifyOtp()` with purpose LOGIN is what actually returns the session. There
 * is no endpoint that turns a password alone into an access token, which is
 * what makes the second factor real rather than decorative.
 */

/** @returns {{otp_required: true, email, sent_to, channel, purpose}} */
export async function register(payload) {
  if (USE_MOCK_API) return mockApi.register(payload);
  const { data } = await api.post(ENDPOINTS.auth.register, payload);
  return data;
}

/** Step 1. Returns an OTP challenge - deliberately NOT a session. */
export async function login(credentials) {
  if (USE_MOCK_API) return mockApi.login(credentials);
  const { data } = await api.post(ENDPOINTS.auth.login, credentials);
  return data;
}

/**
 * Step 2. For purpose LOGIN this returns { access_token, user } and Django
 * sets the refresh cookie. For SIGNUP_VERIFICATION it returns { verified }
 * and no session - the user still logs in afterwards, with its own fresh code.
 */
export async function verifyOtp(payload) {
  if (USE_MOCK_API) return mockApi.verifyOtp(payload);
  const { data } = await api.post(ENDPOINTS.auth.verifyOtp, payload);
  return data;
}

export async function resendOtp(payload) {
  if (USE_MOCK_API) return mockApi.resendOtp(payload);
  const { data } = await api.post(ENDPOINTS.auth.resendOtp, payload);
  return data;
}

export async function logout() {
  if (USE_MOCK_API) return mockApi.logout();
  // Django clears the httpOnly refresh cookie.
  const { data } = await api.post(ENDPOINTS.auth.logout);
  return data;
}

/** Used on app boot to restore a session from the httpOnly refresh cookie. */
export async function refreshSession() {
  if (USE_MOCK_API) return mockApi.refresh();
  const { data } = await api.post(ENDPOINTS.auth.refresh);
  return data;
}

export async function forgotPassword(payload) {
  if (USE_MOCK_API) return mockApi.forgotPassword(payload);
  const { data } = await api.post(ENDPOINTS.auth.forgotPassword, payload);
  return data;
}

/** Re-fetch the authenticated user's profile (updates wallet balance etc.). */
export async function fetchMe() {
  const { data } = await api.get(ENDPOINTS.auth.me);
  return data;
}
