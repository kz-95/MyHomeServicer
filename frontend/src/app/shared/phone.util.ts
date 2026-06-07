/**
 * Normalise a Malaysian phone number to international `+60` form.
 *
 * Strips spaces, dashes and parentheses, then ensures the Malaysian country
 * code:
 *   "012-345 6789"      → "+60123456789"
 *   "0123456789"        → "+60123456789"
 *   "+60 12-345 6789"   → "+60123456789"
 *   "60123456789"       → "+60123456789"
 *   "123456789"         → "+60123456789"
 * Blank/garbage input is returned unchanged. Pure string logic - no network
 * or AI service involved.
 */
export function normalizeMyPhone(raw: string): string {
  if (!raw || !raw.trim()) return raw;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  if (digits.startsWith('60')) {
    // already carries the Malaysian country code
  } else if (digits.startsWith('0')) {
    digits = '60' + digits.slice(1); // local 0xx → 60xx
  } else {
    digits = '60' + digits; // bare subscriber number
  }
  return '+' + digits;
}
