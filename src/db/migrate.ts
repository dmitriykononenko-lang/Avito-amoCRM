import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPool } from './pool.js';

const dir = join(process.cwd(), 'migrations');
const pool = createPool(process.env.DATABASE_URL ?? '');

try {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const done = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [f]);
    if (done.rowCount) continue;
    const sql = await readFile(join(dir, f), 'utf8');
    await pool.query('BEGIN');
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations(name) VALUES ($1) ON CONFLICT DO NOTHING', [f]);
    await pool.query('COMMIT');
    console.log(`applied ${f}`);
  }
} catch (e) {
  await pool.query('ROLLBACK').catch(() => undefined);
  console.error('migration failed:', (e as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
