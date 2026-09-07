/**
 * Round 1 human approval E2E drill + ADR-027 negatives against live DB.
 * Run: pnpm exec tsx --env-file=../../.env scripts/automation-r1-drill.ts
 */
import { createDb } from '@vencore/db';
import {
  WorkflowDefinitionService,
  TriggerMatcher,
  RunAdvanceExecutor,
  AutomationApprovalService,
  setEngineV2Flags,
  sha256Canonical,
  loadEngineV2Flags,
} from '@vencore/automation-engine';
import { randomUUID } from 'node:crypto';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/vencore_isolation_test';

const results: Record<string, string> = {};
function pass(k: string, d?: string) {
  results[k] = 'PASS';
  console.log('PASS', k, d ?? '');
}
function fail(k: string, d: string) {
  results[k] = 'FAIL';
  console.error('FAIL', k, d);
}

async function main() {
  const db = createDb(DATABASE_URL);
  const tenant = await db.selectFrom('tenants').select(['id']).executeTakeFirst();
  if (!tenant) throw new Error('no tenant');
  const tenantId = tenant.id;

  const users = await db
    .selectFrom('users')
    .select(['id', 'email'])
    .where('workspace_id', '=', tenantId)
    .limit(2)
    .execute();
  if (users.length < 2) throw new Error('need 2 users in tenant for self-approval test');
  const requester = users[0]!;
  const approver = users[1]!;

  const eventName = `crm.deal.stage_changed.drill.${Date.now()}`;

  await setEngineV2Flags(db, tenantId, {
    enabled: true,
    dispatchAllowlist: [eventName],
    selfApproval: false,
  });
  const flags = await loadEngineV2Flags(db, tenantId);
  if (!flags.enabled) fail('flags', 'not enabled');
  else pass('flags');

  const defs = new WorkflowDefinitionService(db);
  const matcher = new TriggerMatcher(db);
  const executor = new RunAdvanceExecutor(db);
  const approvals = new AutomationApprovalService(db);

  const graph = {
    trigger: { event_name: eventName },
    nodes: [
      { id: 't0', type: 'trigger' },
      {
        id: 'ap1',
        type: 'approval',
        config: {
          action_type: 'critical.stub',
          params: { marker: 'drill-v1' },
          expires_in_seconds: 3600,
        },
      },
    ],
    edges: [{ from: 't0', to: 'ap1' }],
  };

  // Class C publish block
  try {
    const bad = await defs.createDraft({
      tenantId,
      name: `r1-classc-${Date.now()}`,
      createdBy: approver.id,
      graph: {
        trigger: { event_name: eventName },
        nodes: [
          { id: 't0', type: 'trigger' },
          { id: 'a1', type: 'action', config: { action_type: 'data.purge', params: {} } },
        ],
        edges: [{ from: 't0', to: 'a1' }],
      },
    });
    await defs.publish({ tenantId, workflowId: bad!.id, actorId: approver.id });
    fail('class_c_publish', 'should have blocked');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('CLASS_C')) pass('class_c_publish', msg);
    else fail('class_c_publish', msg);
  }

  const wf = await defs.createDraft({
    tenantId,
    name: `r1-drill-${Date.now()}`,
    createdBy: requester.id,
    graph,
  });
  await defs.publish({ tenantId, workflowId: wf!.id, actorId: approver.id });
  pass('publish');

  const eventId = randomUUID();
  const dispatch = await matcher.dispatch({
    tenantId,
    payload: {
      event_id: eventId,
      tenant_id: tenantId,
      event_name: eventName,
      occurred_at: new Date().toISOString(),
      actor: { type: 'user', id: requester.id },
      source: { system: 'crm' },
      payload: { deal_id: randomUUID(), stage: 'won' },
      correlation_id: eventId,
      idempotency_key: `drill:${eventId}`,
    },
  });
  if (dispatch.runsCreated !== 1) fail('dispatch', JSON.stringify(dispatch));
  else pass('dispatch', dispatch.runIds[0]);

  // duplicate → one run
  const again = await matcher.dispatch({
    tenantId,
    payload: {
      event_id: eventId,
      tenant_id: tenantId,
      event_name: eventName,
      idempotency_key: `drill:${eventId}`,
      payload: {},
    },
  });
  if (again.runsCreated === 0) pass('idempotent_dispatch');
  else fail('idempotent_dispatch', 'created duplicate');

  const runId = dispatch.runIds[0]!;

  // Advance → awaiting approval; forged approved must not execute
  let adv = await executor.advance({
    tenantId,
    workflowRunId: runId,
    forgedApprovedFlag: true,
  });
  if (adv.status !== 'awaiting_approval') fail('awaiting', JSON.stringify(adv));
  else pass('awaiting_approval');

  const approval = await db
    .selectFrom('automation_approvals')
    .selectAll()
    .where('workflow_run_id', '=', runId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (!approval || approval.status !== 'pending') fail('pending_row', 'missing');
  else pass('pending_row', approval.id);

  // pending execute blocked
  const vPending = await approvals.validateForExecution({
    tenantId,
    approvalId: approval!.id,
    workflowRunId: runId,
    workflowRunStepId: approval!.workflow_run_step_id!,
    workflowVersionId: approval!.workflow_version_id,
  });
  if (vPending.ok || vPending.reason !== 'pending') fail('block_pending', JSON.stringify(vPending));
  else pass('block_pending');

  // Self-approval: temporarily mark requester as user A, attempt authorize as A
  await db
    .updateTable('automation_approvals')
    .set({ requester_type: 'user', requester_id: requester.id })
    .where('id', '=', approval!.id)
    .execute();
  try {
    await approvals.authorize({
      tenantId,
      approvalId: approval!.id,
      approverType: 'user',
      approverId: requester.id,
      comment: 'self?',
    });
    fail('self_approval_blocked', 'should forbid');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'SELF_APPROVAL_FORBIDDEN') pass('self_approval_blocked');
    else fail('self_approval_blocked', msg);
  }
  await db
    .updateTable('automation_approvals')
    .set({ requester_type: 'automation', requester_id: runId })
    .where('id', '=', approval!.id)
    .execute();

  // authorize with human approver (different from requester)
  const authorized = await approvals.authorize({
    tenantId,
    approvalId: approval!.id,
    approverType: 'user',
    approverId: approver.id,
    comment: 'drill approve',
  });
  if (authorized.status !== 'authorized') fail('authorize', authorized.status);
  else pass('authorize');

  const snapBefore = JSON.stringify(authorized.requested_payload_snapshot);
  const hashBefore = authorized.payload_hash;

  // tamper test on validate
  await db
    .updateTable('automation_approvals')
    .set({ payload_hash: 'deadbeef' })
    .where('id', '=', approval!.id)
    .execute();
  const vTamper = await approvals.validateForExecution({
    tenantId,
    approvalId: approval!.id,
    workflowRunId: runId,
    workflowRunStepId: approval!.workflow_run_step_id!,
    workflowVersionId: approval!.workflow_version_id,
  });
  if (vTamper.reason !== 'payload_hash_mismatch') fail('tamper', JSON.stringify(vTamper));
  else pass('tamper_blocked');

  // restore hash
  await db
    .updateTable('automation_approvals')
    .set({ payload_hash: hashBefore })
    .where('id', '=', approval!.id)
    .execute();

  adv = await executor.advance({ tenantId, workflowRunId: runId, forgedApprovedFlag: true });
  const step = await db
    .selectFrom('workflow_run_steps')
    .selectAll()
    .where('workflow_run_id', '=', runId)
    .where('step_type', '=', 'approval')
    .executeTakeFirst();

  if (step?.status !== 'succeeded') fail('class_b_execute', JSON.stringify({ adv, step }));
  else {
    const out = step.output_snapshot as { executed_payload_hash?: string; executed_snapshot?: unknown };
    if (out?.executed_payload_hash !== hashBefore) fail('snapshot_bind', 'hash mismatch');
    else if (JSON.stringify(authorized.requested_payload_snapshot) !== snapBefore) fail('snapshot_bind', 'snapshot changed');
    else if (sha256Canonical(out.executed_snapshot) !== hashBefore) fail('snapshot_bind', 'executed hash');
    else pass('class_b_execute_and_snapshot');
  }

  // disabled flag → zero runs
  await setEngineV2Flags(db, tenantId, { enabled: false, dispatchAllowlist: [eventName] });
  const zero = await matcher.dispatch({
    tenantId,
    payload: {
      event_id: randomUUID(),
      tenant_id: tenantId,
      event_name: eventName,
      idempotency_key: randomUUID(),
      payload: {},
    },
  });
  if (zero.runsCreated === 0) pass('flag_off_zero_runs');
  else fail('flag_off_zero_runs', String(zero.runsCreated));

  console.log('\n=== DRILL RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
  const failed = Object.values(results).some((v) => v === 'FAIL');
  await db.destroy();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
