/**
 * Tenant-scoped finance document numbering (UPSERT allocate).
 */
import { sql } from 'kysely';
import type { DbOrTx } from '@vencore/events';
import type { FinanceSeriesKey } from '@vencore/db';
import { DEFAULT_PREFIX_KEYS } from './numbering.constants';

export async function allocateFinanceNumber(
  db: DbOrTx,
  workspaceId: string,
  seriesKey: FinanceSeriesKey,
  prefixOverride?: string,
): Promise<{ number: string; prefix: string; value: number }> {
  const prefix = prefixOverride ?? DEFAULT_PREFIX_KEYS[seriesKey];
  const row = await sql<{ next_value: number; prefix: string }>`
    INSERT INTO finance_number_sequences (workspace_id, series_key, next_value, prefix, updated_at)
    VALUES (${workspaceId}::uuid, ${seriesKey}, 1, ${prefix}, now())
    ON CONFLICT (workspace_id, series_key) DO UPDATE
      SET next_value = finance_number_sequences.next_value + 1,
          updated_at = now()
    RETURNING next_value, prefix
  `.execute(db);

  const allocated = row.rows[0];
  if (!allocated) throw new Error(`finance number sequence allocate failed: ${seriesKey}`);
  return {
    prefix: allocated.prefix,
    value: allocated.next_value,
    number: `${allocated.prefix}${String(allocated.next_value).padStart(4, '0')}`,
  };
}
