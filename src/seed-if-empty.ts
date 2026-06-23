import { readFileSync } from 'node:fs';
import { pool, query } from './db.js';
import { loadStateInto, SEED_PATH } from './seed.js';
import type { AppState } from '../shared/domain.js';

/**
 * Runs at startup (after migrations). Loads seed/initial-data.json ONLY when the
 * database is empty (no properties), so the first deploy is populated automatically
 * and subsequent deploys never wipe live data. Idempotent and safe to run every boot.
 */
async function run() {
  const r = await query<{ n: number }>('select count(*)::int as n from properties');
  const n = r.rows[0]?.n ?? 0;
  if (n > 0) {
    console.log(`seed-if-empty: ${n} properties already present — skipping seed`);
    await pool.end();
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
    await pool.end();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
