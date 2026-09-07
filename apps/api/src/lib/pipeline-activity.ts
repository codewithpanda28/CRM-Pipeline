import type { Kysely, Transaction } from 'kysely';
import type { Database } from '@vencore/db';
import { isTransaction } from '@vencore/events';
import { logActivity } from './log-activity';

type DbOrTx = Kysely<Database> | Transaction<Database>;

interface LogStageChangedParams {
  db: DbOrTx;
  itemId: string;
  pipelineId: string;
  workspaceId: string;
  userId: string | null;
  fromStageId: string;
  toStageId: string;
}

export async function logStageChanged(p: LogStageChangedParams) {
  await p.db.insertInto('pipeline_activity').values({
    item_id: p.itemId,
    pipeline_id: p.pipelineId,
    workspace_id: p.workspaceId,
    user_id: p.userId,
    event_type: 'stage_changed',
    payload: { from_stage_id: p.fromStageId, to_stage_id: p.toStageId } as any,
  }).execute();

  // Legacy activities.record_id FK still points at pipeline_records. Never run that
  // insert on the caller's transaction — a FK failure would abort Deal dual-write.
  if (!isTransaction(p.db)) {
    void logActivity(p.db, {
      workspace_id: p.workspaceId,
      user_id: p.userId ?? null,
      type: 'deal_change',
      source_module_id: 'crm',
      record_id: p.itemId,
      meta: { from_stage_id: p.fromStageId, to_stage_id: p.toStageId },
    });
  }
}

interface LogFieldChangedParams {
  db: DbOrTx;
  itemId: string;
  pipelineId: string;
  workspaceId: string;
  userId: string | null;
  fieldKey: string;
  oldValue: unknown;
  newValue: unknown;
}

export async function logFieldChanged(p: LogFieldChangedParams) {
  await p.db.insertInto('pipeline_activity').values({
    item_id: p.itemId,
    pipeline_id: p.pipelineId,
    workspace_id: p.workspaceId,
    user_id: p.userId,
    event_type: 'field_changed',
    payload: { field_key: p.fieldKey, old_value: p.oldValue, new_value: p.newValue } as any,
  }).execute();
}

interface LogItemCreatedParams {
  db: DbOrTx;
  itemId: string;
  pipelineId: string;
  workspaceId: string;
  userId: string | null;
}

export async function logItemCreated(p: LogItemCreatedParams) {
  await p.db.insertInto('pipeline_activity').values({
    item_id: p.itemId,
    pipeline_id: p.pipelineId,
    workspace_id: p.workspaceId,
    user_id: p.userId,
    event_type: 'item_created',
    payload: {} as any,
  }).execute();
}
