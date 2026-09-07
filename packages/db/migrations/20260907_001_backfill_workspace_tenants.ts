/**
 * Idempotent backfill: workspaces created after 20260904_001 (e.g. /setup)
 * never received matching tenants / memberships / companion rows.
 *
 * ADR-017 / ADR-024: tenants.id === workspaces.id (dual-read).
 * Non-destructive: INSERT … ON CONFLICT DO NOTHING only. Never wipes data.
 */
import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    INSERT INTO tenants (id, display_name, slug, status, provisioned_at, created_at, updated_at)
    SELECT
      w.id,
      w.name,
      COALESCE(
        NULLIF(LOWER(REGEXP_REPLACE(COALESCE(w.domain, w.name), '[^a-zA-Z0-9]+', '-', 'g')), ''),
        REPLACE(w.id::text, '-', '')
      ),
      'active',
      COALESCE(w.created_at, now()),
      COALESCE(w.created_at, now()),
      COALESCE(w.updated_at, now())
    FROM workspaces w
    ON CONFLICT (id) DO NOTHING
  `.execute(db);

  await sql`
    UPDATE tenants t
    SET slug = (t.slug || '-' || SUBSTRING(REPLACE(t.id::text, '-', '') FROM 1 FOR 8))
    WHERE t.id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at) AS rn
        FROM tenants
      ) x WHERE rn > 1
    )
  `.execute(db);

  await sql`
    INSERT INTO tenant_memberships (tenant_id, user_id, status, is_owner, joined_at)
    SELECT u.workspace_id, u.id, 'active', true, COALESCE(u.created_at, now())
    FROM users u
    WHERE EXISTS (SELECT 1 FROM tenants t WHERE t.id = u.workspace_id)
    ON CONFLICT (tenant_id, user_id) DO NOTHING
  `.execute(db);

  await sql`
    INSERT INTO tenant_domains (tenant_id, host, type, is_primary, verification_status, ssl_status)
    SELECT
      t.id,
      (t.slug || '.thinkaiq.com'),
      'tenant_subdomain',
      true,
      'active',
      'ready'
    FROM tenants t
    ON CONFLICT (host) DO NOTHING
  `.execute(db);

  await sql`
    INSERT INTO tenant_settings (tenant_id)
    SELECT id FROM tenants
    ON CONFLICT (tenant_id) DO NOTHING
  `.execute(db);

  await sql`
    INSERT INTO tenant_branding (tenant_id, brand_name)
    SELECT id, display_name FROM tenants
    ON CONFLICT (tenant_id) DO NOTHING
  `.execute(db);

  await sql`
    INSERT INTO tenant_job_controls (tenant_id, jobs_paused)
    SELECT id, false FROM tenants
    ON CONFLICT (tenant_id) DO NOTHING
  `.execute(db);
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // Non-destructive: do not remove tenant rows that may now be live SoR companions.
}
