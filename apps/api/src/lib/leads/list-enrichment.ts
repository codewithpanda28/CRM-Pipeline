import { sql, type Kysely } from 'kysely';
import type { Database } from '@vencore/db';

export type LeadNextTask = {
  id: string;
  title: string;
  due_at: string | null;
  due: string | null;
  priority: string;
};

export type LeadLinkedDeal = {
  id: string;
  name: string;
  stage_id: string;
  stage_name: string | null;
  stage_color: string | null;
  pipeline_id: string;
  status: string;
};

const OPEN_TASK_STATUSES = ['todo', 'open', 'in_progress'] as const;

function toIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function effectiveTaskDueMs(row: {
  due_at: Date | null;
  due_date: Date | null;
  start_at: Date | null;
}): number {
  const candidates = [row.due_at, row.due_date, row.start_at]
    .map((v) => (v ? new Date(v).getTime() : Number.POSITIVE_INFINITY))
    .filter((n) => Number.isFinite(n));
  return candidates.length ? Math.min(...candidates) : Number.POSITIVE_INFINITY;
}

/**
 * Enrich lead list rows with next open CRM task + linked deal/stage.
 * Link resolution (no new schema): leads.deal_id → conversion link deal →
 * deals.custom_fields.lead_id (POST /deals lineage).
 */
export async function enrichLeadsList<T extends { id: string; deal_id: string | null }>(
  db: Kysely<Database>,
  workspaceId: string,
  leads: T[],
): Promise<
  Array<
    T & {
      next_task: LeadNextTask | null;
      deal: LeadLinkedDeal | null;
      pipeline_stage: { id: string; name: string; color: string | null } | null;
    }
  >
> {
  if (leads.length === 0) return [];

  const leadIds = leads.map((l) => l.id);
  const nextTaskByLead = new Map<string, LeadNextTask>();
  const dealIdByLead = new Map<string, string>();

  for (const lead of leads) {
    if (lead.deal_id) dealIdByLead.set(lead.id, lead.deal_id);
  }

  const [taskRows, conversionLinks, customFieldDeals] = await Promise.all([
    db
      .selectFrom('tasks')
      .select(['id', 'title', 'due_at', 'due_date', 'priority', 'related_lead_id', 'start_at'])
      .where('workspace_id', '=', workspaceId)
      .where('related_lead_id', 'in', leadIds)
      .where('status', 'in', [...OPEN_TASK_STATUSES])
      .execute(),
    db
      .selectFrom('lead_conversion_links')
      .select(['lead_id', 'entity_id'])
      .where('workspace_id', '=', workspaceId)
      .where('lead_id', 'in', leadIds)
      .where('entity_type', '=', 'deal')
      .execute(),
    db
      .selectFrom('deals')
      .select(['id', 'custom_fields'])
      .where('workspace_id', '=', workspaceId)
      .where('deleted_at', 'is', null)
      .where(sql<boolean>`custom_fields->>'lead_id' is not null`)
      .where(sql<boolean>`custom_fields->>'lead_id' in (${sql.join(
        leadIds.map((id) => sql`${id}`),
      )})`)
      .execute(),
  ]);

  const tasksByLead = new Map<string, typeof taskRows>();
  for (const t of taskRows) {
    if (!t.related_lead_id) continue;
    const list = tasksByLead.get(t.related_lead_id) ?? [];
    list.push(t);
    tasksByLead.set(t.related_lead_id, list);
  }
  for (const [leadId, list] of tasksByLead) {
    list.sort((a, b) => effectiveTaskDueMs(a) - effectiveTaskDueMs(b) || a.id.localeCompare(b.id));
    const best = list[0];
    if (!best) continue;
    const dueIso = toIso(best.due_at ?? best.due_date);
    nextTaskByLead.set(leadId, {
      id: best.id,
      title: best.title,
      due_at: dueIso,
      due: dueIso,
      priority: best.priority,
    });
  }

  for (const link of conversionLinks) {
    if (!dealIdByLead.has(link.lead_id)) {
      dealIdByLead.set(link.lead_id, link.entity_id);
    }
  }
  for (const deal of customFieldDeals) {
    const cf = deal.custom_fields as Record<string, unknown> | null;
    const leadId = typeof cf?.['lead_id'] === 'string' ? cf['lead_id'] : null;
    if (leadId && !dealIdByLead.has(leadId)) {
      dealIdByLead.set(leadId, deal.id);
    }
  }

  const dealIds = [...new Set(dealIdByLead.values())];
  const dealById = new Map<string, LeadLinkedDeal>();

  if (dealIds.length > 0) {
    const deals = await db
      .selectFrom('deals as d')
      .leftJoin('pipeline_stages as s', 's.id', 'd.stage_id')
      .select([
        'd.id',
        'd.name',
        'd.stage_id',
        'd.pipeline_id',
        'd.status',
        's.name as stage_name',
        's.color as stage_color',
      ])
      .where('d.workspace_id', '=', workspaceId)
      .where('d.deleted_at', 'is', null)
      .where('d.id', 'in', dealIds)
      .execute();

    for (const d of deals) {
      dealById.set(d.id, {
        id: d.id,
        name: d.name,
        stage_id: d.stage_id,
        stage_name: d.stage_name ?? null,
        stage_color: d.stage_color ?? null,
        pipeline_id: d.pipeline_id,
        status: d.status,
      });
    }
  }

  return leads.map((lead) => {
    const dealId = dealIdByLead.get(lead.id) ?? null;
    const deal = dealId ? dealById.get(dealId) ?? null : null;
    return {
      ...lead,
      next_task: nextTaskByLead.get(lead.id) ?? null,
      deal,
      pipeline_stage: deal
        ? { id: deal.stage_id, name: deal.stage_name ?? 'Stage', color: deal.stage_color }
        : null,
    };
  });
}
