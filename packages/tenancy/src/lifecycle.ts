import type { TenantStatus } from './context';
import { TenantContextError } from './context';

const BUSINESS_MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isBusinessMutation(method: string): boolean {
  return BUSINESS_MUTATION_METHODS.has(method.toUpperCase());
}

/** Whether tenant may serve normal authenticated business APIs. */
export function canAccessTenant(status: TenantStatus): boolean {
  return status === 'active';
}

/** Whether tenant may mutate business data. */
export function canMutateTenant(status: TenantStatus): boolean {
  return status === 'active';
}

/** Whether business background jobs may run. */
export function canRunBusinessJobs(status: TenantStatus, jobsPaused: boolean): boolean {
  return status === 'active' && !jobsPaused;
}

export function assertTenantAllowsRequest(
  status: TenantStatus,
  method: string,
  opts?: { allowLifecycle?: boolean },
): void {
  if (status === 'provisioning') {
    throw new TenantContextError('Tenant is provisioning', 'TENANT_NOT_ACTIVE');
  }
  if (status === 'archived' || status === 'deleting') {
    throw new TenantContextError('Tenant is not available', 'TENANT_NOT_ACTIVE');
  }
  if (status === 'suspended') {
    if (opts?.allowLifecycle) return;
    if (isBusinessMutation(method)) {
      throw new TenantContextError('Tenant suspended — mutations blocked', 'MUTATION_BLOCKED');
    }
    // reads may be allowed as read-only — product default: allow GET
  }
}
