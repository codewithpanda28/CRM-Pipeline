/** Host resolution (ADR-017). */

export interface HostResolutionConfig {
  /** e.g. thinkaiq.com */
  platformBaseDomain: string;
  /** Hosts that are platform (no tenant from subdomain): app.thinkaiq.com, localhost, api… */
  platformHosts: string[];
  /** When true, trust X-Forwarded-Host only if req came via configured proxy (caller responsibility). */
  trustProxy: boolean;
}

export type HostResolutionResult =
  | { kind: 'platform'; host: string }
  | { kind: 'tenant_subdomain'; host: string; slug: string }
  | { kind: 'custom_domain'; host: string }
  | { kind: 'unknown'; host: string };

export function normalizeHost(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let h = raw.trim().toLowerCase();
  // Strip port
  if (h.includes(':') && !h.startsWith('[')) {
    h = h.split(':')[0] ?? h;
  }
  // Ignore obvious spoofs
  if (!h || h === 'null' || h.includes('/') || h.includes(' ')) return null;
  return h;
}

/**
 * Choose Host: prefer X-Forwarded-Host only when trustProxy; else Host.
 * Never invent a tenant from untrusted input.
 */
export function pickRequestHost(
  headers: Record<string, string | string[] | undefined>,
  trustProxy: boolean,
): string | null {
  const fwd = headers['x-forwarded-host'];
  const host = headers['host'];
  const raw = trustProxy
    ? (Array.isArray(fwd) ? fwd[0] : fwd) || (Array.isArray(host) ? host[0] : host)
    : (Array.isArray(host) ? host[0] : host);
  return normalizeHost(typeof raw === 'string' ? raw : null);
}

export function classifyHost(host: string, cfg: HostResolutionConfig): HostResolutionResult {
  const platformSet = new Set(cfg.platformHosts.map((h) => h.toLowerCase()));
  if (platformSet.has(host)) {
    return { kind: 'platform', host };
  }

  // Railway / local preview hosts are platform (no tenant slug from subdomain)
  if (
    host.endsWith('.up.railway.app') ||
    host.endsWith('.railway.app') ||
    host.endsWith('.railway.internal')
  ) {
    return { kind: 'platform', host };
  }

  const base = cfg.platformBaseDomain.toLowerCase();
  const suffix = `.${base}`;
  if (host === base) {
    return { kind: 'platform', host };
  }
  if (host.endsWith(suffix)) {
    const slug = host.slice(0, -suffix.length);
    if (!slug || slug.includes('.')) {
      // multi-level or empty — treat unknown unless listed as platform
      return { kind: 'unknown', host };
    }
    // reserved platform labels
    if (['app', 'api', 'admin', 'www', 'static'].includes(slug)) {
      return { kind: 'platform', host };
    }
    return { kind: 'tenant_subdomain', host, slug };
  }

  // Non-platform host → custom domain candidate (lookup required)
  return { kind: 'custom_domain', host };
}
