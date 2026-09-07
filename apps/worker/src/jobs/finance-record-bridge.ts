/**
 * finance.record — notification fan-out only on worker.
 * Journal posting is performed in-domain TX (idempotent).
 * Does NOT call automation engines.
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { logger } from '../lib/logger';

async function recipientIds(db: Kysely<Database>, workspaceId: string): Promise<string[]> {
  try {
    const admins = await db
      .selectFrom('user_roles as ur')
      .innerJoin('roles as r', 'r.id', 'ur.role_id')
      .innerJoin('users as u', 'u.id', 'ur.user_id')
      .select('ur.user_id as id')
      .where('ur.workspace_id', '=', workspaceId)
      .where('r.grants_all', '=', true)
      .where('u.is_active', '=', true)
      .execute();
    if (admins.length > 0) return [...new Set(admins.map((a) => a.id))];
  } catch {
    /* role schema edge */
  }

  const all = await db
    .selectFrom('users')
    .select(['id'])
    .where('workspace_id', '=', workspaceId)
    .where('is_active', '=', true)
    .execute();
  return all.map((u) => u.id);
}

function mapEvent(eventType: string): { type: string; title: string; severity: string } | null {
  switch (eventType) {
    case 'finance.invoice.issued':
      return { type: 'finance.invoice.issued', title: 'Invoice issued', severity: 'info' };
    case 'finance.invoice.overdue':
      return { type: 'finance.invoice.overdue', title: 'Invoice overdue', severity: 'warning' };
    case 'finance.payment.received':
      return { type: 'finance.payment.received', title: 'Payment received', severity: 'info' };
    case 'finance.payment.refunded':
      return { type: 'finance.payment.refunded', title: 'Payment refunded', severity: 'warning' };
    case 'finance.credit_note.created':
      return { type: 'finance.credit_note.created', title: 'Credit note created', severity: 'info' };
    case 'finance.debit_note.created':
      return { type: 'finance.debit_note.created', title: 'Debit note created', severity: 'info' };
    case 'finance.expense.created':
      return { type: 'finance.expense.created', title: 'Expense recorded', severity: 'info' };
    default:
      return null;
  }
}

export async function handleFinanceRecordOnWorker(
  db: Kysely<Database>,
  payload: Record<string, unknown>,
  tenantId: string | null,
): Promise<void> {
  const eventType = String(payload['eventType'] ?? payload['type'] ?? '');
  const dataRaw =
    payload['data'] && typeof payload['data'] === 'object'
      ? (payload['data'] as Record<string, unknown>)
      : payload;
  const nested =
    dataRaw['data'] && typeof dataRaw['data'] === 'object'
      ? (dataRaw['data'] as Record<string, unknown>)
      : dataRaw;
  const workspaceId = String(
    nested['workspace_id'] ?? dataRaw['workspace_id'] ?? tenantId ?? '',
  );
  const mapped = mapEvent(eventType);
  if (!workspaceId || !mapped) {
    logger.info({ eventType, workspaceId }, 'finance.record skip notify');
    return;
  }

  const users = await recipientIds(db, workspaceId);
  const resourceId = String(
    nested['invoice_id'] ??
      nested['payment_id'] ??
      nested['credit_note_id'] ??
      nested['debit_note_id'] ??
      nested['expense_id'] ??
      payload['aggregateId'] ??
      '',
  );
  const bodyBits = [
    nested['invoice_number'] ?? nested['payment_number'] ?? nested['expense_number'] ?? '',
    nested['amount'] ?? nested['total'] ?? '',
  ]
    .filter(Boolean)
    .join(' · ');

  for (const userId of users) {
    const deliveryKey = `${workspaceId}:${mapped.type}:${resourceId || 'x'}:${userId}:in_app`;
    try {
      await db
        .insertInto('notifications')
        .values({
          workspace_id: workspaceId,
          user_id: userId,
          type: mapped.type,
          title: mapped.title,
          body: bodyBits || mapped.title,
          resource_type: eventType.split('.')[1] ?? 'finance',
          resource_id: resourceId || null,
          severity: mapped.severity,
          delivery_key: deliveryKey,
        })
        .execute();
    } catch {
      // Duplicate delivery_key or pre-migration — skip
    }
  }

  logger.info(
    { workspaceId, eventType, recipients: users.length },
    'finance.record notifications written',
  );
}
