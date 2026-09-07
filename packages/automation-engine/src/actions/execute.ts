import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { randomUUID } from 'node:crypto';
import { sha256Canonical } from '../hash';

export async function executeClassAAction(
  db: Kysely<Database>,
  opts: {
    tenantId: string;
    actionType: string;
    params: Record<string, unknown>;
    triggerPayload: Record<string, unknown>;
    idempotencyKey: string;
  },
): Promise<Record<string, unknown>> {
  if (opts.actionType === 'task.create') {
    const title = String(opts.params['title'] ?? 'Automation task');
    const assigneeId = String(opts.params['assignee_id'] ?? '');
    if (!assigneeId) throw new Error('task.create requires assignee_id');

    // Tenant check: assignee must belong to workspace === tenant
    const user = await db
      .selectFrom('users')
      .select(['id', 'workspace_id'])
      .where('id', '=', assigneeId)
      .executeTakeFirst();
    if (!user || user.workspace_id !== opts.tenantId) {
      throw new Error('TENANT_ISOLATION:assignee');
    }

    const id = randomUUID();
    await db
      .insertInto('tasks')
      .values({
        id,
        workspace_id: opts.tenantId,
        assignee_id: assigneeId,
        title,
        status: 'todo',
        contact_id: opts.params['contact_id'] ? String(opts.params['contact_id']) : null,
        record_id: opts.params['record_id'] ? String(opts.params['record_id']) : null,
      })
      .execute();

    return { task_id: id, idempotency_key: opts.idempotencyKey };
  }

  if (opts.actionType === 'notification.internal') {
    const userId = String(opts.params['user_id'] ?? '');
    if (!userId) throw new Error('notification.internal requires user_id');
    const user = await db
      .selectFrom('users')
      .select(['id', 'workspace_id'])
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!user || user.workspace_id !== opts.tenantId) {
      throw new Error('TENANT_ISOLATION:user');
    }

    const title = String(opts.params['title'] ?? 'Automation notification');
    const body = String(opts.params['body'] ?? '');
    const id = randomUUID();
    await db
      .insertInto('notifications')
      .values({
        id,
        workspace_id: opts.tenantId,
        user_id: userId,
        type: 'automation',
        title,
        body,
        read: false,
        resource_type: 'automation',
        resource_id: opts.idempotencyKey,
        delivery_key: opts.idempotencyKey,
      })
      .execute();

    return { notification_id: id, idempotency_key: opts.idempotencyKey };
  }

  throw new Error(`UNKNOWN_CLASS_A:${opts.actionType}`);
}

/**
 * Class B Round 1 stub — proves snapshot binding. No payments/Voice/WhatsApp/external calls.
 */
export async function executeCriticalStub(opts: {
  tenantId: string;
  approvalId: string;
  snapshot: Record<string, unknown>;
  payloadHash: string;
}): Promise<Record<string, unknown>> {
  const executedHash = sha256Canonical(opts.snapshot);
  if (executedHash !== opts.payloadHash) {
    throw new Error('PAYLOAD_HASH_MISMATCH');
  }
  return {
    stub: true,
    approval_id: opts.approvalId,
    tenant_id: opts.tenantId,
    executed_payload_hash: executedHash,
    executed_snapshot: opts.snapshot,
    note: 'critical.stub executed approved snapshot only',
  };
}
