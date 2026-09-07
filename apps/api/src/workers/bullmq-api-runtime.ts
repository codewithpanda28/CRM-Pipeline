/**
 * API-bound BullMQ consumers for jobs that need in-process sandboxes / push / alert libs.
 * Schedulers are upserted by apps/worker — this process only consumes.
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { TenantStatus } from '@vencore/tenancy';
import {
  assertJobsRedisUrl,
  createTenantAwareWorker,
  jobRuntimeMetrics,
  type JobHandler,
} from '@vencore/job-runtime';
import { logger } from '../lib/logger';
import { runPluginCronTick } from './plugin-cron';
import { runLicenseCheck } from './license-check';
import { runTaskDueNotifier } from './task-due-notifier';
import { runPmDueAlerts } from './pm-due-alert';
import { runRecurringTaskGeneration } from './recurring-task-generator';
import { runMetricsRollup } from './metrics-rollup';
import { runHubRetention } from './hub-retention';

export interface ApiJobsRuntimeHandles {
  close: () => Promise<void>;
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
    logger.info({ job: name, attempt: ctx.attempt, correlationId: ctx.correlationId }, 'api-bound job start');
    await fn();
    jobRuntimeMetrics.heartbeat();
  };
}

export async function startApiBoundJobsRuntime(opts: {
  db: Kysely<Database>;
  redisUrl: string;
}): Promise<ApiJobsRuntimeHandles> {
  assertJobsRedisUrl(opts.redisUrl);

  const handlersByQueue: Record<string, Record<string, JobHandler>> = {
    automation: {
      'plugin.cron.fire': wrap('plugin.cron.fire', () => runPluginCronTick(opts.db)),
      'pm.recurring.generate': wrap('pm.recurring.generate', () => runRecurringTaskGeneration(opts.db)),
      'metrics.rollup': wrap('metrics.rollup', () => runMetricsRollup(opts.db)),
    },
    integrations: {
      'license.check': wrap('license.check', () => runLicenseCheck(opts.db)),
    },
    notifications: {
      'tasks.due.notify': wrap('tasks.due.notify', () => runTaskDueNotifier(opts.db)),
      'pm.due.alert': wrap('pm.due.alert', () => runPmDueAlerts(opts.db)),
      'reminders.native': wrap('reminders.native', async () => {
        const { runNativeRemindersJob } = await import('./native-reminders');
        await runNativeRemindersJob(opts.db);
      }),
    },
    documents: {
      'hub.retention.purge': wrap('hub.retention.purge', () => runHubRetention(opts.db)),
      'document.render': async (ctx) => {
        const { runDocumentRenderJob } = await import('./document-render');
        await runDocumentRenderJob(opts.db, ctx.payload, ctx.tenantId);
      },
    },
  };

  const closes: Array<() => Promise<void>> = [];
  for (const [queue, handlers] of Object.entries(handlersByQueue)) {
    const { close } = createTenantAwareWorker({
      redisUrl: opts.redisUrl,
      queue: queue as 'automation' | 'integrations' | 'notifications' | 'documents',
      concurrency: 2,
      loadTenant: loadTenant(opts.db),
      handlers,
      onRejected: (info) => logger.warn(info, 'api-bound job rejected'),
    });
    closes.push(close);
  }

  logger.info('API-bound BullMQ consumers started (plugin/license/notifications/metrics/hub)');

  return {
    close: async () => {
      for (const c of closes) await c();
      logger.info('API-bound BullMQ consumers shut down');
    },
  };
}
