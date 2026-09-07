import type { Kysely, Transaction } from 'kysely';
import type { Database } from '@vencore/db';
import { EventRecorder, type DbOrTx } from './recorder';

export type { DbOrTx };

/** True when `db` is already a Kysely transaction. */
export function isTransaction(db: DbOrTx): db is Transaction<Database> {
  return Boolean((db as Transaction<Database>).isTransaction);
}

/**
 * Canonical unit-of-work: business mutations + EventRecorder share ONE SQL transaction.
 * Domain code must append outbox via the provided recorder / trx — never after commit
 * for critical asynchronous side effects (ADR-019).
 */
export async function withUnitOfWork<T>(
  db: Kysely<Database>,
  fn: (trx: Transaction<Database>, recorder: EventRecorder) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (trx) => {
    const recorder = EventRecorder.forTransaction(trx);
    return fn(trx, recorder);
  });
}

/**
 * Run `fn` on an existing transaction, or open a new unit-of-work if `db` is the root connection.
 */
export async function withExistingOrNewTransaction<T>(
  db: DbOrTx,
  fn: (trx: Transaction<Database>, recorder: EventRecorder) => Promise<T>,
): Promise<T> {
  if (isTransaction(db)) {
    return fn(db, EventRecorder.forTransaction(db));
  }
  return withUnitOfWork(db, fn);
}
