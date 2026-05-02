import type { Config } from 'drizzle-kit';

export default {
  schema: './src/shared/database/schema.ts',
  out: './src/shared/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
} satisfies Config;
