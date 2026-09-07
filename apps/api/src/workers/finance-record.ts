/**
 * finance.record outbox consumer — posting catch-up + notifications.
 * Lives in API so worker can avoid cross-package domain imports; registered on worker
 * via relative import from apps/worker → apps/api (same monorepo).
 * Does NOT invoke automation engines.
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { handleFinancePostingEvent } from '../lib/accounting/posting';
import { handleFinanceNotificationEvent } from '../lib/notifications/finance-notify';
import { logger } from '../lib/logger';

export async function runFinanceRecordJob(
  db: Kysely<Database>,
  payload: Record<string, unknown>,
  tenantId: string | null,
): Promise<void> {
  const eventType = String(payload['eventType'] ?? payload['type'] ?? '');
  const dataRaw =
    payload['data'] && typeof payload['data'] === 'object'
      ? (payload['data'] as Record<string, unknown>)
      : payload;
  const nestedData =
    dataRaw['data'] && typeof dataRaw['data'] === 'object'
      ? (dataRaw['data'] as Record<string, unknown>)
      : dataRaw;
  const workspaceId = String(
    nestedData['workspace_id'] ?? dataRaw['workspace_id'] ?? dataRaw['tenant_id'] ?? tenantId ?? '',
  );
  if (!workspaceId || !eventType) {
    logger.warn({ eventType, workspaceId }, 'finance.record missing workspace or eventType');
    return;
  }

  try {
    await handleFinancePostingEvent(db, {
      workspaceId,
      eventType,
      data: {
        ...nestedData,
        aggregate_id: payload['aggregateId'] ?? nestedData['aggregate_id'],
      },
    });
  } catch (err) {
    logger.error({ err, eventType, workspaceId }, 'finance.record posting failed');
    throw err;
  }

  try {
    await handleFinanceNotificationEvent(db, {
      workspaceId,
      eventType,
      data: nestedData,
    });
  } catch (err) {
    logger.error({ err, eventType, workspaceId }, 'finance.record notify failed');
  }
}
