/**
 * Parses the `:year` URL segment. Accepts exactly four digits with no leading
 * zero, so "2026abc", "2026.0", "2e3", "+2026" and " 2026" are rejected
 * (parseInt and Number are both too forgiving on their own). Returns null for
 * anything else.
 */
export function parseYear(raw: string): number | null {
  return /^[1-9]\d{3}$/.test(raw) ? Number(raw) : null;
}
