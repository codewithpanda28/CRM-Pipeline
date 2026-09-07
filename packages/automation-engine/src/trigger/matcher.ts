import { createHash, randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { canonicalizeEventType } from '@vencore/events';
import { EventRecorder } from '@vencore/events';
import type { AutomationEventEnvelope } from '../envelope';
import { normalizeEnvelope } from '../envelope';
import { loadEngineV2Flags } from '../flags';
import { incrementUsage } from '../usage';
import type { WorkflowGraph } from '../definition/service';

function evalFilter(filter: Record<string, unknown> | null, envelope: AutomationEventEnvelope): boolean {
  if (!filter || Object.keys(filter).length === 0) return true;
  // Minimal eq filter: { path: "payload.status", op: "eq", value: "x" }
  const path = String(filter['path'] ?? '');
  const op = String(filter['op'] ?? 'eq');
  const expected = filter['value'];
  const actual = getPath({ payload: envelope.payload, event_name: envelope.event_name }, path);
  if (op === 'eq') return actual === expected;
  if (op === 'neq') return actual !== expected;
  return false;
}

function getPath(obj: unknown, path: string): unknown {
  if (!path) return undefined;
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function runKey(tenantId: string, versionId: string, triggerId: string, idem: string): string {
  return createHash('sha256')
    .update(`${tenantId}:${versionId}:${triggerId}:${idem}`)
    .digest('hex');
}

export class TriggerMatcher {
  constructor(private readonly db: Kysely<Database>) {}

  async dispatch(opts: {
    tenantId: string;
    payload: Record<string, unknown>;
  }): Promise<{ runsCreated: number; runIds: string[] }> {
    const flags = await loadEngineV2Flags(this.db, opts.tenantId);
    if (!flags.enabled) {
      return { runsCreated: 0, runIds: [] };
    }

    const envelope = normalizeEnvelope(opts.payload, opts.tenantId);
    if (envelope.tenant_id !== opts.tenantId) {
      throw new Error('TENANT_MISMATCH');
    }

    const eventName = canonicalizeEventType(envelope.event_name);
    if (!eventName) return { runsCreated: 0, runIds: [] };

    if (
      flags.dispatchAllowlist.length > 0 &&
      !flags.dispatchAllowlist.includes(eventName) &&
      !flags.dispatchAllowlist.includes(envelope.event_name)
    ) {
      return { runsCreated: 0, runIds: [] };
    }

    const triggers = await this.db
      .selectFrom('workflow_triggers')
      .selectAll()
      .where('tenant_id', '=', opts.tenantId)
      .where('event_name', '=', eventName)
      .where('is_active', '=', true)
      .execute();

    const runIds: string[] = [];
    for (const trigger of triggers) {
      if (!evalFilter(trigger.filter as Record<string, unknown> | null, envelope)) continue;

      const key = runKey(
        opts.tenantId,
        trigger.workflow_version_id,
        trigger.id,
        envelope.idempotency_key,
      );

      const version = await this.db
        .selectFrom('workflow_versions')
        .selectAll()
        .where('id', '=', trigger.workflow_version_id)
        .where('tenant_id', '=', opts.tenantId)
        .executeTakeFirst();
      if (!version || version.state !== 'published') continue;

      const runId = randomUUID();
      const inserted = await this.db
        .insertInto('workflow_runs')
        .values({
          id: runId,
          tenant_id: opts.tenantId,
          workflow_id: trigger.workflow_id,
          workflow_version_id: trigger.workflow_version_id,
          status: 'queued',
          trigger_event_id: envelope.event_id || null,
          trigger_event_name: eventName,
          trigger_payload: envelope as unknown as Record<string, unknown>,
          correlation_id: envelope.correlation_id,
          causation_id: envelope.causation_id ?? null,
          run_key: key,
          run_timeout_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })
        .onConflict((oc) => oc.columns(['tenant_id', 'run_key']).doNothing())
        .returning(['id'])
        .executeTakeFirst();

      if (!inserted) continue;

      await this.seedSteps(opts.tenantId, inserted.id, version.graph as Record<string, unknown>);
      await incrementUsage(this.db, opts.tenantId, 'runs_started', `run:start:${inserted.id}`);

      try {
        await this.db
          .insertInto('security_audit_events')
          .values({
            tenant_id: opts.tenantId,
            actor_type: 'system',
            actor_id: 'trigger_matcher',
            action: 'automation.run.created',
            entity_type: 'workflow_run',
            entity_id: inserted.id,
            meta: { event_name: eventName, workflow_id: trigger.workflow_id },
          })
          .execute();
      } catch {
        /* ignore */
      }

      const recorder = new EventRecorder(this.db);
      await recorder.append({
        tenantId: opts.tenantId,
        eventType: 'automation.run.advance',
        aggregateType: 'workflow_run',
        aggregateId: inserted.id,
        jobName: 'automation.run.advance',
        dedupeKey: `automation:advance:create:${inserted.id}`,
        correlationId: envelope.correlation_id,
        payload: {
          tenant_id: opts.tenantId,
          workflow_run_id: inserted.id,
        },
      });

      runIds.push(inserted.id);
    }

    return { runsCreated: runIds.length, runIds };
  }

  private async seedSteps(tenantId: string, runId: string, graphRaw: Record<string, unknown>) {
    const graph = graphRaw as unknown as WorkflowGraph;
    const start =
      graph.nodes.find((n) => n.type === 'trigger') ??
      graph.nodes[0];
    if (!start) return;

    const firstEdges = (graph.edges ?? []).filter((e) => e.from === start.id);
    const nextIds = firstEdges.length ? firstEdges.map((e) => e.to) : graph.nodes.filter((n) => n.type !== 'trigger').slice(0, 1).map((n) => n.id);

    for (const nodeId of nextIds) {
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (!node || node.type === 'trigger') continue;
      const stepType = node.type as 'condition' | 'branch' | 'delay' | 'approval' | 'action';
      await this.db
        .insertInto('workflow_run_steps')
        .values({
          tenant_id: tenantId,
          workflow_run_id: runId,
          node_id: nodeId,
          step_type: stepType,
          status: 'ready',
          step_key: `${runId}:${nodeId}:1`,
          input_snapshot: {},
        })
        .onConflict((oc) => oc.columns(['tenant_id', 'step_key']).doNothing())
        .execute();
    }
  }
}
