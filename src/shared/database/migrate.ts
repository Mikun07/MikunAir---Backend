import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigrations(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL environment variable is not set');

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  const migrationsFolder = path.join(__dirname, 'migrations');

  process.stdout.write('Running database migrations...\n');
  await migrate(db, { migrationsFolder });
  process.stdout.write('Migrations complete.\n');

  await pool.end();
}

try {
  await runMigrations();
} catch (err) {
  process.stderr.write(`Migration failed: ${String(err)}\n`);
  process.exit(1);
}
