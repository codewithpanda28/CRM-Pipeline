import dns from 'dns/promises';
import { isIP } from 'net';

const BLOCKED_CIDRS_V4: Array<[number, number]> = [
  [0x7f000000, 0xff000000],
  [0x0a000000, 0xff000000],
  [0xac100000, 0xfff00000],
  [0xc0a80000, 0xffff0000],
  [0xa9fe0000, 0xffff0000],
  [0x00000000, 0xff000000],
  [0xc0000000, 0xffffff00],
  [0xc0000200, 0xffffff00],
  [0xc6336400, 0xfffe0000],
  [0xcb007100, 0xffffff00],
  [0xe0000000, 0xf0000000],
  [0xf0000000, 0xf0000000],
];

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isBlockedV4(ip: string): boolean {
  const val = ipv4ToInt(ip);
  return BLOCKED_CIDRS_V4.some(([net, mask]) => (val & mask) === (net & mask));
}

function isBlockedV6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
  if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true;
  const first16 = parseInt(lower.split(':')[0] ?? '0', 16);
  if ((first16 & 0xfe00) === 0xfc00) return true;
  if ((first16 & 0xffc0) === 0xfe80) return true;
  if ((first16 & 0xff00) === 0xff00) return true;
  if (lower.startsWith('::ffff:')) {
    const v4part = lower.slice(7);
    if (isIP(v4part) === 4) return isBlockedV4(v4part);
  }
  return false;
}

function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedV4(ip);
  if (version === 6) return isBlockedV6(ip);
  return true;
}

export class SsrfError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'SsrfError';
  }
}

export async function assertSafeUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfError(`Invalid URL: ${rawUrl}`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new SsrfError(`Blocked URL scheme "${parsed.protocol}". Only http/https allowed.`);
  }

  const hostname = parsed.hostname;

  // Test-only escape hatch for local HTTP servers (never set in production).
  if (
    process.env['WEBHOOK_ALLOW_LOOPBACK'] === '1' &&
    process.env['NODE_ENV'] === 'test' &&
    (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1')
  ) {
    return;
  }

  if (isIP(hostname) !== 0) {
    if (isBlockedIp(hostname)) {
      throw new SsrfError(`Blocked request to private/reserved IP: ${hostname}`);
    }
    return;
  }

  let addresses: string[];
  try {
    const results = await dns.resolve(hostname, 'ANY').catch(() => dns.lookup(hostname, { all: true }));
    addresses = Array.isArray(results)
      ? results.map((r: { address?: string } | string) =>
          typeof r === 'string' ? r : (r.address as string),
        )
      : [String(results)];
  } catch {
    throw new SsrfError(`Failed to resolve host: ${hostname}`);
  }

  for (const addr of addresses) {
    if (isBlockedIp(addr)) {
      throw new SsrfError(`Blocked: "${hostname}" resolves to private/reserved IP ${addr}`);
    }
  }
}
