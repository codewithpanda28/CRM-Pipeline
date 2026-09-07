/**
 * Apply stage + position for a pipeline item with sibling renumbering.
 * Position is 0-based index among non-deleted items in the destination stage.
 *
 * Uses one UPDATE with CASE for sibling positions to avoid N×RTT
 * when the DB is remote (e.g. localhost → Railway proxy).
 */
import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database } from '@vencore/db';

type DbLike = Kysely<Database> | Transaction<Database>;

export async function applyPipelineItemMove(
  db: DbLike,
  input: {
    workspaceId: string;
    itemId: string;
    pipelineId: string;
    stageId: string;
    position: number;
  },
): Promise<{ stage_id: string; position: number }> {
  const siblings = await db
    .selectFrom('pipeline_items')
    .select('id')
    .where('workspace_id', '=', input.workspaceId)
    .where('pipeline_id', '=', input.pipelineId)
    .where('stage_id', '=', input.stageId)
    .where('deleted_at', 'is', null)
    .where('id', '!=', input.itemId)
    .orderBy('position', 'asc')
    .orderBy('created_at', 'asc')
    .execute();

  const clamped = Math.max(0, Math.min(Math.floor(input.position), siblings.length));
  const orderedIds = siblings.map((s) => s.id);
  orderedIds.splice(clamped, 0, input.itemId);

  const now = new Date();
  const caseArms = orderedIds.map((id, i) => sql`WHEN ${id} THEN ${i}`);

  await db
    .updateTable('pipeline_items')
    .set({
      stage_id: input.stageId,
      position: sql`CASE id ${sql.join(caseArms, sql` `)} ELSE position END`,
      updated_at: now,
    })
    .where('workspace_id', '=', input.workspaceId)
    .where('id', 'in', orderedIds)
    .execute();

  return { stage_id: input.stageId, position: clamped };
}

/** Client helper: drop index relative to destination list including the dragged card. */
export function computeDropPosition(
  destItemIds: string[],
  draggingId: string,
  targetIndex: number,
): number {
  const without = destItemIds.filter((id) => id !== draggingId);
  return Math.max(0, Math.min(targetIndex, without.length));
}
