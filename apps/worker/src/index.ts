import { readConfig } from '@vencore/config';
import { createDb } from '@vencore/db';
import { resolveJobsRuntime } from '@vencore/job-runtime';
import { logger } from './lib/logger';
import { runWebsitePing } from './jobs/website-ping';
import { runAlertEval } from './jobs/alert-eval';
import { runDbHealth } from './jobs/db-health';
import { runServerStaleness } from './jobs/server-staleness';
import { runWebhookDelivery } from './jobs/webhook-delivery';
import { runDueDateAlerts } from './jobs/pm/due-date-alerts';
import { runOverdueScan } from './jobs/pm/overdue-scan';
import { runHealthRecalc } from './jobs/pm/health-recalc';
import { runSprintRollover } from './jobs/pm/sprint-rollover';
import { runPipelineReminders } from './jobs/pipeline-reminders';
import { runUpdateCheck } from './jobs/update-check';
import { startBullmqJobsRuntime } from './jobs/bullmq/runtime';

const config = readConfig();
const db = createDb(process.env['DATABASE_URL']!);
const jobsRuntime = resolveJobsRuntime(process.env['JOBS_RUNTIME']);

logger.info({ jobsRuntime }, 'Worker starting');

let shuttingDown = false;
let inflightJob: Promise<void> | null = null;
let bullmqHandles: { close: () => Promise<void> } | null = null;
let legacyTimer: ReturnType<typeof setInterval> | null = null;

async function bootstrap(): Promise<void> {
  if (jobsRuntime === 'bullmq') {
    const redisUrl = process.env['REDIS_URL'];
    if (!redisUrl) {
      logger.error('REDIS_URL required when JOBS_RUNTIME=bullmq');
      process.exit(1);
    }
    bullmqHandles = await startBullmqJobsRuntime({ db, redisUrl });
    return;
  }

  logger.warn('JOBS_RUNTIME=legacy — 60s interval loop (staging rollback only)');
  let running = false;
  legacyTimer = setInterval(async () => {
    if (shuttingDown || running) return;
    running = true;
    inflightJob = (async () => {
      try {
        await runWebsitePing();
        await runAlertEval();
        await runWebhookDelivery(db);
        if (config.features.infra) {
          await runDbHealth(db);
          await runServerStaleness(db);
        }
        await runDueDateAlerts(db);
        await runOverdueScan(db);
        await runHealthRecalc(db);
        await runSprintRollover(db);
        await runPipelineReminders(db);
        await runUpdateCheck();
      } catch (err) {
        logger.error({ err }, 'job error');
      } finally {
        running = false;
      }
    })();
    await inflightJob;
    inflightJob = null;
  }, 60_000);

  runWebsitePing().catch((err: unknown) => logger.error({ err }, 'initial website ping error'));
  runUpdateCheck().catch((err: unknown) => logger.error({ err }, 'initial update check error'));
}

void bootstrap().catch((err) => {
  logger.error({ err }, 'jobs runtime bootstrap failed');
  process.exit(1);
});

async function shutdown(signal: string): Promise<void> {
  shuttingDown = true;
  logger.info(`${signal} received, draining...`);
  if (legacyTimer) clearInterval(legacyTimer);
  if (inflightJob) await inflightJob;
  if (bullmqHandles) await bullmqHandles.close();
  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
