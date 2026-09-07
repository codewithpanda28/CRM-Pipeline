/** Lead identity normalize helpers — tenant-scoped matching only. */

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  return v.length > 0 ? v : null;
}

/** Digits-only phone for soft matching. Returns null if too short. */
export function normalizePhoneDigits(raw: string | null | undefined, minLen = 7): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= minLen ? digits : null;
}

/** Hostname from website URL or bare domain string. */
export function normalizeWebsiteHost(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const host = new URL(s).hostname.replace(/^www\./, '');
    return host.length > 0 ? host : null;
  } catch {
    return null;
  }
}

export function displayLeadName(parts: {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  const n = parts.name?.trim();
  if (n) return n;
  const joined = [parts.first_name, parts.last_name].filter(Boolean).join(' ').trim();
  return joined || 'Untitled lead';
}
