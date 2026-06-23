import { readFileSync } from 'node:fs';
import { pool, query } from './db.js';
import { loadStateInto, SEED_PATH } from './seed.js';
import type { AppState } from '../shared/domain.js';

/**
 * Loads seed/initial-data.json ONLY when the database is empty (no properties),
 * so the first deploy is populated automatically and later deploys never wipe
 * live data. Uses the shared pool; does NOT close it. Idempotent.
 */
export async function seedIfEmpty(): Promise<void> {
  const r = await query<{ n: number }>('select count(*)::int as n from properties');
  const n = r.rows[0]?.n ?? 0;
  if (n > 0) {
    console.log(`seed-if-empty: ${n} properties already present — skipping seed`);
    return;
  }
  console.log('seed-if-empty: empty database — loading seed/initial-data.json');
  const raw = JSON.parse(readFileSync(SEED_PATH, 'utf8')) as AppState;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await loadStateInto(client, raw);
    await client.query('COMMIT');
    console.log(`seeded: ${raw.properties.length} properties, ${raw.projects.length} projects, ${raw.gl.length} GL lines`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// CLI entrypoint: seed-if-empty then close the pool.
if (process.argv[1] && (process.argv[1].endsWith('seed-if-empty.ts') || process.argv[1].endsWith('seed-if-empty.js'))) {
  seedIfEmpty().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
