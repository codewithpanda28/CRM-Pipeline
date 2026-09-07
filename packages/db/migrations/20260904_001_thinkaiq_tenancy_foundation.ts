import { Kysely, sql } from 'kysely';

/**
 * ThinkAIQ Phase 2A — additive tenancy foundation (ADR-017/018/020).
 * Expand-only: does NOT drop workspaces or users.workspace_id.
 * Dual-read: tenants.id === workspaces.id for backfilled rows.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY,
      display_name TEXT NOT NULL,
      legal_name TEXT NULL,
      slug TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('provisioning','active','suspended','archived','deleting')),
      status_reason TEXT NULL,
      plan_id UUID NULL,
      trial_ends_at TIMESTAMPTZ NULL,
      suspended_at TIMESTAMPTZ NULL,
      archived_at TIMESTAMPTZ NULL,
      provisioned_at TIMESTAMPTZ NULL,
      parent_tenant_id UUID NULL,
      reseller_id UUID NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ NULL
    )
  `.execute(db);

  await sql`CREATE INDEX IF NOT EXISTS tenants_status_idx ON tenants (status)`.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS tenant_memberships (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('invited','active','disabled')),
      is_owner BOOLEAN NOT NULL DEFAULT false,
      invited_by UUID NULL,
      joined_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, user_id)
    )
  `.execute(db);

  await sql`CREATE INDEX IF NOT EXISTS tenant_memberships_user_idx ON tenant_memberships (user_id)`.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS tenant_memberships_tenant_status_idx ON tenant_memberships (tenant_id, status)`.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS tenant_domains (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      host TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK (type IN ('tenant_subdomain','custom')),
      is_primary BOOLEAN NOT NULL DEFAULT false,
      verification_status TEXT NOT NULL DEFAULT 'active',
      verification_token TEXT NULL,
      ssl_status TEXT NOT NULL DEFAULT 'ready',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS tenant_settings (
      tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
      locale TEXT NULL,
      timezone TEXT NULL,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS tenant_branding (
      tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
      brand_name TEXT NULL,
      legal_name TEXT NULL,
      logo_file_id UUID NULL,
      favicon_file_id UUID NULL,
      primary_color TEXT NULL,
      secondary_color TEXT NULL,
      typography JSONB NOT NULL DEFAULT '{}'::jsonb,
      theme JSONB NOT NULL DEFAULT '{}'::jsonb,
      login JSONB NOT NULL DEFAULT '{}'::jsonb,
      support JSONB NOT NULL DEFAULT '{}'::jsonb,
      email_from_name TEXT NULL,
      email_from_address TEXT NULL,
      version INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS tenant_job_controls (
      tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
      jobs_paused BOOLEAN NOT NULL DEFAULT false,
      pause_reason TEXT NULL,
      paused_by UUID NULL,
      paused_at TIMESTAMPTZ NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS platform_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      mfa_enabled BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS security_audit_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NULL,
      entity_id TEXT NULL,
      ip TEXT NULL,
      user_agent TEXT NULL,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`CREATE INDEX IF NOT EXISTS security_audit_tenant_idx ON security_audit_events (tenant_id, created_at DESC)`.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS outbox_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NULL,
      event_type TEXT NOT NULL,
      aggregate_type TEXT NULL,
      aggregate_id TEXT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','publishing','published','failed','dead')),
      attempts INT NOT NULL DEFAULT 0,
      published_at TIMESTAMPTZ NULL,
      dedupe_key TEXT NULL,
      correlation_id TEXT NULL,
      causation_id TEXT NULL,
      last_error TEXT NULL,
      job_name TEXT NULL,
      job_handle TEXT NULL,
      locked_until TIMESTAMPTZ NULL,
      locked_by TEXT NULL
    )
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS outbox_events_dedupe_uq
    ON outbox_events (dedupe_key) WHERE dedupe_key IS NOT NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS outbox_events_pending_idx
    ON outbox_events (status, available_at)
  `.execute(db);

  // Dual-read columns on users (nullable extras — do not drop workspace_id)
  await sql`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS password_reset_token_hash TEXT NULL
  `.execute(db);

  await sql`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS session_version INT NOT NULL DEFAULT 1
  `.execute(db);

  // Backfill tenants from workspaces (id preserved for dual-read)
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
      w.created_at,
      w.created_at,
      w.updated_at
    FROM workspaces w
    ON CONFLICT (id) DO NOTHING
  `.execute(db);

  // Ensure unique slugs if collision — append short id
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
    SELECT u.workspace_id, u.id, 'active', true, u.created_at
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

export async function down(db: Kysely<unknown>): Promise<void> {
  // Non-destructive preferred; down only for local resets
  await sql`DROP TABLE IF EXISTS outbox_events`.execute(db);
  await sql`DROP TABLE IF EXISTS security_audit_events`.execute(db);
  await sql`DROP TABLE IF EXISTS tenant_job_controls`.execute(db);
  await sql`DROP TABLE IF EXISTS tenant_branding`.execute(db);
  await sql`DROP TABLE IF EXISTS tenant_settings`.execute(db);
  await sql`DROP TABLE IF EXISTS tenant_domains`.execute(db);
  await sql`DROP TABLE IF EXISTS tenant_memberships`.execute(db);
  await sql`DROP TABLE IF EXISTS tenants`.execute(db);
  await sql`DROP TABLE IF EXISTS platform_users`.execute(db);
  await sql`ALTER TABLE users DROP COLUMN IF EXISTS password_reset_token_hash`.execute(db);
  await sql`ALTER TABLE users DROP COLUMN IF EXISTS session_version`.execute(db);
}
