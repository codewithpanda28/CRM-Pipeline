/**
 * Native reminder sweep (NOT automation engine).
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { runNativeReminders } from '../lib/reminders/native';
import { logger } from '../lib/logger';

export async function runNativeRemindersJob(db: Kysely<Database>): Promise<void> {
  const result = await runNativeReminders(db);
  logger.info(result, 'reminders.native completed');
}
