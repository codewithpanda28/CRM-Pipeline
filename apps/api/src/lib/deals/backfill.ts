import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { upsertDealFromPipelineItem } from './projection';
import { resolveFallbackOwner } from './integrity';

export interface DealBackfillReport {
  pipeline_items_total: number;
  deals_created: number;
  skipped: number;
  unmapped: number;
  failed: number;
  duplicates: number;
}

/**
 * Idempotent runtime backfill (safe to re-run). Prefer migration SQL for cold start;
 * this covers rows created while dual-write was offline.
 */
export async function backfillDealsFromPipelineItems(
  db: Kysely<Database>,
  opts?: { workspaceId?: string; limit?: number },
): Promise<DealBackfillReport> {
  const report: DealBackfillReport = {
    pipeline_items_total: 0,
    deals_created: 0,
    skipped: 0,
    unmapped: 0,
    failed: 0,
    duplicates: 0,
  };

  let q = db
    .selectFrom('pipeline_items')
    .selectAll()
    .orderBy('created_at', 'asc');
  if (opts?.workspaceId) q = q.where('workspace_id', '=', opts.workspaceId);
  if (opts?.limit) q = q.limit(opts.limit);

  const items = await q.execute();
  report.pipeline_items_total = items.length;

  for (const item of items) {
    try {
      const existing = await db
        .selectFrom('deals')
        .select('id')
        .where((eb) =>
          eb.or([
            eb('id', '=', item.id),
            eb('source_pipeline_item_id', '=', item.id),
          ]),
        )
        .executeTakeFirst();

      if (existing) {
        report.duplicates += 1;
        report.skipped += 1;
        continue;
      }

      const owner = await resolveFallbackOwner(db, item.workspace_id, null);
      if (!owner) {
        report.unmapped += 1;
        // No deal row yet — cannot write deal_migration_traces (FK). Count only.
        continue;
      }

      await db.transaction().execute(async (trx) => {
        await upsertDealFromPipelineItem(trx, {
          item: {
            id: item.id,
            workspace_id: item.workspace_id,
            pipeline_id: item.pipeline_id,
            stage_id: item.stage_id,
            field_values: item.field_values as Record<string, unknown>,
            deleted_at: item.deleted_at,
            created_at: item.created_at,
            updated_at: item.updated_at,
          },
          actorUserId: owner,
        });

        await trx
          .insertInto('deal_migration_traces')
          .values({
            workspace_id: item.workspace_id,
            deal_id: item.id,
            source_pipeline_item_id: item.id,
            mapping: {
              strategy: 'runtime_backfill',
              same_id: true,
            } as never,
            status: 'migrated',
          })
          .onConflict((oc) => oc.column('source_pipeline_item_id').doNothing())
          .execute();
      });

      report.deals_created += 1;
    } catch (err) {
      report.failed += 1;
      // continue — do not abort whole batch
      void err;
    }
  }

  return report;
}
