import axios from 'axios';
import { ENDPOINTS } from './endpoints';
import { clearAccessToken, getAccessToken, setAccessToken } from './tokenStore';

/**
 * THE single configured Axios instance. Import this, never `axios` directly,
 * so every request gets the auth header, the credentials flag and the refresh
 * handling below.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 15000,
  // Required so the browser sends the httpOnly refresh cookie set by Django.
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

/* ------------------------------------------------------------------ *
 * REQUEST: attach the in-memory access token.
 * ------------------------------------------------------------------ */
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/* ------------------------------------------------------------------ *
 * RESPONSE: silent refresh-token renewal.
 *
 * On a 401 we assume the short-lived access token expired, call
 * /api/auth/refresh/ once (the browser sends the httpOnly cookie), then replay
 * the original request with the new token.
 *
 * `refreshPromise` de-duplicates: if the dashboard fires five queries at once
 * and all five 401, only ONE refresh call goes out and the other four wait for
 * it. Without this the app would hammer the endpoint and, with refresh-token
 * rotation on, invalidate its own session.
 *
 * TODO(backend): works as written once Django exposes POST /api/auth/refresh/
 * returning { access_token }. Until then VITE_USE_MOCK_API=true short-circuits
 * this whole file - see mockApi.js.
 * ------------------------------------------------------------------ */
let refreshPromise = null;

/** Called by AuthContext so a failed refresh can tear down React state too. */
let onAuthFailure = () => {};
export function setAuthFailureHandler(handler) {
  onAuthFailure = typeof handler === 'function' ? handler : () => {};
}

export async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(
        `${api.defaults.baseURL}${ENDPOINTS.auth.refresh}`,
        {},
        { withCredentials: true, timeout: 15000 }
      )
      .then((res) => {
        const token = res.data?.access_token;
        if (!token) throw new Error('Refresh response had no access_token');
        setAccessToken(token);
        return token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    const isRefreshCall = original?.url?.includes(ENDPOINTS.auth.refresh);
    const isAuthCall =
      original?.url?.includes(ENDPOINTS.auth.login) ||
      original?.url?.includes(ENDPOINTS.auth.register);

    if (status === 401 && original && !original._retried && !isRefreshCall && !isAuthCall) {
      original._retried = true;
      try {
        const token = await refreshAccessToken();
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch (refreshError) {
        // The refresh cookie is gone or expired: this session is over.
        clearAccessToken();
        onAuthFailure();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(normaliseError(error));
  }
);

/**
 * Turns any axios failure into a predictable shape so screens can render
 * `error.message` without defensive checks everywhere.
 *
 * DRF conventionally returns { detail: "..." } or { field: ["msg"] }.
 */
export function normaliseError(error) {
  const data = error.response?.data;
  let message = 'Something went wrong. Please try again.';
  let fieldErrors = {};

  if (typeof data === 'string') {
    message = data;
  } else if (data && typeof data === 'object') {
    if (data.detail) {
      message = data.detail;
    } else {
      fieldErrors = Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
      );
      const first = Object.values(fieldErrors)[0];
      if (typeof first === 'string') message = first;
    }
  } else if (error.code === 'ECONNABORTED') {
    message = 'The server took too long to respond.';
  } else if (error.message === 'Network Error') {
    message = 'Cannot reach the server. Check your connection.';
  }

  const normalised = new Error(message);
  normalised.status = error.response?.status ?? 0;
  normalised.fieldErrors = fieldErrors;
  // Server-side OTP throttling answers 429 with the seconds left to wait, so
  // the resend timer can obey the server instead of its own optimistic count.
  normalised.retryAfter = data?.retry_after;
  normalised.errorCode = data?.code;
  normalised.original = error;
  return normalised;
}

/** Phase-1 switch. See .env.example. */
// Mock only when explicitly asked for, so a production build without env vars
// talks to the real API instead of silently serving fake data.
export const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === 'true';

export default api;
