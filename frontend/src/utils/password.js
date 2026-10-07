/**
 * Password strength scoring for the sign-up meter.
 *
 * This is a UX hint, not a security control - the real rules are enforced by
 * Django's AUTH_PASSWORD_VALIDATORS on the server.
 */
const COMMON = [
  'password', '12345678', 'qwerty', 'letmein', 'welcome',
  'admin123', 'iloveyou', 'digibank', 'abc12345',
];

/** @returns {{score: 0|1|2|3|4, label: string, tone: string, hints: string[]}} */
export function scorePassword(password = '') {
  const hints = [];
  if (!password) {
    return { score: 0, label: '', tone: 'ink', hints: [] };
  }

  let score = 0;
  if (password.length >= 8) score += 1;
  else hints.push('Use at least 8 characters');

  if (password.length >= 12) score += 1;

  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  else hints.push('Mix upper and lower case');

  if (/\d/.test(password)) score += 1;
  else hints.push('Add a number');

  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  else hints.push('A symbol makes it much stronger');

  // Obvious passwords get slammed regardless of how they scored above.
  if (COMMON.some((c) => password.toLowerCase().includes(c))) {
    score = Math.min(score, 1);
    hints.unshift('That looks like a very common password');
  }

  const normalised = Math.min(4, Math.max(0, score - 1));
  const meta = [
    { label: 'Very weak', tone: 'danger' },
    { label: 'Weak', tone: 'danger' },
    { label: 'Fair', tone: 'accent' },
    { label: 'Strong', tone: 'success' },
    { label: 'Very strong', tone: 'success' },
  ][normalised];

  return { score: normalised, ...meta, hints: hints.slice(0, 2) };
}
