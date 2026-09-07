import { canRunBusinessJobs, type TenantStatus } from '@vencore/tenancy';
import type { JobDefinition, JobScope } from './types';
import { PermanentJobError } from './retries';

export interface TenantJobSnapshot {
  id: string;
  status: TenantStatus;
  jobsPaused: boolean;
}

export type LoadTenantFn = (tenantId: string) => Promise<TenantJobSnapshot | null>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertValidScope(scope: JobScope): void {
  if (scope !== 'tenant' && scope !== 'platform') {
    throw new PermanentJobError(`Invalid job scope: ${String(scope)}`, 'INVALID_SCOPE');
  }
}

/**
 * Worker middleware: reject missing/invalid tenant, wrong scope, suspended tenants.
 * Never infer tenant from payload — only from JobDefinition.tenantId.
 */
export async function assertJobAllowed(
  definition: Pick<JobDefinition, 'tenantId' | 'scope' | 'name' | 'payload'>,
  loadTenant: LoadTenantFn,
  opts?: { allowLifecycleJobNames?: Set<string> },
): Promise<TenantJobSnapshot | null> {
  assertValidScope(definition.scope);

  if (definition.scope === 'platform') {
    // Platform jobs may optionally target a tenant for lifecycle work.
    // They must never silently run arbitrary business work under a forged payload tenant.
    if (!definition.tenantId) return null;
    if (!UUID_RE.test(definition.tenantId)) {
      throw new PermanentJobError('Invalid tenantId format', 'INVALID_TENANT');
    }
    const tenant = await loadTenant(definition.tenantId);
    if (!tenant) {
      throw new PermanentJobError('Tenant not found', 'TENANT_NOT_FOUND');
    }
    return tenant;
  }

  const tenantId = definition.tenantId;
  if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
    throw new PermanentJobError('Missing tenantId for tenant-scoped job', 'MISSING_TENANT');
  }
  if (!UUID_RE.test(tenantId)) {
    throw new PermanentJobError('Invalid tenantId format', 'INVALID_TENANT');
  }

  // Never trust payload.tenantId over definition
  const payloadTenant = definition.payload?.['tenantId'];
  if (payloadTenant != null && String(payloadTenant) !== tenantId) {
    throw new PermanentJobError(
      'Payload tenantId does not match job tenantId',
      'TENANT_PAYLOAD_MISMATCH',
    );
  }

  const tenant = await loadTenant(tenantId);
  if (!tenant) {
    throw new PermanentJobError('Tenant not found', 'TENANT_NOT_FOUND');
  }

  const lifecycleAllow = opts?.allowLifecycleJobNames?.has(definition.name) ?? false;
  if (!canRunBusinessJobs(tenant.status, tenant.jobsPaused)) {
    if (lifecycleAllow) return tenant;
    throw new PermanentJobError(
      `Tenant jobs prohibited (status=${tenant.status}, paused=${tenant.jobsPaused})`,
      'TENANT_JOBS_BLOCKED',
    );
  }

  return tenant;
}
