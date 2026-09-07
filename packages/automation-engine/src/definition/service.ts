import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { EventRecorder } from '@vencore/events';
import { schemaHashForGraph } from '../hash';
import { assertPublishableAction, getActionClass } from '../actions/registry';

export interface WorkflowGraph {
  trigger?: { event_name: string; filter?: Record<string, unknown> | null };
  nodes: Array<{
    id: string;
    type: 'trigger' | 'condition' | 'branch' | 'delay' | 'approval' | 'action';
    config?: Record<string, unknown>;
  }>;
  edges: Array<{ from: string; to: string; when?: string }>;
}

function asGraph(raw: Record<string, unknown>): WorkflowGraph {
  return {
    trigger: raw['trigger'] as WorkflowGraph['trigger'],
    nodes: (raw['nodes'] as WorkflowGraph['nodes']) ?? [],
    edges: (raw['edges'] as WorkflowGraph['edges']) ?? [],
  };
}

function validateGraphForPublish(graph: WorkflowGraph): void {
  for (const node of graph.nodes) {
    if (node.type === 'action' || node.type === 'approval') {
      const actionType = String(node.config?.['action_type'] ?? '');
      if (!actionType) throw new Error(`MISSING_ACTION_TYPE:${node.id}`);
      assertPublishableAction(actionType);
      if (node.type === 'action' && getActionClass(actionType) === 'B') {
        // Class B action nodes must go through approval step type in R1
        // Allow if node.type === 'approval' OR graph has preceding approval — R1: require approval node type for B
        throw new Error(`CLASS_B_REQUIRES_APPROVAL_STEP:${node.id}`);
      }
    }
  }
  if (!graph.trigger?.event_name) throw new Error('MISSING_TRIGGER_EVENT');
}

export class WorkflowDefinitionService {
  constructor(private readonly db: Kysely<Database>) {}

  async createDraft(opts: {
    tenantId: string;
    name: string;
    description?: string;
    createdBy?: string;
    graph?: Record<string, unknown>;
  }) {
    const workflowId = randomUUID();
    const versionId = randomUUID();
    const graph = opts.graph ?? { nodes: [], edges: [], trigger: { event_name: '' } };
    const hash = schemaHashForGraph(graph);

    await this.db
      .insertInto('workflows')
      .values({
        id: workflowId,
        tenant_id: opts.tenantId,
        name: opts.name,
        description: opts.description ?? null,
        status: 'draft',
        created_by: opts.createdBy ?? null,
      })
      .execute();

    await this.db
      .insertInto('workflow_versions')
      .values({
        id: versionId,
        tenant_id: opts.tenantId,
        workflow_id: workflowId,
        version_number: 1,
        state: 'draft',
        graph,
        schema_hash: hash,
      })
      .execute();

    await this.db
      .updateTable('workflows')
      .set({ current_draft_version_id: versionId, updated_at: new Date() })
      .where('id', '=', workflowId)
      .execute();

    await this.audit(opts.tenantId, opts.createdBy ?? null, 'automation.workflow.draft_created', workflowId, {
      version_id: versionId,
    });

    return this.get(opts.tenantId, workflowId);
  }

  async updateDraft(opts: {
    tenantId: string;
    workflowId: string;
    graph: Record<string, unknown>;
    actorId?: string;
  }) {
    const wf = await this.requireWorkflow(opts.tenantId, opts.workflowId);
    if (!wf.current_draft_version_id) throw new Error('NO_DRAFT_VERSION');

    const ver = await this.db
      .selectFrom('workflow_versions')
      .selectAll()
      .where('id', '=', wf.current_draft_version_id)
      .where('tenant_id', '=', opts.tenantId)
      .executeTakeFirstOrThrow();

    if (ver.state !== 'draft') throw new Error('VERSION_NOT_DRAFT');

    const hash = schemaHashForGraph(opts.graph);
    await this.db
      .updateTable('workflow_versions')
      .set({ graph: opts.graph, schema_hash: hash })
      .where('id', '=', ver.id)
      .where('state', '=', 'draft')
      .execute();

    await this.db
      .updateTable('workflows')
      .set({ updated_at: new Date() })
      .where('id', '=', opts.workflowId)
      .execute();

    await this.audit(opts.tenantId, opts.actorId ?? null, 'automation.workflow.draft_updated', opts.workflowId, {
      version_id: ver.id,
      schema_hash: hash,
    });

    return this.get(opts.tenantId, opts.workflowId);
  }

  async publish(opts: { tenantId: string; workflowId: string; actorId: string }) {
    const wf = await this.requireWorkflow(opts.tenantId, opts.workflowId);
    if (!wf.current_draft_version_id) throw new Error('NO_DRAFT_VERSION');

    const draft = await this.db
      .selectFrom('workflow_versions')
      .selectAll()
      .where('id', '=', wf.current_draft_version_id)
      .where('tenant_id', '=', opts.tenantId)
      .forUpdate()
      .executeTakeFirstOrThrow();

    if (draft.state !== 'draft') throw new Error('VERSION_NOT_DRAFT');
    const graph = asGraph(draft.graph as Record<string, unknown>);
    validateGraphForPublish(graph);

    // Supersede prior published
    if (wf.current_published_version_id) {
      await this.db
        .updateTable('workflow_versions')
        .set({ state: 'superseded' })
        .where('id', '=', wf.current_published_version_id)
        .execute();
      await this.db
        .updateTable('workflow_triggers')
        .set({ is_active: false })
        .where('workflow_id', '=', opts.workflowId)
        .where('tenant_id', '=', opts.tenantId)
        .execute();
    }

    const now = new Date();
    await this.db
      .updateTable('workflow_versions')
      .set({
        state: 'published',
        published_at: now,
        published_by: opts.actorId,
        schema_hash: schemaHashForGraph(draft.graph as Record<string, unknown>),
      })
      .where('id', '=', draft.id)
      .execute();

    // New draft tip for further edits (copy)
    const newDraftId = randomUUID();
    await this.db
      .insertInto('workflow_versions')
      .values({
        id: newDraftId,
        tenant_id: opts.tenantId,
        workflow_id: opts.workflowId,
        version_number: draft.version_number + 1,
        state: 'draft',
        graph: draft.graph as Record<string, unknown>,
        schema_hash: draft.schema_hash,
      })
      .execute();

    await this.db
      .updateTable('workflows')
      .set({
        status: 'published',
        current_published_version_id: draft.id,
        current_draft_version_id: newDraftId,
        updated_at: now,
      })
      .where('id', '=', opts.workflowId)
      .execute();

    const triggerId = randomUUID();
    await this.db
      .insertInto('workflow_triggers')
      .values({
        id: triggerId,
        tenant_id: opts.tenantId,
        workflow_id: opts.workflowId,
        workflow_version_id: draft.id,
        event_name: graph.trigger!.event_name,
        filter: graph.trigger!.filter ?? null,
        is_active: true,
      })
      .execute();

    const recorder = new EventRecorder(this.db);
    await recorder.append({
      tenantId: opts.tenantId,
      eventType: 'automation.workflow.published',
      aggregateType: 'workflow',
      aggregateId: opts.workflowId,
      dedupeKey: `automation:workflow:published:${draft.id}`,
      payload: {
        workflow_id: opts.workflowId,
        version_id: draft.id,
        event_name: graph.trigger!.event_name,
      },
    });

    await this.audit(opts.tenantId, opts.actorId, 'automation.workflow.published', opts.workflowId, {
      version_id: draft.id,
      schema_hash: draft.schema_hash,
    });

    return this.get(opts.tenantId, opts.workflowId);
  }

  async archive(opts: { tenantId: string; workflowId: string; actorId: string }) {
    await this.requireWorkflow(opts.tenantId, opts.workflowId);
    await this.db
      .updateTable('workflow_triggers')
      .set({ is_active: false })
      .where('workflow_id', '=', opts.workflowId)
      .where('tenant_id', '=', opts.tenantId)
      .execute();
    await this.db
      .updateTable('workflows')
      .set({ status: 'archived', updated_at: new Date() })
      .where('id', '=', opts.workflowId)
      .where('tenant_id', '=', opts.tenantId)
      .execute();
    await this.audit(opts.tenantId, opts.actorId, 'automation.workflow.archived', opts.workflowId, {});
    return this.get(opts.tenantId, opts.workflowId);
  }

  /** Re-enable a previously published workflow (does not auto-publish drafts). */
  async enable(opts: { tenantId: string; workflowId: string; actorId: string }) {
    const wf = await this.requireWorkflow(opts.tenantId, opts.workflowId);
    if (!wf.current_published_version_id) throw new Error('NOT_PUBLISHED');
    await this.db
      .updateTable('workflow_triggers')
      .set({ is_active: true })
      .where('workflow_id', '=', opts.workflowId)
      .where('tenant_id', '=', opts.tenantId)
      .where('workflow_version_id', '=', wf.current_published_version_id)
      .execute();
    await this.db
      .updateTable('workflows')
      .set({ status: 'published', updated_at: new Date() })
      .where('id', '=', opts.workflowId)
      .where('tenant_id', '=', opts.tenantId)
      .execute();
    await this.audit(opts.tenantId, opts.actorId, 'automation.workflow.enabled', opts.workflowId, {});
    return this.get(opts.tenantId, opts.workflowId);
  }

  async get(tenantId: string, workflowId: string) {
    return this.db
      .selectFrom('workflows')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', workflowId)
      .executeTakeFirst();
  }

  async list(tenantId: string) {
    return this.db
      .selectFrom('workflows')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('updated_at', 'desc')
      .execute();
  }

  async getVersion(tenantId: string, versionId: string) {
    return this.db
      .selectFrom('workflow_versions')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', versionId)
      .executeTakeFirst();
  }

  private async requireWorkflow(tenantId: string, workflowId: string) {
    const wf = await this.get(tenantId, workflowId);
    if (!wf) throw new Error('WORKFLOW_NOT_FOUND');
    return wf;
  }

  private async audit(
    tenantId: string,
    actorId: string | null,
    action: string,
    entityId: string,
    meta: Record<string, unknown>,
  ) {
    try {
      await this.db
        .insertInto('security_audit_events')
        .values({
          tenant_id: tenantId,
          actor_type: 'user',
          actor_id: actorId,
          action,
          entity_type: 'workflow',
          entity_id: entityId,
          meta,
        })
        .execute();
    } catch {
      /* ignore */
    }
  }
}
