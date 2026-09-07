/**
 * Dual-write workspace ↔ tenant (ADR-017 / ADR-024).
 * Canonical boundary: tenants.id === workspaces.id (same UUID).
 * Idempotent — safe to retry; never deletes or replaces CRM rows.
 */
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '@vencore/db';

type DbLike = Kysely<Database> | Transaction<Database>;

export function slugFromDomainOrName(domainOrName: string, fallbackId: string): string {
  const base = domainOrName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base) return base.slice(0, 63);
  return fallbackId.replace(/-/g, '').slice(0, 32);
}

export async function ensureWorkspaceTenantRecords(
  db: DbLike,
  opts: {
    workspaceId: string;
    displayName: string;
    /** Prefer workspace.domain; falls back to displayName / id */
    domainOrSlug?: string | null;
    ownerUserId?: string | null;
    primaryColor?: string | null;
    brandName?: string | null;
  },
): Promise<void> {
  const now = new Date();
  const slug = slugFromDomainOrName(
    opts.domainOrSlug?.trim() || opts.displayName,
    opts.workspaceId,
  );

  await db
    .insertInto('tenants')
    .values({
      id: opts.workspaceId,
      display_name: opts.displayName,
      slug,
      status: 'active',
      provisioned_at: now,
    })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute();

  // Slug uniqueness: if another tenant already owns this slug, suffix short id.
  const collision = await db
    .selectFrom('tenants')
    .select('id')
    .where('slug', '=', slug)
    .where('id', '!=', opts.workspaceId)
    .executeTakeFirst();
  if (collision) {
    const uniqueSlug = `${slug}-${opts.workspaceId.replace(/-/g, '').slice(0, 8)}`.slice(0, 63);
    await db
      .updateTable('tenants')
      .set({ slug: uniqueSlug, updated_at: now })
      .where('id', '=', opts.workspaceId)
      .execute();
  }

  const tenant = await db
    .selectFrom('tenants')
    .select(['id', 'slug', 'display_name'])
    .where('id', '=', opts.workspaceId)
    .executeTakeFirstOrThrow();

  if (opts.ownerUserId) {
    await db
      .insertInto('tenant_memberships')
      .values({
        tenant_id: opts.workspaceId,
        user_id: opts.ownerUserId,
        status: 'active',
        is_owner: true,
        joined_at: now,
      })
      .onConflict((oc) => oc.columns(['tenant_id', 'user_id']).doNothing())
      .execute();
  }

  const host = `${tenant.slug}.thinkaiq.com`;
  await db
    .insertInto('tenant_domains')
    .values({
      tenant_id: opts.workspaceId,
      host,
      type: 'tenant_subdomain',
      is_primary: true,
      verification_status: 'active',
      ssl_status: 'ready',
    })
    .onConflict((oc) => oc.column('host').doNothing())
    .execute();

  await db
    .insertInto('tenant_settings')
    .values({ tenant_id: opts.workspaceId })
    .onConflict((oc) => oc.column('tenant_id').doNothing())
    .execute();

  await db
    .insertInto('tenant_branding')
    .values({
      tenant_id: opts.workspaceId,
      brand_name: opts.brandName ?? tenant.display_name,
      primary_color: opts.primaryColor ?? null,
    })
    .onConflict((oc) => oc.column('tenant_id').doNothing())
    .execute();

  await db
    .insertInto('tenant_job_controls')
    .values({ tenant_id: opts.workspaceId, jobs_paused: false })
    .onConflict((oc) => oc.column('tenant_id').doNothing())
    .execute();
}

/** Backfill every workspace missing a matching tenants row (idempotent). */
export async function backfillMissingWorkspaceTenants(db: DbLike): Promise<number> {
  const missing = await db
    .selectFrom('workspaces as w')
    .leftJoin('tenants as t', 't.id', 'w.id')
    .select(['w.id', 'w.name', 'w.domain'])
    .where('t.id', 'is', null)
    .execute();

  for (const row of missing) {
    const owner = await db
      .selectFrom('users')
      .select('id')
      .where('workspace_id', '=', row.id)
      .orderBy('created_at', 'asc')
      .executeTakeFirst();

    await ensureWorkspaceTenantRecords(db, {
      workspaceId: row.id,
      displayName: row.name,
      domainOrSlug: row.domain,
      ownerUserId: owner?.id ?? null,
      brandName: row.name,
    });
  }

  // Memberships for users whose workspace already has a tenant but membership missing
  const users = await db
    .selectFrom('users as u')
    .innerJoin('tenants as t', 't.id', 'u.workspace_id')
    .leftJoin('tenant_memberships as m', (join) =>
      join.onRef('m.tenant_id', '=', 'u.workspace_id').onRef('m.user_id', '=', 'u.id'),
    )
    .select(['u.id as user_id', 'u.workspace_id as tenant_id'])
    .where('m.id', 'is', null)
    .execute();

  const now = new Date();
  for (const u of users) {
    await db
      .insertInto('tenant_memberships')
      .values({
        tenant_id: u.tenant_id,
        user_id: u.user_id,
        status: 'active',
        is_owner: true,
        joined_at: now,
      })
      .onConflict((oc) => oc.columns(['tenant_id', 'user_id']).doNothing())
      .execute();
  }

  return missing.length;
}
