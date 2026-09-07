/**
 * Automation engine v2 API — workflows, approvals, runs (Round 1).
 * Does NOT replace PM /api/projects/:id/automations.
 */
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import {
  WorkflowDefinitionService,
  AutomationApprovalService,
  RunAdvanceExecutor,
  TriggerMatcher,
  replayRun,
  pauseRun,
  resumeRun,
  loadEngineV2Flags,
  setEngineV2Flags,
  listActions,
} from '@vencore/automation-engine';
import type { AuthenticatedRequest } from '../middleware/auth';

function ok(res: import('express').Response, data: unknown, status = 200) {
  res.status(status).json({ data, error: null });
}
function fail(res: import('express').Response, s: number, code: string, message: string) {
  res.status(s).json({ data: null, error: { code, message } });
}

export function createAutomationEngineRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): Router {
  const router = Router();
  const definitions = new WorkflowDefinitionService(db);
  const approvals = new AutomationApprovalService(db);
  const matcher = new TriggerMatcher(db);
  const executor = new RunAdvanceExecutor(db);

  router.get('/actions', requirePermission('automation:workflows:view'), (_req, res) => {
    ok(res, listActions());
  });

  /** Status is readable by workflow viewers; only admins may PATCH. */
  router.get('/flags', requirePermission('automation:workflows:view'), async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      ok(res, await loadEngineV2Flags(db, workspace.id));
    } catch (e) {
      next(e);
    }
  });

  router.patch('/flags', requirePermission('automation:admin'), async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const body = z
        .object({
          enabled: z.boolean().optional(),
          dispatchAllowlist: z.array(z.string()).optional(),
          selfApproval: z.boolean().optional(),
        })
        .parse(req.body);
      ok(res, await setEngineV2Flags(db, workspace.id, body));
    } catch (e) {
      next(e);
    }
  });

  router.get('/workflows', requirePermission('automation:workflows:view'), async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      ok(res, await definitions.list(workspace.id));
    } catch (e) {
      next(e);
    }
  });

  router.post('/workflows', requirePermission('automation:workflows:edit'), async (req, res, next) => {
    try {
      const { workspace, user } = req as AuthenticatedRequest;
      const body = z
        .object({
          name: z.string().min(1),
          description: z.string().optional(),
          graph: z.record(z.unknown()).optional(),
        })
        .parse(req.body);
      const wf = await definitions.createDraft({
        tenantId: workspace.id,
        name: body.name,
        description: body.description,
        createdBy: user.id,
        graph: body.graph,
      });
      ok(res, wf, 201);
    } catch (e) {
      next(e);
    }
  });

  router.get('/workflows/:id', requirePermission('automation:workflows:view'), async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const wf = await definitions.get(workspace.id, req.params['id']!);
      if (!wf) return fail(res, 404, 'NOT_FOUND', 'Workflow not found');
      let draftGraph: Record<string, unknown> | null = null;
      let draftVersionNumber: number | null = null;
      let publishedVersionNumber: number | null = null;
      if (wf.current_draft_version_id) {
        const draft = await definitions.getVersion(workspace.id, wf.current_draft_version_id);
        if (draft) {
          draftGraph = draft.graph as Record<string, unknown>;
          draftVersionNumber = draft.version_number;
        }
      }
      if (wf.current_published_version_id) {
        const pub = await definitions.getVersion(workspace.id, wf.current_published_version_id);
        publishedVersionNumber = pub?.version_number ?? null;
      }
      ok(res, {
        ...wf,
        draft_graph: draftGraph,
        draft_version_number: draftVersionNumber,
        published_version_number: publishedVersionNumber,
      });
    } catch (e) {
      next(e);
    }
  });

  router.post('/workflows/:id/archive', requirePermission('automation:workflows:edit'), async (req, res, next) => {
    try {
      const { workspace, user } = req as AuthenticatedRequest;
      const wf = await definitions.archive({
        tenantId: workspace.id,
        workflowId: req.params['id']!,
        actorId: user.id,
      });
      ok(res, wf);
    } catch (e) {
      next(e);
    }
  });

  router.post('/workflows/:id/enable', requirePermission('automation:workflows:edit'), async (req, res, next) => {
    try {
      const { workspace, user } = req as AuthenticatedRequest;
      const wf = await definitions.enable({
        tenantId: workspace.id,
        workflowId: req.params['id']!,
        actorId: user.id,
      });
      ok(res, wf);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'error';
      if (msg === 'NOT_PUBLISHED') return fail(res, 400, msg, 'Publish this automation before enabling it.');
      next(e);
    }
  });

  router.get('/usage', requirePermission('automation:workflows:view'), async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const row = await db
        .selectFrom('automation_usage_counters')
        .selectAll()
        .where('tenant_id', '=', workspace.id)
        .orderBy('period_start', 'desc')
        .executeTakeFirst();
      ok(res, {
        period_start: row?.period_start ?? null,
        runs_started: row?.runs_started ?? 0,
        runs_completed: row?.runs_completed ?? 0,
        runs_failed: row?.runs_failed ?? 0,
        steps_executed: row?.steps_executed ?? 0,
        actions_class_a: row?.actions_class_a ?? 0,
        actions_class_b: row?.actions_class_b ?? 0,
        approvals_requested: row?.approvals_requested ?? 0,
        approvals_authorized: row?.approvals_authorized ?? 0,
        /** Soft display limit for UX — not billing */
        display_limit: 5000,
      });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/workflows/:id/draft', requirePermission('automation:workflows:edit'), async (req, res, next) => {
    try {
      const { workspace, user } = req as AuthenticatedRequest;
      const body = z.object({ graph: z.record(z.unknown()) }).parse(req.body);
      const wf = await definitions.updateDraft({
        tenantId: workspace.id,
        workflowId: req.params['id']!,
        graph: body.graph,
        actorId: user.id,
      });
      ok(res, wf);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'error';
      if (msg === 'WORKFLOW_NOT_FOUND') return fail(res, 404, msg, msg);
      next(e);
    }
  });

  router.post('/workflows/:id/publish', requirePermission('automation:workflows:publish'), async (req, res, next) => {
    try {
      const { workspace, user } = req as AuthenticatedRequest;
      const wf = await definitions.publish({
        tenantId: workspace.id,
        workflowId: req.params['id']!,
        actorId: user.id,
      });
      ok(res, wf);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'error';
      if (msg.startsWith('CLASS_C') || msg.startsWith('CLASS_B') || msg.startsWith('MISSING')) {
        return fail(res, 400, msg, msg);
      }
      next(e);
    }
  });

  router.get('/approvals', requirePermission('automation:approvals:view'), async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const rows = await db
        .selectFrom('automation_approvals')
        .selectAll()
        .where('tenant_id', '=', workspace.id)
        .orderBy('requested_at', 'desc')
        .limit(100)
        .execute();
      ok(res, rows);
    } catch (e) {
      next(e);
    }
  });

  router.get('/approvals/:id', requirePermission('automation:approvals:view'), async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const row = await approvals.get(workspace.id, req.params['id']!);
      if (!row) return fail(res, 404, 'NOT_FOUND', 'Approval not found');
      ok(res, row);
    } catch (e) {
      next(e);
    }
  });

  router.post('/approvals/:id/authorize', requirePermission('automation:approvals:decide'), async (req, res, next) => {
    try {
      const { workspace, user } = req as AuthenticatedRequest;
      const body = z.object({ comment: z.string().optional() }).parse(req.body ?? {});
      const row = await approvals.authorize({
        tenantId: workspace.id,
        approvalId: req.params['id']!,
        approverType: 'user',
        approverId: user.id,
        comment: body.comment,
      });
      ok(res, row);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'error';
      if (msg === 'SELF_APPROVAL_FORBIDDEN') return fail(res, 403, msg, msg);
      if (msg === 'APPROVAL_NOT_FOUND') return fail(res, 404, msg, msg);
      if (msg.startsWith('APPROVAL_')) return fail(res, 409, msg, msg);
      next(e);
    }
  });

  router.post('/approvals/:id/reject', requirePermission('automation:approvals:decide'), async (req, res, next) => {
    try {
      const { workspace, user } = req as AuthenticatedRequest;
      const body = z.object({ reason: z.string().min(1) }).parse(req.body);
      const row = await approvals.reject({
        tenantId: workspace.id,
        approvalId: req.params['id']!,
        approverType: 'user',
        approverId: user.id,
        reason: body.reason,
      });
      ok(res, row);
    } catch (e) {
      next(e);
    }
  });

  router.post('/approvals/:id/revoke', requirePermission('automation:approvals:decide'), async (req, res, next) => {
    try {
      const { workspace, user } = req as AuthenticatedRequest;
      const body = z.object({ reason: z.string().min(1) }).parse(req.body);
      const row = await approvals.revoke({
        tenantId: workspace.id,
        approvalId: req.params['id']!,
        actorType: 'user',
        actorId: user.id,
        reason: body.reason,
      });
      ok(res, row);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'error';
      if (msg === 'APPROVAL_ALREADY_EXECUTED') return fail(res, 409, msg, msg);
      next(e);
    }
  });

  router.get('/runs', requirePermission('automation:runs:view'), async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const rows = await db
        .selectFrom('workflow_runs')
        .selectAll()
        .where('tenant_id', '=', workspace.id)
        .orderBy('created_at', 'desc')
        .limit(100)
        .execute();
      ok(res, rows);
    } catch (e) {
      next(e);
    }
  });

  router.get('/runs/:id', requirePermission('automation:runs:view'), async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const run = await db
        .selectFrom('workflow_runs')
        .selectAll()
        .where('tenant_id', '=', workspace.id)
        .where('id', '=', req.params['id']!)
        .executeTakeFirst();
      if (!run) return fail(res, 404, 'NOT_FOUND', 'Run not found');
      const steps = await db
        .selectFrom('workflow_run_steps')
        .selectAll()
        .where('tenant_id', '=', workspace.id)
        .where('workflow_run_id', '=', run.id)
        .orderBy('created_at', 'asc')
        .execute();
      ok(res, { ...run, steps });
    } catch (e) {
      next(e);
    }
  });

  router.post('/runs/:id/replay', requirePermission('automation:runs:replay'), async (req, res, next) => {
    try {
      const { workspace, user } = req as AuthenticatedRequest;
      await replayRun(db, workspace.id, req.params['id']!, user.id);
      ok(res, { replayed: true, note: 'replay_is_not_approval' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'error';
      if (msg === 'RUN_NOT_FOUND') return fail(res, 404, msg, msg);
      next(e);
    }
  });

  router.post('/runs/:id/pause', requirePermission('automation:admin'), async (req, res, next) => {
    try {
      const { workspace, user } = req as AuthenticatedRequest;
      const body = z.object({ reason: z.string().default('paused') }).parse(req.body ?? {});
      await pauseRun(db, workspace.id, req.params['id']!, body.reason, user.id);
      ok(res, { paused: true });
    } catch (e) {
      next(e);
    }
  });

  router.post('/runs/:id/resume', requirePermission('automation:admin'), async (req, res, next) => {
    try {
      const { workspace, user } = req as AuthenticatedRequest;
      await resumeRun(db, workspace.id, req.params['id']!, user.id);
      ok(res, { resumed: true });
    } catch (e) {
      next(e);
    }
  });

  /** Manual event inject for tests / operators — still respects feature flags. */
  router.post('/dispatch', requirePermission('automation:admin'), async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const body = z.record(z.unknown()).parse(req.body);
      const result = await matcher.dispatch({ tenantId: workspace.id, payload: body });
      ok(res, result);
    } catch (e) {
      next(e);
    }
  });

  /** Sync advance for tests / drills (still ADR-027 gated). */
  router.post('/runs/:id/advance', requirePermission('automation:admin'), async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const forged = (req.body as { approved?: unknown } | undefined)?.approved;
      const result = await executor.advance({
        tenantId: workspace.id,
        workflowRunId: req.params['id']!,
        forgedApprovedFlag: forged,
      });
      ok(res, result);
    } catch (e) {
      next(e);
    }
  });

  return router;
}
