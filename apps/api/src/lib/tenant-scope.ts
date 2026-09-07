import type { TenantContext } from '@vencore/tenancy';
import { TenantContextError, assertTenantContext } from '@vencore/tenancy';

/**
 * Repository helper: always scope tenant-owned queries from TenantContext —
 * never from client-supplied tenantId.
 */
export function tenantScopeId(ctx: TenantContext): string {
  assertTenantContext(ctx);
  // Phase 2A dual-read: workspace_id columns still hold tenant id
  return ctx.workspaceId || ctx.tenantId;
}

export function assertSameTenant(ctx: TenantContext, rowTenantOrWorkspaceId: string | null | undefined): void {
  assertTenantContext(ctx);
  if (!rowTenantOrWorkspaceId || rowTenantOrWorkspaceId !== tenantScopeId(ctx)) {
    throw new TenantContextError('Cross-tenant access denied', 'MISSING_TENANT_CONTEXT');
  }
}

export function tenantWhereClause(ctx: TenantContext): { workspace_id: string } {
  return { workspace_id: tenantScopeId(ctx) };
}
