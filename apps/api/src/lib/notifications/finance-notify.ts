/**
 * Finance → notification bus fan-out (NOT automation).
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { deliverNotification } from './bus';
import { NOTIFICATION_EVENT_TYPES } from './catalog';
import { logger } from '../logger';

async function resolveRecipients(
  db: Kysely<Database>,
  workspaceId: string,
  preferredUserIds: Array<string | null | undefined>,
): Promise<string[]> {
  const preferred = [...new Set(preferredUserIds.filter((id): id is string => Boolean(id)))];
  if (preferred.length > 0) {
    const rows = await db
      .selectFrom('users')
      .select(['id'])
      .where('workspace_id', '=', workspaceId)
      .where('is_active', '=', true)
      .where('id', 'in', preferred)
      .execute();
    if (rows.length > 0) return rows.map((r) => r.id);
  }

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

  // MVP fallback: all active users
  const all = await db
    .selectFrom('users')
    .select(['id'])
    .where('workspace_id', '=', workspaceId)
    .where('is_active', '=', true)
    .execute();
  return all.map((u) => u.id);
}

function titleFor(eventType: string, data: Record<string, unknown>): string {
  const num = String(data['invoice_number'] ?? data['quote_number'] ?? data['payment_number'] ?? '');
  switch (eventType) {
    case NOTIFICATION_EVENT_TYPES.INVOICE_ISSUED:
      return num ? `Invoice ${num} issued` : 'Invoice issued';
    case NOTIFICATION_EVENT_TYPES.INVOICE_DUE:
      return num ? `Invoice ${num} due soon` : 'Invoice due soon';
    case NOTIFICATION_EVENT_TYPES.INVOICE_OVERDUE:
      return num ? `Invoice ${num} overdue` : 'Invoice overdue';
    case NOTIFICATION_EVENT_TYPES.PAYMENT_RECEIVED:
      return num ? `Payment ${num} received` : 'Payment received';
    case NOTIFICATION_EVENT_TYPES.PAYMENT_REFUNDED:
      return 'Payment refunded';
    case NOTIFICATION_EVENT_TYPES.QUOTE_SENT:
      return num ? `Quote ${num} sent` : 'Quote sent';
    case NOTIFICATION_EVENT_TYPES.QUOTE_ACCEPTED:
      return num ? `Quote ${num} accepted` : 'Quote accepted';
    case NOTIFICATION_EVENT_TYPES.QUOTE_EXPIRING:
      return num ? `Quote ${num} expiring` : 'Quote expiring';
    default:
      return eventType;
  }
}

function bodyFor(eventType: string, data: Record<string, unknown>): string {
  const total = data['total'] != null ? String(data['total']) : null;
  const currency = data['currency'] != null ? String(data['currency']) : '';
  const amount = data['amount'] != null ? String(data['amount']) : total;
  const due = data['due_date'] != null ? String(data['due_date']) : null;
  const chunks: string[] = [];
  if (amount) chunks.push(`Amount: ${currency} ${amount}`.trim());
  if (due) chunks.push(`Due: ${due}`);
  if (data['party_name']) chunks.push(`Party: ${String(data['party_name'])}`);
  if (chunks.length === 0) return `Event: ${eventType}`;
  return chunks.join(' · ');
}

export async function handleFinanceNotificationEvent(
  db: Kysely<Database>,
  opts: {
    workspaceId: string;
    eventType: string;
    data: Record<string, unknown>;
  },
): Promise<{ notified: number }> {
  const { workspaceId, eventType, data } = opts;

  const supported = new Set<string>([
    NOTIFICATION_EVENT_TYPES.INVOICE_ISSUED,
    NOTIFICATION_EVENT_TYPES.INVOICE_DUE,
    NOTIFICATION_EVENT_TYPES.INVOICE_OVERDUE,
    NOTIFICATION_EVENT_TYPES.PAYMENT_RECEIVED,
    NOTIFICATION_EVENT_TYPES.PAYMENT_REFUNDED,
    NOTIFICATION_EVENT_TYPES.QUOTE_SENT,
    NOTIFICATION_EVENT_TYPES.QUOTE_ACCEPTED,
    NOTIFICATION_EVENT_TYPES.QUOTE_EXPIRING,
    // Accept domain event aliases from finance.events
    'finance.invoice.issued',
    'finance.invoice.overdue',
    'finance.payment.received',
    'finance.payment.refunded',
  ]);

  if (!supported.has(eventType)) {
    return { notified: 0 };
  }

  const resourceType = String(
    data['resource_type'] ??
      (eventType.includes('quote')
        ? 'quote'
        : eventType.includes('payment')
          ? 'payment'
          : 'invoice'),
  );
  const resourceId = String(
    data['resource_id'] ?? data['invoice_id'] ?? data['quote_id'] ?? data['payment_id'] ?? '',
  );

  let preferred: Array<string | null | undefined> = [
    data['owner_id'] as string | undefined,
    data['created_by'] as string | undefined,
    data['issued_by'] as string | undefined,
    data['received_by'] as string | undefined,
  ];

  // Prefer looking up invoice/quote owners when ids present
  if (data['invoice_id'] && typeof data['invoice_id'] === 'string') {
    const inv = await db
      .selectFrom('invoices')
      .select(['created_by', 'issued_by', 'invoice_number', 'total', 'currency', 'due_date'])
      .where('workspace_id', '=', workspaceId)
      .where('id', '=', data['invoice_id'])
      .executeTakeFirst();
    if (inv) {
      preferred = [...preferred, inv.created_by, inv.issued_by];
      data['invoice_number'] = data['invoice_number'] ?? inv.invoice_number;
      data['total'] = data['total'] ?? inv.total;
      data['currency'] = data['currency'] ?? inv.currency;
      data['due_date'] = data['due_date'] ?? inv.due_date;
    }
  }
  if (data['quote_id'] && typeof data['quote_id'] === 'string') {
    const q = await db
      .selectFrom('quotes')
      .select(['created_by', 'sent_by', 'quote_number', 'total', 'currency', 'expiry_date'])
      .where('workspace_id', '=', workspaceId)
      .where('id', '=', data['quote_id'])
      .executeTakeFirst();
    if (q) {
      preferred = [...preferred, q.created_by, q.sent_by];
      data['quote_number'] = data['quote_number'] ?? q.quote_number;
      data['total'] = data['total'] ?? q.total;
      data['currency'] = data['currency'] ?? q.currency;
    }
  }

  const recipients = await resolveRecipients(db, workspaceId, preferred);
  const title = titleFor(eventType, data);
  const body = bodyFor(eventType, data);
  const severity =
    eventType.includes('overdue') || eventType.includes('refunded') ? 'warning' : 'info';

  let notified = 0;
  for (const userId of recipients) {
    const baseKey = `${workspaceId}:${eventType}:${resourceId || 'na'}:${userId}`;
    for (const channel of ['in_app', 'email'] as const) {
      const result = await deliverNotification(db, {
        workspaceId,
        userId,
        eventType,
        title,
        body,
        channel,
        severity,
        resourceType,
        resourceId: resourceId || undefined,
        deliveryKey: `${baseKey}:${channel}`,
      });
      if (result.status === 'delivered') notified += 1;
    }
  }

  logger.info({ workspaceId, eventType, recipients: recipients.length, notified }, 'finance notify');
  return { notified };
}
