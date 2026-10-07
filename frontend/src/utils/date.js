/** Date helpers. The API sends ISO strings / YYYY-MM-DD dates. */

/** "2026-11-30" -> "30 Nov 2026" */
export function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/** "2026-11-30" -> "30 Nov" (used on space-tight cards) */
export function formatDayMonth(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(d);
}

/** Relative time for activity feeds: "2h ago", "3d ago", "just now". */
export function timeAgo(value) {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(value);
}

/** Whole days from today until a deadline. Negative once it has passed. */
export function daysUntil(value) {
  if (!value) return null;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

/** ISO date string for an <input type="date"> min attribute (today). */
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Countdown to a future moment: "in 21h", "in 3d", "expired".
 *
 * timeAgo() cannot express this - a future timestamp gives it a negative
 * difference and it collapses to "just now", which reads as nonsense on an
 * expiry deadline.
 */
export function timeUntil(value) {
  if (!value) return '';
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return '';

  const seconds = Math.floor((target - Date.now()) / 1000);
  if (seconds <= 0) return 'expired';
  if (seconds < 60) return 'in under a minute';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  return `in ${days}d`;
}
