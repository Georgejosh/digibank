/**
 * MONEY RULE (mirrors backend/apps/savings/models.py)
 * ---------------------------------------------------
 * Every amount crossing the API is an INTEGER NUMBER OF PAISE.
 * 1 rupee = 100 paise. Never a float: 0.1 + 0.2 !== 0.3 in JavaScript, so
 * repeated additions drift and the balance stops matching the ledger.
 *
 * Formatting paise -> "Rs 1,250.00" is the frontend's job, and it happens
 * here and nowhere else.
 */

/** Format paise for display. formatPaise(125000) -> "₹1,250.00" */
export function formatPaise(paise, { showDecimals = true, symbol = '₹' } = {}) {
  const value = Number(paise ?? 0) / 100;
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(value);
  return `${symbol}${formatted}`;
}

/** Compact form for tight cards. formatPaiseShort(12500000) -> "₹1.25L" */
export function formatPaiseShort(paise) {
  const rupees = Number(paise ?? 0) / 100;
  if (rupees >= 10000000) return `₹${(rupees / 10000000).toFixed(2)}Cr`;
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(2)}L`;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)}K`;
  return formatPaise(paise, { showDecimals: false });
}

/** User typed rupees in a form -> paise for the API. Rounds, never floors. */
export function rupeesToPaise(rupees) {
  const n = Number(rupees);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** paise -> a rupee number, for prefilling a form field. */
export function paiseToRupees(paise) {
  return Number(paise ?? 0) / 100;
}

/** Progress of a savings goal as a 0-100 number, clamped. */
export function progressPercent(balancePaise, targetPaise) {
  if (!targetPaise || targetPaise <= 0) return 0;
  return Math.min(100, Math.round((balancePaise / targetPaise) * 1000) / 10);
}
