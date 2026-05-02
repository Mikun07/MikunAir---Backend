import type { Db } from './connection.js';

export type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0];

export async function withTransaction<T>(
  db: Db,
  fn: (trx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(fn);
}
