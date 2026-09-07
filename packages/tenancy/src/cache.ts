/** Cache key isolation. */

export function tenantCacheKey(tenantId: string, ...parts: string[]): string {
  return ['t', tenantId, ...parts].join(':');
}

export function moduleCacheKey(tenantId: string, moduleId: string): string {
  return tenantCacheKey(tenantId, 'module', moduleId);
}

export function permissionCacheKey(tenantId: string, userId: string): string {
  return tenantCacheKey(tenantId, 'perms', userId);
}

export function brandingCacheKey(tenantId: string, version: number | string): string {
  return tenantCacheKey(tenantId, 'brand', String(version));
}

/** Detect accidental global keys holding tenant-ish payloads (heuristic for tests). */
export function isTenantIsolatedCacheKey(key: string): boolean {
  return key.startsWith('t:') || key.startsWith('tenants/');
}
