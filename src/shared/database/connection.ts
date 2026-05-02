import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const url = process.env['DATABASE_URL'];
    if (!url) throw new Error('DATABASE_URL environment variable is not set');

    pool = new Pool({
      connectionString: url,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    pool.on('error', (err) => {
      // Unhandled idle client error — log without crashing the process
      process.stderr.write(`PG pool error: ${err.message}\n`);
    });
  }

  return pool;
}

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  return drizzle(getPool(), { schema });
}

export type Db = ReturnType<typeof getDb>;

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
