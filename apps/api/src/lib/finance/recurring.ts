/**
 * Recurring invoice schedules + idempotent generator (D3).
 */
import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import type { DbOrTx } from '@vencore/events';
import type { RecurringCadence } from '@vencore/db';
import { getCustomerParty } from '../customer-parties';
import { normalizeCurrency, DEFAULT_CURRENCY } from '../crm-money';
import type { LineInput } from './tax';
import { createInvoice } from './invoices';

export type RecurringFail = 'not_found' | 'validation' | 'party_invalid' | 'inactive';

function advanceDate(from: Date, cadence: RecurringCadence): Date {
  const d = new Date(from);
  switch (cadence) {
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'quarterly':
      d.setMonth(d.getMonth() + 3);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d;
}

function periodKeyFor(runAt: Date, cadence: RecurringCadence): string {
  const y = runAt.getUTCFullYear();
  const m = String(runAt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(runAt.getUTCDate()).padStart(2, '0');
  if (cadence === 'weekly') return `${y}-W${m}${d}`;
  if (cadence === 'yearly') return `${y}`;
  if (cadence === 'quarterly') return `${y}-Q${Math.floor(runAt.getUTCMonth() / 3) + 1}`;
  return `${y}-${m}`;
}

export async function getRecurringSchedule(db: DbOrTx, opts: { workspaceId: string; id: string }) {
  return (
    (await db
      .selectFrom('recurring_invoice_schedules')
      .selectAll()
      .where('id', '=', opts.id)
      .where('workspace_id', '=', opts.workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()) ?? null
  );
}

export async function createRecurringSchedule(
  db: DbOrTx,
  input: {
    workspaceId: string;
    createdBy?: string | null;
    customer_party_id: string;
    contact_id?: string | null;
    company_id?: string | null;
    cadence: RecurringCadence;
    next_run_at: string;
    currency?: string;
    place_of_supply?: string | null;
    payment_terms?: string | null;
    notes?: string | null;
    terms?: string | null;
    line_template: LineInput[];
  },
): Promise<
  | { ok: true; schedule: NonNullable<Awaited<ReturnType<typeof getRecurringSchedule>>> }
  | { ok: false; fail: RecurringFail }
> {
  const party = await getCustomerParty(db, { workspaceId: input.workspaceId, id: input.customer_party_id });
  if (!party || party.status === 'merged') return { ok: false, fail: 'party_invalid' };
  if (!input.line_template?.length) return { ok: false, fail: 'validation' };

  const id = randomUUID();
  await db
    .insertInto('recurring_invoice_schedules')
    .values({
      id,
      workspace_id: input.workspaceId,
      customer_party_id: party.id,
      contact_id: input.contact_id ?? null,
      company_id: input.company_id ?? null,
      status: 'active',
      cadence: input.cadence,
      next_run_at: new Date(input.next_run_at),
      currency: normalizeCurrency(input.currency ?? DEFAULT_CURRENCY),
      place_of_supply: input.place_of_supply ?? null,
      payment_terms: input.payment_terms ?? null,
      notes: input.notes ?? null,
      terms: input.terms ?? null,
      // node-pg maps JS arrays → PG arrays; jsonb columns need an explicit JSON string.
      line_template: sql`${JSON.stringify(input.line_template)}::jsonb`,
      party_snapshot: {
        customer_party_id: party.id,
        display_name: party.display_name,
        party_type: party.party_type,
      },
      metadata: {},
      created_by: input.createdBy ?? null,
    })
    .execute();

  const schedule = await getRecurringSchedule(db, { workspaceId: input.workspaceId, id });
  return { ok: true, schedule: schedule! };
}

/**
 * Generate due invoices for a workspace (or single schedule). Idempotent via (schedule_id, period_key).
 */
export async function generateDueRecurringInvoices(
  db: DbOrTx,
  opts: { workspaceId: string; scheduleId?: string; asOf?: Date; createdBy?: string | null },
): Promise<{ created: number; skipped: number; results: Array<{ schedule_id: string; period_key: string; invoice_id?: string; status: string }> }> {
  const asOf = opts.asOf ?? new Date();
  let q = db
    .selectFrom('recurring_invoice_schedules')
    .selectAll()
    .where('workspace_id', '=', opts.workspaceId)
    .where('deleted_at', 'is', null)
    .where('status', '=', 'active')
    .where('next_run_at', '<=', asOf);
  if (opts.scheduleId) q = q.where('id', '=', opts.scheduleId);
  const schedules = await q.execute();

  let created = 0;
  let skipped = 0;
  const results: Array<{ schedule_id: string; period_key: string; invoice_id?: string; status: string }> = [];

  for (const schedule of schedules) {
    const runAt = new Date(schedule.next_run_at);
    const periodKey = periodKeyFor(runAt, schedule.cadence);

    const existing = await db
      .selectFrom('recurring_invoice_runs')
      .selectAll()
      .where('schedule_id', '=', schedule.id)
      .where('period_key', '=', periodKey)
      .executeTakeFirst();

    if (existing) {
      skipped += 1;
      results.push({
        schedule_id: schedule.id,
        period_key: periodKey,
        invoice_id: existing.invoice_id ?? undefined,
        status: 'skipped',
      });
      // Still advance next_run_at if stuck
      const next = advanceDate(runAt, schedule.cadence);
      await db
        .updateTable('recurring_invoice_schedules')
        .set({ next_run_at: next, updated_at: new Date() })
        .where('id', '=', schedule.id)
        .execute();
      continue;
    }

    try {
      const inv = await createInvoice(db, {
        workspaceId: opts.workspaceId,
        createdBy: opts.createdBy ?? null,
        customer_party_id: schedule.customer_party_id,
        contact_id: schedule.contact_id,
        company_id: schedule.company_id,
        currency: schedule.currency,
        place_of_supply: schedule.place_of_supply,
        payment_terms: schedule.payment_terms,
        notes: schedule.notes,
        terms: schedule.terms,
        lines: schedule.line_template as LineInput[],
      });

      if (!inv.ok) {
        await db
          .insertInto('recurring_invoice_runs')
          .values({
            workspace_id: opts.workspaceId,
            schedule_id: schedule.id,
            period_key: periodKey,
            status: 'failed',
            error_message: inv.fail,
          })
          .execute();
        results.push({ schedule_id: schedule.id, period_key: periodKey, status: 'failed' });
        continue;
      }

      await db
        .insertInto('recurring_invoice_runs')
        .values({
          workspace_id: opts.workspaceId,
          schedule_id: schedule.id,
          period_key: periodKey,
          invoice_id: inv.invoice.id,
          status: 'created',
        })
        .execute();

      const next = advanceDate(runAt, schedule.cadence);
      await db
        .updateTable('recurring_invoice_schedules')
        .set({ next_run_at: next, updated_at: new Date() })
        .where('id', '=', schedule.id)
        .execute();

      created += 1;
      results.push({
        schedule_id: schedule.id,
        period_key: periodKey,
        invoice_id: inv.invoice.id,
        status: 'created',
      });
    } catch (e: unknown) {
      // Unique violation on (schedule_id, period_key) → idempotent skip
      const msg = e instanceof Error ? e.message : String(e);
      if (/unique|duplicate/i.test(msg)) {
        skipped += 1;
        results.push({ schedule_id: schedule.id, period_key: periodKey, status: 'skipped' });
        continue;
      }
      await db
        .insertInto('recurring_invoice_runs')
        .values({
          workspace_id: opts.workspaceId,
          schedule_id: schedule.id,
          period_key: periodKey,
          status: 'failed',
          error_message: msg.slice(0, 500),
        })
        .onConflict((oc) => oc.columns(['schedule_id', 'period_key']).doNothing())
        .execute();
      results.push({ schedule_id: schedule.id, period_key: periodKey, status: 'failed' });
    }
  }

  return { created, skipped, results };
}
