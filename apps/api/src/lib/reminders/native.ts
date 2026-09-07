/**
 * Native scheduled reminders — scans due/overdue resources and notifies via bus.
 * NOT automation (no workflow runs / automation approvals).
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { deliverNotification } from '../notifications/bus';
import { NOTIFICATION_EVENT_TYPES } from '../notifications/catalog';
import { logger } from '../logger';

async function claimFire(
  db: Kysely<Database>,
  opts: {
    workspaceId: string;
    reminderType: string;
    resourceType: string;
    resourceId: string;
    fireKey: string;
  },
): Promise<boolean> {
  try {
    await db
      .insertInto('reminder_runs')
      .values({
        workspace_id: opts.workspaceId,
        reminder_type: opts.reminderType,
        resource_type: opts.resourceType,
        resource_id: opts.resourceId,
        fire_key: opts.fireKey,
      })
      .execute();
    return true;
  } catch {
    return false; // unique fire_key → already fired
  }
}

async function notifyUsers(
  db: Kysely<Database>,
  opts: {
    workspaceId: string;
    userIds: string[];
    eventType: string;
    title: string;
    body: string;
    resourceType: string;
    resourceId: string;
    fireKey: string;
    severity?: 'info' | 'warning' | 'critical';
  },
): Promise<number> {
  let n = 0;
  for (const userId of opts.userIds) {
    for (const channel of ['in_app', 'email'] as const) {
      const r = await deliverNotification(db, {
        workspaceId: opts.workspaceId,
        userId,
        eventType: opts.eventType,
        title: opts.title,
        body: opts.body,
        channel,
        severity: opts.severity ?? 'info',
        resourceType: opts.resourceType,
        resourceId: opts.resourceId,
        deliveryKey: `${opts.fireKey}:${userId}:${channel}`,
      });
      if (r.status === 'delivered') n += 1;
    }
  }
  return n;
}

function dayBounds(d: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export async function runNativeReminders(
  db: Kysely<Database>,
): Promise<{ fired: number; notified: number }> {
  let fired = 0;
  let notified = 0;
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowBounds = dayBounds(tomorrow);
  const todayBounds = dayBounds(now);

  // ── Invoices due tomorrow ──────────────────────────────────────────
  const dueTomorrow = await db
    .selectFrom('invoices')
    .select(['id', 'workspace_id', 'invoice_number', 'due_date', 'created_by', 'issued_by', 'total', 'currency'])
    .where('deleted_at', 'is', null)
    .where('status', 'in', ['issued', 'partially_paid', 'overdue'])
    .where('due_date', '>=', tomorrowBounds.start)
    .where('due_date', '<', tomorrowBounds.end)
    .execute();

  for (const inv of dueTomorrow) {
    const fireKey = `invoice.due:${inv.id}:${tomorrowBounds.start.toISOString().slice(0, 10)}`;
    const claimed = await claimFire(db, {
      workspaceId: inv.workspace_id,
      reminderType: 'invoice.due',
      resourceType: 'invoice',
      resourceId: inv.id,
      fireKey,
    });
    if (!claimed) continue;
    fired += 1;
    const users = [inv.created_by, inv.issued_by].filter((x): x is string => Boolean(x));
    const recipients =
      users.length > 0
        ? users
        : (
            await db
              .selectFrom('users')
              .select(['id'])
              .where('workspace_id', '=', inv.workspace_id)
              .where('is_active', '=', true)
              .execute()
          ).map((u) => u.id);
    notified += await notifyUsers(db, {
      workspaceId: inv.workspace_id,
      userIds: [...new Set(recipients)],
      eventType: NOTIFICATION_EVENT_TYPES.INVOICE_DUE,
      title: `Invoice ${inv.invoice_number} due tomorrow`,
      body: `Amount ${inv.currency} ${inv.total} is due ${inv.due_date?.toISOString().slice(0, 10) ?? 'soon'}.`,
      resourceType: 'invoice',
      resourceId: inv.id,
      fireKey,
      severity: 'warning',
    });
  }

  // ── Invoices overdue ───────────────────────────────────────────────
  const overdue = await db
    .selectFrom('invoices')
    .select(['id', 'workspace_id', 'invoice_number', 'due_date', 'created_by', 'issued_by', 'total', 'currency', 'status'])
    .where('deleted_at', 'is', null)
    .where((eb) =>
      eb.or([
        eb('status', '=', 'overdue'),
        eb.and([
          eb('status', 'in', ['issued', 'partially_paid']),
          eb('due_date', '<', todayBounds.start),
        ]),
      ]),
    )
    .execute();

  for (const inv of overdue) {
    const dayKey = todayBounds.start.toISOString().slice(0, 10);
    const fireKey = `invoice.overdue:${inv.id}:${dayKey}`;
    const claimed = await claimFire(db, {
      workspaceId: inv.workspace_id,
      reminderType: 'invoice.overdue',
      resourceType: 'invoice',
      resourceId: inv.id,
      fireKey,
    });
    if (!claimed) continue;
    fired += 1;
    const users = [inv.created_by, inv.issued_by].filter((x): x is string => Boolean(x));
    const recipients =
      users.length > 0
        ? users
        : (
            await db
              .selectFrom('users')
              .select(['id'])
              .where('workspace_id', '=', inv.workspace_id)
              .where('is_active', '=', true)
              .execute()
          ).map((u) => u.id);
    notified += await notifyUsers(db, {
      workspaceId: inv.workspace_id,
      userIds: [...new Set(recipients)],
      eventType: NOTIFICATION_EVENT_TYPES.INVOICE_OVERDUE,
      title: `Invoice ${inv.invoice_number} overdue`,
      body: `Amount ${inv.currency} ${inv.total} was due ${inv.due_date?.toISOString().slice(0, 10) ?? 'earlier'}.`,
      resourceType: 'invoice',
      resourceId: inv.id,
      fireKey,
      severity: 'critical',
    });
  }

  // ── CRM tasks due today ────────────────────────────────────────────
  const tasksDue = await db
    .selectFrom('tasks')
    .select(['id', 'workspace_id', 'title', 'assignee_id', 'due_date'])
    .where('status', '=', 'todo')
    .where('due_date', '>=', todayBounds.start)
    .where('due_date', '<', todayBounds.end)
    .execute();

  for (const task of tasksDue) {
    const fireKey = `task.due:${task.id}:${todayBounds.start.toISOString().slice(0, 10)}`;
    const claimed = await claimFire(db, {
      workspaceId: task.workspace_id,
      reminderType: 'task.due',
      resourceType: 'task',
      resourceId: task.id,
      fireKey,
    });
    if (!claimed) continue;
    fired += 1;
    notified += await notifyUsers(db, {
      workspaceId: task.workspace_id,
      userIds: [task.assignee_id],
      eventType: NOTIFICATION_EVENT_TYPES.TASK_DUE,
      title: `Task due: ${task.title}`,
      body: `Due today.`,
      resourceType: 'task',
      resourceId: task.id,
      fireKey,
    });
  }

  // ── Quotes expiring within 3 days ──────────────────────────────────
  const expireEnd = new Date(todayBounds.start);
  expireEnd.setUTCDate(expireEnd.getUTCDate() + 3);
  const quotes = await db
    .selectFrom('quotes')
    .select(['id', 'workspace_id', 'quote_number', 'expiry_date', 'created_by', 'sent_by', 'total', 'currency'])
    .where('deleted_at', 'is', null)
    .where('status', 'in', ['sent', 'viewed'])
    .where('expiry_date', '>=', todayBounds.start)
    .where('expiry_date', '<', expireEnd)
    .execute();

  for (const q of quotes) {
    const dayKey = q.expiry_date
      ? new Date(q.expiry_date).toISOString().slice(0, 10)
      : todayBounds.start.toISOString().slice(0, 10);
    const fireKey = `quote.expiring:${q.id}:${dayKey}`;
    const claimed = await claimFire(db, {
      workspaceId: q.workspace_id,
      reminderType: 'quote.expiring',
      resourceType: 'quote',
      resourceId: q.id,
      fireKey,
    });
    if (!claimed) continue;
    fired += 1;
    const users = [q.created_by, q.sent_by].filter((x): x is string => Boolean(x));
    const recipients =
      users.length > 0
        ? users
        : (
            await db
              .selectFrom('users')
              .select(['id'])
              .where('workspace_id', '=', q.workspace_id)
              .where('is_active', '=', true)
              .execute()
          ).map((u) => u.id);
    notified += await notifyUsers(db, {
      workspaceId: q.workspace_id,
      userIds: [...new Set(recipients)],
      eventType: NOTIFICATION_EVENT_TYPES.QUOTE_EXPIRING,
      title: `Quote ${q.quote_number} expiring`,
      body: `Expires ${dayKey}. Total ${q.currency} ${q.total}.`,
      resourceType: 'quote',
      resourceId: q.id,
      fireKey,
      severity: 'warning',
    });
  }

  logger.info({ fired, notified }, 'native reminders run complete');
  const meeting = await runMeetingReminders(db);
  return { fired: fired + meeting.fired, notified: notified + meeting.notified };
}

/** Meeting reminders: T-24h, T-2h, T-30m relative to start_at (UTC instant). */
export async function runMeetingReminders(
  db: Kysely<Database>,
): Promise<{ fired: number; notified: number }> {
  let fired = 0;
  let notified = 0;
  const now = new Date();
  const offsets: Array<{ key: string; ms: number }> = [
    { key: 'T-24h', ms: 24 * 60 * 60 * 1000 },
    { key: 'T-2h', ms: 2 * 60 * 60 * 1000 },
    { key: 'T-30m', ms: 30 * 60 * 1000 },
  ];

  const meetings = await db
    .selectFrom('tasks')
    .select(['id', 'workspace_id', 'title', 'assignee_id', 'start_at', 'timezone', 'meeting_mode'])
    .where('scheduling_mode', '=', 'time_bound')
    .where('start_at', 'is not', null)
    .where('status', 'in', ['todo', 'open', 'in_progress'])
    .where('start_at', '>', now)
    .where('start_at', '<', new Date(now.getTime() + 25 * 60 * 60 * 1000))
    .execute();

  for (const m of meetings) {
    if (!m.start_at || !m.assignee_id) continue;
    const startMs = new Date(m.start_at).getTime();
    for (const off of offsets) {
      const fireAt = startMs - off.ms;
      if (now.getTime() < fireAt) continue;
      if (now.getTime() > startMs) continue;
      const fireKey = `meeting.remind:${m.id}:${off.key}`;
      const claimed = await claimFire(db, {
        workspaceId: m.workspace_id,
        reminderType: 'meeting.remind',
        resourceType: 'task',
        resourceId: m.id,
        fireKey,
      });
      if (!claimed) continue;
      fired += 1;
      const tz = m.timezone ? ` (${m.timezone})` : '';
      notified += await notifyUsers(db, {
        workspaceId: m.workspace_id,
        userIds: [m.assignee_id],
        eventType: NOTIFICATION_EVENT_TYPES.TASK_DUE,
        title: `Meeting reminder (${off.key}): ${m.title}`,
        body: `Starts ${new Date(m.start_at).toISOString()}${tz}${m.meeting_mode ? ` · ${m.meeting_mode}` : ''}`,
        resourceType: 'task',
        resourceId: m.id,
        fireKey,
        severity: 'info',
      });
    }
  }

  return { fired, notified };
}
