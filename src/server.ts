import 'dotenv/config';
import express from 'express';
import { join } from 'node:path';
import { sessionMiddleware, requireAuth, login, logout, status } from './auth.js';
import { api } from './routes.js';
import { runMigrations } from './migrate.js';
import { pool } from './db.js';
import { seedIfEmpty } from './seed-if-empty.js';

// Anchor to the working directory so the path is correct in dev (tsx from src/)
// and in production (compiled to dist/). Railway runs from the repo root.
const publicDir = join(process.cwd(), 'public');

const app = express();
app.set('trust proxy', 1); // Railway terminates TLS in front of us
app.use(express.json({ limit: '30mb' }));
app.use(sessionMiddleware());

// auth endpoints (open)
app.post('/api/login', login);
app.post('/api/logout', logout);
app.get('/api/auth/status', status);
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// everything else under /api requires auth
app.use('/api', requireAuth, api);

// static UI
app.use(express.static(publicDir));
app.get('*', (_req, res) => res.sendFile(join(publicDir, 'index.html')));

// Run DB migrations + first-boot seed in-process, then always start listening.
// Retry a few times in case the database isn't accepting connections yet on a
// fresh deploy. If it never succeeds we still bind the port (so the health check
// passes and the error is visible in logs) rather than crash-looping.
async function start() {
  let initialized = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      // Ensure WVMO extended columns exist — runs every boot, no-op if already present
      await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_budget_item boolean NOT NULL DEFAULT false`);
      await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS linked_budget_item_id uuid`);
      await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS deposit_amount numeric`);
      await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS deposit_paid boolean NOT NULL DEFAULT false`);
      await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS deposit_gl_line_id text`);
      await pool.query(`ALTER TABLE gl_lines ADD COLUMN IF NOT EXISTS ignored boolean NOT NULL DEFAULT false`);
      await pool.query(`ALTER TABLE gl_lines ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false`);
      await pool.query(`ALTER TABLE gl_lines ADD COLUMN IF NOT EXISTS is_new boolean NOT NULL DEFAULT false`);
      await runMigrations();
      await seedIfEmpty();
      initialized = true;
      break;
    } catch (e) {
      console.error(`DB init attempt ${attempt}/5 failed:`, e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  if (!initialized) console.error('DB init did not complete — starting server anyway; API calls will error until the database is reachable.');

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => console.log(`ND SP Tracker listening on :${port}`));
}
start();
