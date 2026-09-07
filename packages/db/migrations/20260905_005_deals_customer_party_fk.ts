/**
 * Phase 3A.3 Step 2A — activate deals.customer_party_id FK (additive).
 * Does not alter primary_contact_id / company_id or dual-write strategy.
 *
 * Precondition: all existing customer_party_id values are NULL
 * (Step 1 integrity rejected non-null writes).
 */
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  const orphans = await sql<{ n: string }>`
    SELECT COUNT(*)::text AS n
    FROM deals d
    WHERE d.customer_party_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM customer_parties cp
        WHERE cp.id = d.customer_party_id
          AND cp.workspace_id = d.workspace_id
          AND cp.deleted_at IS NULL
          AND cp.status <> 'merged'
      )
  `.execute(db);

  const orphanCount = Number(orphans.rows[0]?.n ?? '0');
  if (orphanCount > 0) {
    throw new Error(
      `deals.customer_party_id FK blocked: ${orphanCount} invalid non-null reference(s)`,
    );
  }

  await sql`
    ALTER TABLE deals
      DROP CONSTRAINT IF EXISTS deals_customer_party_id_fkey
  `.execute(db);

  await sql`
    ALTER TABLE deals
      ADD CONSTRAINT deals_customer_party_id_fkey
      FOREIGN KEY (customer_party_id)
      REFERENCES customer_parties(id)
      ON DELETE SET NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS deals_workspace_customer_party_idx
    ON deals (workspace_id, customer_party_id)
    WHERE customer_party_id IS NOT NULL AND deleted_at IS NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS deals_workspace_customer_party_idx`.execute(db);
  await sql`
    ALTER TABLE deals
      DROP CONSTRAINT IF EXISTS deals_customer_party_id_fkey
  `.execute(db);
}
