/**
 * Drop deals.source_pipeline_item_id FK so Deal-first creates can insert
 * deal then pipeline_item (same UUID) without circular FK failure.
 */
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE deals
    DROP CONSTRAINT IF EXISTS deals_source_pipeline_item_id_fkey
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Re-adding FK only when all source ids exist in pipeline_items
  await sql`
    ALTER TABLE deals
    ADD CONSTRAINT deals_source_pipeline_item_id_fkey
    FOREIGN KEY (source_pipeline_item_id)
    REFERENCES pipeline_items(id)
    ON DELETE SET NULL
  `.execute(db);
}
