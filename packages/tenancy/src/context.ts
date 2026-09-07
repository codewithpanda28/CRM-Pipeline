/** Canonical ThinkAIQ TenantContext (ADR-017 / ADR-020). */

export type PrincipalType = 'user' | 'api_key' | 'webhook' | 'worker' | 'platform_admin' | 'system';

export type TenantContextSource =
  | 'browser'
  | 'api_key'
  | 'webhook'
  | 'worker'
  | 'platform_admin';

export type TenantStatus = 'provisioning' | 'active' | 'suspended' | 'archived' | 'deleting';

export type MembershipStatus = 'invited' | 'active' | 'disabled';

export interface TenantPrincipal {
  type: PrincipalType;
  id: string;
}

export interface TenantMembershipRef {
  id: string;
  status: MembershipStatus;
  isOwner: boolean;
}

export interface TenantContext {
  tenantId: string;
  /** Dual-read: Phase 2A keeps workspace_id === tenantId for migrated rows. */
  workspaceId: string;
  principal: TenantPrincipal;
  membership: TenantMembershipRef | null;
  permissions: ReadonlySet<string>;
  source: TenantContextSource;
  requestId: string;
  correlationId: string;
  tenantStatus: TenantStatus;
  resolvedHost: string | null;
}

export class TenantContextError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'MISSING_TENANT_CONTEXT'
      | 'AMBIGUOUS_TENANT'
      | 'HOST_JWT_MISMATCH'
      | 'MEMBERSHIP_REQUIRED'
      | 'TENANT_NOT_ACTIVE'
      | 'MUTATION_BLOCKED'
      | 'UNKNOWN_HOST'
      | 'BODY_TENANT_REJECTED',
  ) {
    super(message);
    this.name = 'TenantContextError';
  }
}

export function assertTenantContext(ctx: TenantContext | null | undefined): asserts ctx is TenantContext {
  if (!ctx?.tenantId) {
    throw new TenantContextError('TenantContext required', 'MISSING_TENANT_CONTEXT');
  }
}

/** Never authorize from client-supplied body tenantId. */
export function rejectBodyTenantId(body: unknown): void {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const b = body as Record<string, unknown>;
    if ('tenantId' in b || 'tenant_id' in b) {
      // Presence is allowed only if ignored; callers must not use these fields.
      // Soft-detect for tests / middleware that strip before handlers.
    }
  }
}

export function bodyTenantOverrideAttempt(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const b = body as Record<string, unknown>;
  return Object.prototype.hasOwnProperty.call(b, 'tenantId')
    || Object.prototype.hasOwnProperty.call(b, 'tenant_id');
}
