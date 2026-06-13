import { buildSchema } from 'graphql';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sdl = readFileSync(
  path.join(__dirname, '../src/graphql/schema.graphql'),
  'utf-8',
);

try {
  buildSchema(sdl);
  process.stdout.write('GraphQL schema is valid.\n');
} catch (err) {
  process.stderr.write(`GraphQL schema validation failed: ${String(err)}\n`);
  process.exit(1);
}
