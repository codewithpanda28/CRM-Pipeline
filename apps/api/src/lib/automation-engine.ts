import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import { resolveJobsRuntime } from '@vencore/job-runtime'
import { evaluatePmAutomationEvent, type PMEvent } from '@vencore/automation'
import { pmEvents } from './pm-events'
import { logger } from './logger'

export { evaluatePmAutomationEvent, executeActions } from '@vencore/automation'
export type { PMEvent } from '@vencore/automation'

/**
 * JOBS_RUNTIME=bullmq: in-process listener disabled — outbox → automation.pm.evaluate.
 * JOBS_RUNTIME=legacy: sync EventEmitter path (staging rollback only).
 */
export function initAutomationEngine(db: Kysely<Database>): void {
  if (resolveJobsRuntime(process.env['JOBS_RUNTIME']) === 'bullmq') {
    logger.info('PM automation: outbox/BullMQ path — in-process pmEvents listener disabled')
    return
  }

  logger.warn('JOBS_RUNTIME=legacy — PM automation using in-process pmEvents listener')
  pmEvents.on('pm', async (event: PMEvent) => {
    try {
      await evaluatePmAutomationEvent(db, event, { logger })
    } catch (err) {
      logger.error({ err }, 'automation engine error')
    }
  })
}
