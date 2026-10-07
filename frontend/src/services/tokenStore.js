/**
 * IN-MEMORY ACCESS TOKEN STORE
 * ----------------------------
 * The access token lives in a module-scoped variable and NOWHERE else.
 *
 * Why not localStorage / sessionStorage: anything readable by JavaScript is
 * readable by an XSS payload, and a stolen access token is a stolen session.
 * Keeping it in memory means a successful XSS still cannot exfiltrate a token
 * that survives a page reload.
 *
 * The REFRESH token is never seen by this app at all: Django sets it as an
 * httpOnly, Secure, SameSite=Strict cookie, which JavaScript cannot read. On a
 * page reload the app has no access token, calls /api/auth/refresh/, and the
 * browser attaches that cookie automatically (axios `withCredentials: true`).
 *
 * Consequence, by design: a hard refresh briefly shows a loading state while
 * the silent refresh runs, and logs the user out if the cookie has expired.
 */
let accessToken = null;

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token ?? null;
}

export function clearAccessToken() {
  accessToken = null;
}
