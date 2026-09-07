import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { canRunBusinessJobs, type TenantStatus } from '@vencore/tenancy';

/** Worker gate: skip suspended / paused tenants (Phase 2A). */
export async function shouldRunBusinessJobForTenant(
  db: Kysely<Database>,
  tenantOrWorkspaceId: string,
): Promise<boolean> {
  try {
    const tenant = await db
      .selectFrom('tenants')
      .where('id', '=', tenantOrWorkspaceId)
      .select(['status'])
      .executeTakeFirst();
    const controls = await db
      .selectFrom('tenant_job_controls')
      .where('tenant_id', '=', tenantOrWorkspaceId)
      .select(['jobs_paused'])
      .executeTakeFirst();
    const status = (tenant?.status as TenantStatus | undefined) ?? 'active';
    return canRunBusinessJobs(status, Boolean(controls?.jobs_paused));
  } catch {
    // Pre-migration: allow jobs
    return true;
  }
}
