/** Storage namespace (ADR-008 / Phase 2A). */

export function tenantObjectKey(tenantId: string, ...parts: string[]): string {
  const clean = parts.map((p) => p.replace(/^\/+/, '').replace(/\.\./g, '')).filter(Boolean);
  return ['tenants', tenantId, ...clean].join('/');
}

/** Legacy Vencore messaging prefix — dual-read only. */
export function legacyMessagingKeyPrefix(workspaceId: string): string {
  return `messaging/${workspaceId}/`;
}

export function assertObjectKeyBelongsToTenant(
  objectKey: string,
  tenantId: string,
  workspaceId?: string,
): boolean {
  if (objectKey.startsWith(`tenants/${tenantId}/`)) return true;
  // Dual-read legacy
  if (workspaceId && objectKey.startsWith(legacyMessagingKeyPrefix(workspaceId))) return true;
  if (workspaceId && objectKey.startsWith(`tenants/${workspaceId}/`)) return true;
  return false;
}
