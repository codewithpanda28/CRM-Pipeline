/**
 * Phase 3A.3 — extend lead_conversion_links for customer_party lineage.
 * Additive only — drops/recreates CHECK; no data loss (existing rows valid).
 */
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE lead_conversion_links
      DROP CONSTRAINT IF EXISTS lead_conversion_links_entity_type_check
  `.execute(db);

  await sql`
    ALTER TABLE lead_conversion_links
      ADD CONSTRAINT lead_conversion_links_entity_type_check
      CHECK (entity_type IN ('contact', 'company', 'deal', 'customer_party'))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    DELETE FROM lead_conversion_links WHERE entity_type = 'customer_party'
  `.execute(db);

  await sql`
    ALTER TABLE lead_conversion_links
      DROP CONSTRAINT IF EXISTS lead_conversion_links_entity_type_check
  `.execute(db);

  await sql`
    ALTER TABLE lead_conversion_links
      ADD CONSTRAINT lead_conversion_links_entity_type_check
      CHECK (entity_type IN ('contact', 'company', 'deal'))
  `.execute(db);
}
