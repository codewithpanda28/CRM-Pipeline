import { isIP } from 'net';

/** Outbound URL SSRF foundation (ADR-023 P0). */
export function assertSafeOutboundUrl(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('INVALID_URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('INVALID_SCHEME');
  }
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'metadata.google.internal') {
    throw new Error('SSRF_BLOCKED');
  }
  if (isIP(host)) {
    if (
      host.startsWith('10.') ||
      host.startsWith('127.') ||
      host.startsWith('0.') ||
      host.startsWith('169.254.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      host === '::1'
    ) {
      throw new Error('SSRF_BLOCKED');
    }
  }
}
