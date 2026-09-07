import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { TenantStatus } from '@vencore/tenancy';
import { readConfig } from '@vencore/config';
import {
  BullMqJobQueue,
  assertJobsRedisUrl,
  createTenantAwareWorker,
  jobRuntimeMetrics,
  type JobHandler,
  type QueueName,
} from '@vencore/job-runtime';
import { OutboxPublisher, OutboxReconciler, outboxMetrics } from '@vencore/events';
import { executeWebhookDelivery } from '@vencore/events/webhook';
import { logger } from '../../lib/logger';
import { runWebsitePing } from '../website-ping';
import { runAlertEval } from '../alert-eval';
import { runDbHealth } from '../db-health';
import { runServerStaleness } from '../server-staleness';
import { runDueDateAlerts } from '../pm/due-date-alerts';
import { runOverdueScan } from '../pm/overdue-scan';
import { runHealthRecalc } from '../pm/health-recalc';
import { runSprintRollover } from '../pm/sprint-rollover';
import { runPipelineReminders } from '../pipeline-reminders';
import { runUpdateCheck } from '../update-check';
import { processAutomationEvent, type AutomationEvent } from '../pipeline-automations';
import { evaluatePmAutomationEvent, type PMEvent } from '@vencore/automation';
import {
  createAutomationEventDispatchHandler,
  createAutomationRunAdvanceHandler,
  createAutomationApprovalTimeoutHandler,
  bridgeDomainEventToAutomationDispatch,
} from '../automation-engine-handlers';
import {
  QUEUES_FOR_WORKER,
  RECURRING_JOBS,
  platformJobDefinition,
} from './catalog';

export interface JobsRuntimeHandles {
  close: () => Promise<void>;
  jobQueue: BullMqJobQueue;
}

function loadTenant(db: Kysely<Database>) {
  return async (tenantId: string) => {
    try {
      const tenant = await db
        .selectFrom('tenants')
        .where('id', '=', tenantId)
        .select(['id', 'status'])
        .executeTakeFirst();
      if (!tenant) return null;
      const controls = await db
        .selectFrom('tenant_job_controls')
        .where('tenant_id', '=', tenantId)
        .select(['jobs_paused'])
        .executeTakeFirst();
      return {
        id: tenant.id,
        status: tenant.status as TenantStatus,
        jobsPaused: Boolean(controls?.jobs_paused),
      };
    } catch {
      return { id: tenantId, status: 'active' as TenantStatus, jobsPaused: false };
    }
  };
}

function wrap(name: string, fn: () => Promise<void>): JobHandler {
  return async (ctx) => {
    const started = Date.now();
    logger.info(
      { job: name, attempt: ctx.attempt, correlationId: ctx.correlationId, scope: ctx.scope },
      'job start',
    );
    await fn();
    jobRuntimeMetrics.heartbeat();
    logger.info(
      { job: name, ms: Date.now() - started, correlationId: ctx.correlationId },
      'job done',
    );
  };
}

export async function startBullmqJobsRuntime(opts: {
  db: Kysely<Database>;
  redisUrl: string;
}): Promise<JobsRuntimeHandles> {
  assertJobsRedisUrl(opts.redisUrl);
  const config = readConfig();

  const jobQueue = new BullMqJobQueue({
    redisUrl: opts.redisUrl,
    queues: QUEUES_FOR_WORKER,
  });

  const publisher = new OutboxPublisher({
    db: opts.db,
    jobQueue,
    logger: {
      info: (o, m) => logger.info(o, m),
      warn: (o, m) => logger.warn(o, m),
      error: (o, m) => logger.error(o, m),
    },
  });

  const reconciler = new OutboxReconciler(opts.db, jobQueue);

  const webhookDeliver: JobHandler = async (ctx) => {
    const fromData =
      ctx.payload['data'] && typeof ctx.payload['data'] === 'object'
        ? String((ctx.payload['data'] as Record<string, unknown>)['deliveryId'] ?? '')
        : '';
    const deliveryId = String(ctx.payload['deliveryId'] ?? fromData ?? '');
    if (!deliveryId) throw new Error('webhook.deliver missing deliveryId');
    if (!ctx.tenantId) throw new Error('webhook.deliver missing tenantId');
    const result = await executeWebhookDelivery(opts.db, {
      deliveryId,
      expectedTenantId: ctx.tenantId,
    });
    logger.info(
      {
        deliveryId,
        tenantId: ctx.tenantId,
        outcome: result.outcome,
        attempt: ctx.attempt,
        correlationId: ctx.correlationId,
      },
      'webhook.deliver completed',
    );
  };

  const pipelineEvaluate: JobHandler = async (ctx) => {
    if (!ctx.tenantId) throw new Error('automation.pipeline.evaluate missing tenantId');
    const data =
      ctx.payload['data'] && typeof ctx.payload['data'] === 'object'
        ? (ctx.payload['data'] as Record<string, unknown>)
        : ctx.payload;
    const event: AutomationEvent = {
      event_type: data['event_type'] as AutomationEvent['event_type'],
      item_id: String(data['item_id'] ?? ''),
      pipeline_id: String(data['pipeline_id'] ?? ''),
      workspace_id: String(data['workspace_id'] ?? ctx.tenantId),
      payload: (data['payload'] as Record<string, unknown>) ?? {},
      idempotency_key: data['idempotency_key']
        ? String(data['idempotency_key'])
        : ctx.idempotencyKey,
    };
    if (!event.item_id || !event.pipeline_id || !event.event_type) {
      throw new Error('automation.pipeline.evaluate malformed payload');
    }
    const started = Date.now();
    await processAutomationEvent(opts.db, event);
    jobRuntimeMetrics.heartbeat();
    logger.info(
      {
        job: 'automation.pipeline.evaluate',
        tenantId: ctx.tenantId,
        ms: Date.now() - started,
        correlationId: ctx.correlationId,
      },
      'automation.pipeline.evaluate done',
    );
  };

  const pmEvaluate: JobHandler = async (ctx) => {
    if (!ctx.tenantId) throw new Error('automation.pm.evaluate missing tenantId');
    const data =
      ctx.payload['data'] && typeof ctx.payload['data'] === 'object'
        ? (ctx.payload['data'] as Record<string, unknown>)
        : ctx.payload;
    const event = data['event'] as PMEvent | undefined;
    if (!event || typeof event !== 'object' || !('type' in event)) {
      throw new Error('automation.pm.evaluate missing event');
    }
    const idempotencyKey = data['idempotency_key']
      ? String(data['idempotency_key'])
      : ctx.idempotencyKey;
    const started = Date.now();
    const result = await evaluatePmAutomationEvent(opts.db, event, {
      idempotencyKey,
      logger: {
        info: (o, m) => logger.info(o, m),
        warn: (o, m) => logger.warn(o, m),
        error: (o, m) => logger.error(o, m),
      },
    });
    jobRuntimeMetrics.heartbeat();
    logger.info(
      {
        job: 'automation.pm.evaluate',
        tenantId: ctx.tenantId,
        ms: Date.now() - started,
        ...result,
        correlationId: ctx.correlationId,
      },
      'automation.pm.evaluate done',
    );
  };

  const EVENT_DRIVEN_HANDLERS: Record<string, { queue: QueueName; handler: JobHandler }> = {
    'webhook.deliver': { queue: 'webhooks', handler: webhookDeliver },
    'automation.pipeline.evaluate': { queue: 'automation', handler: pipelineEvaluate },
    'automation.pm.evaluate': { queue: 'automation', handler: pmEvaluate },
    'automation.event.dispatch': {
      queue: 'automation',
      handler: createAutomationEventDispatchHandler(opts.db),
    },
    'automation.run.advance': {
      queue: 'automation',
      handler: createAutomationRunAdvanceHandler(opts.db),
    },
    // Domain event ack — durable crm.deal.* without secondary automation fanout
    'crm.deal.record': {
      queue: 'integrations',
      handler: async (ctx) => {
        logger.info(
          {
            job: 'crm.deal.record',
            eventType: ctx.payload['eventType'],
            tenantId: ctx.tenantId,
            correlationId: ctx.correlationId,
          },
          'crm.deal.record acknowledged',
        );
        await bridgeDomainEventToAutomationDispatch(opts.db, ctx.tenantId, ctx.payload);
      },
    },
    'crm.lead.record': {
      queue: 'integrations',
      handler: async (ctx) => {
        logger.info(
          {
            job: 'crm.lead.record',
            eventType: ctx.payload['eventType'],
            tenantId: ctx.tenantId,
            correlationId: ctx.correlationId,
          },
          'crm.lead.record acknowledged',
        );
        await bridgeDomainEventToAutomationDispatch(opts.db, ctx.tenantId, ctx.payload);
      },
    },
    'crm.customer_party.record': {
      queue: 'integrations',
      handler: async (ctx) => {
        logger.info(
          {
            job: 'crm.customer_party.record',
            eventType: ctx.payload['eventType'],
            tenantId: ctx.tenantId,
            correlationId: ctx.correlationId,
          },
          'crm.customer_party.record acknowledged',
        );
        await bridgeDomainEventToAutomationDispatch(opts.db, ctx.tenantId, ctx.payload);
      },
    },
    'crm.product.record': {
      queue: 'integrations',
      handler: async (ctx) => {
        logger.info(
          {
            job: 'crm.product.record',
            eventType: ctx.payload['eventType'],
            tenantId: ctx.tenantId,
            correlationId: ctx.correlationId,
          },
          'crm.product.record acknowledged',
        );
        await bridgeDomainEventToAutomationDispatch(opts.db, ctx.tenantId, ctx.payload);
      },
    },
    'crm.quote.record': {
      queue: 'integrations',
      handler: async (ctx) => {
        logger.info(
          {
            job: 'crm.quote.record',
            eventType: ctx.payload['eventType'],
            tenantId: ctx.tenantId,
            correlationId: ctx.correlationId,
          },
          'crm.quote.record acknowledged',
        );
        await bridgeDomainEventToAutomationDispatch(opts.db, ctx.tenantId, ctx.payload);
      },
    },
    'finance.record': {
      queue: 'integrations',
      handler: async (ctx) => {
        const { handleFinanceRecordOnWorker } = await import('../finance-record-bridge');
        await handleFinanceRecordOnWorker(opts.db, ctx.payload, ctx.tenantId);
        await bridgeDomainEventToAutomationDispatch(opts.db, ctx.tenantId, ctx.payload);
      },
    },
  };

  const workerHandlers: Record<string, JobHandler> = {
    'website.check': wrap('website.check', () => runWebsitePing()),
    'infra.alert.eval': wrap('infra.alert.eval', () => runAlertEval()),
    'infra.db.health': wrap('infra.db.health', async () => {
      if (!config.features.infra) return;
      await runDbHealth(opts.db);
    }),
    'infra.server.staleness': wrap('infra.server.staleness', async () => {
      if (!config.features.infra) return;
      await runServerStaleness(opts.db);
    }),
    'pm.due.soon': wrap('pm.due.soon', () => runDueDateAlerts(opts.db)),
    'pm.overdue.scan': wrap('pm.overdue.scan', () => runOverdueScan(opts.db)),
    'pm.health.recalc': wrap('pm.health.recalc', () => runHealthRecalc(opts.db)),
    'pm.sprint.rollover': wrap('pm.sprint.rollover', () => runSprintRollover(opts.db)),
    'pipeline.reminder': wrap('pipeline.reminder', () => runPipelineReminders(opts.db)),
    'system.update.check': wrap('system.update.check', () => runUpdateCheck()),
    'automation.approval.timeout': createAutomationApprovalTimeoutHandler(opts.db),
  };

  const workerQueues = new Set<QueueName>([
    'webhooks',
    'integrations',
    'notifications',
    'automation',
  ]);

  const closes: Array<() => Promise<void>> = [];

  for (const queue of workerQueues) {
    const handlersForQueue: Record<string, JobHandler> = {};
    for (const [name, handler] of Object.entries(workerHandlers)) {
      const spec = RECURRING_JOBS.find((j) => j.name === name);
      if (spec && spec.queue === queue && spec.consumer === 'worker') {
        handlersForQueue[name] = handler;
      }
    }
    for (const [name, entry] of Object.entries(EVENT_DRIVEN_HANDLERS)) {
      if (entry.queue === queue) {
        handlersForQueue[name] = entry.handler;
      }
    }
    if (Object.keys(handlersForQueue).length === 0) continue;

    const { close } = createTenantAwareWorker({
      redisUrl: opts.redisUrl,
      queue,
      concurrency: queue === 'webhooks' ? 5 : 2,
      loadTenant: loadTenant(opts.db),
      handlers: handlersForQueue,
      onRejected: (info) => logger.warn(info, 'job rejected by worker middleware'),
    });
    closes.push(close);
  }

  // Upsert ALL recurring schedulers (including API-consumed jobs)
  for (const spec of RECURRING_JOBS) {
    const def = platformJobDefinition(spec);
    if (spec.everyMs != null) {
      await jobQueue.ensureRecurring(def, { everyMs: spec.everyMs }, spec.schedulerId);
    } else if (spec.cron) {
      await jobQueue.ensureRecurring(def, { cron: spec.cron }, spec.schedulerId);
    }
  }
  logger.info({ count: RECURRING_JOBS.length }, 'recurring job schedulers upserted');

  let stopping = false;
  let publisherTimer: ReturnType<typeof setInterval> | null = null;
  let reconcileTimer: ReturnType<typeof setInterval> | null = null;
  let metricsTimer: ReturnType<typeof setInterval> | null = null;
  let publisherInflight: Promise<unknown> | null = null;

  const publishTick = () => {
    if (stopping) return;
    publisherInflight = publisher
      .tick()
      .then((r) => {
        if (r.claimed > 0) logger.info(r, 'outbox publisher tick');
      })
      .catch((err) => logger.error({ err }, 'outbox publisher tick failed'));
  };
  publishTick();
  publisherTimer = setInterval(publishTick, 2_000);

  reconcileTimer = setInterval(() => {
    if (stopping) return;
    reconciler
      .reclaimStuckLeases()
      .then(() => reconciler.collect())
      .then((report) => {
        logger.info({ ...report, jobRuntime: jobRuntimeMetrics.snapshot(), outbox: outboxMetrics.snapshot() }, 'queue observability snapshot');
      })
      .catch((err) => logger.error({ err }, 'outbox reconciler failed'));
  }, 30_000);

  metricsTimer = setInterval(() => {
    jobRuntimeMetrics.heartbeat();
  }, 15_000);

  logger.info('BullMQ jobs runtime started (publisher + worker consumers + schedulers)');

  return {
    jobQueue,
    close: async () => {
      stopping = true;
      if (publisherTimer) clearInterval(publisherTimer);
      if (reconcileTimer) clearInterval(reconcileTimer);
      if (metricsTimer) clearInterval(metricsTimer);
      if (publisherInflight) await publisherInflight.catch(() => undefined);
      for (const c of closes) await c();
      await jobQueue.close();
      logger.info('BullMQ jobs runtime shut down');
    },
  };
}
