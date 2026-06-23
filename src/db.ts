import pg from 'pg';
import 'dotenv/config';
import type { AppState, Project, Bid, ProgressNote, CashSnapshot, CashAdjustment, GLLine } from '../shared/domain.js';
import { regionFor, managerFor } from '../shared/domain.js';

// Numerics come back from pg as strings by default; coerce numeric (1700) to JS number.
pg.types.setTypeParser(1700, (v) => (v == null ? null : parseFloat(v)));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');

// Local Postgres (localhost) needs no SSL; hosted providers (Railway, etc.) do.
// Default: SSL on unless the host is localhost/127.0.0.1, or explicitly disabled with PGSSL=false.
function wantSSL(conn: string): boolean {
  if (process.env.PGSSL === 'false') return false;
  if (process.env.PGSSL === 'true') return true;
  try {
    const host = new URL(conn).hostname;
    return !(host === 'localhost' || host === '127.0.0.1' || host === '::1');
  } catch {
    return false;
  }
}
export const pool = new pg.Pool({
  connectionString,
  ssl: wantSSL(connectionString) ? { rejectUnauthorized: false } : undefined,
});

export async function query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
  const r = await pool.query(text, params);
  return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
}

export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/* ---------- Row → domain object mappers ---------- */
const d = (v: any): string => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? '' : String(v));

export function rowToProject(r: any, bids: Bid[] = [], notes: ProgressNote[] = []): Project {
  return {
    id: r.id,
    property: r.property_code,
    region: regionFor(r.property_code),
    manager: managerFor(r.property_code),
    category: r.category,
    name: r.name,
    description: r.description ?? '',
    plan: r.plan ?? '',
    actionItem: r.action_item ?? '',
    contractor: r.contractor ?? '',
    anticipatedCost: r.anticipated_cost,
    actualCost: r.actual_cost,
    dateAdded: r.date_added ? d(r.date_added) : '',
    plannedStart: r.planned_start ? d(r.planned_start) : '',
    plannedEnd: r.planned_end ? d(r.planned_end) : '',
    steps: r.steps || {},
    notes: r.notes ?? '',
    onHold: !!r.on_hold,
    pinned: !!r.pinned,
    inHouse: !!r.in_house,
    ihUnit: r.ih_unit === 'quantity' ? 'quantity' : 'budget',
    totalToComplete: r.total_to_complete,
    amountCompleted: r.amount_completed,
    noContract: !!r.no_contract,
    noContractSet: !!r.no_contract_set,
    bids,
    progressNotes: notes,
  };
}

export function rowToCash(r: any): CashSnapshot {
  return {
    asOfDate: r.as_of_date ? d(r.as_of_date) : undefined,
    cash: r.cash, adjCash: r.adj_cash, spBudget: r.sp_budget, spSpent: r.sp_spent, spRemaining: r.sp_remaining,
    noi: r.noi, ds: r.ds, dcr: r.dcr, marketValue: r.market_value, loanAmount: r.loan_amount, ltv: r.ltv,
    loanDue: r.loan_due ?? '', loanRate: r.loan_rate, ioEnd: r.io_end ?? '',
  };
}

/* ---------- Assemble the full state blob (GET /api/state) ---------- */
export async function assembleState(): Promise<AppState> {
  const [props, projs, bids, notes, cash, adj, gl, meta] = await Promise.all([
    query('select * from properties order by code'),
    query('select * from projects order by id'),
    query('select * from bids order by project_id, slot'),
    query('select * from progress_notes order by project_id, date'),
    query('select * from cash_snapshots'),
    query('select * from cash_adjustments order by date'),
    query('select * from gl_lines order by id'),
    query('select * from app_meta where id=1'),
  ]);

  const bidsByProject = new Map<string, Bid[]>();
  for (const b of bids.rows) {
    const arr = bidsByProject.get(b.project_id) || [];
    arr.push({ id: b.id, contractor: b.contractor ?? '', amount: b.amount, approved: !!b.approved, fileKey: b.file_key, fileName: b.file_name, fileSize: b.file_size });
    bidsByProject.set(b.project_id, arr);
  }
  const notesByProject = new Map<string, ProgressNote[]>();
  for (const n of notes.rows) {
    const arr = notesByProject.get(n.project_id) || [];
    arr.push({ id: n.id, date: d(n.date), note: n.note });
    notesByProject.set(n.project_id, arr);
  }

  const properties = props.rows.map((r) => ({ code: r.code, name: r.name, region: r.region, manager: r.manager, spBudget: r.sp_budget ?? 0, units: r.units ?? 0 }));
  const projects: Project[] = projs.rows.map((r) => rowToProject(r, bidsByProject.get(r.id) || [], notesByProject.get(r.id) || []));

  const cashMap: Record<string, CashSnapshot> = {};
  for (const r of cash.rows) cashMap[r.property_code] = rowToCash(r);

  const cashAdjustments: CashAdjustment[] = adj.rows.map((r) => ({ id: r.id, property: r.property_code, date: d(r.date), amount: Number(r.amount), note: r.note ?? '' }));
  const glLines: GLLine[] = gl.rows.map((r) => ({ id: r.id, property: r.property_code, account: r.account, category: r.category, date: r.date ? d(r.date) : '', vendor: r.vendor, control: r.control, amount: Number(r.amount), remarks: r.remarks, linkedProjectId: r.linked_project_id, partial: !!r.partial }));

  const m = meta.rows[0] || {};
  const metaObj = { version: m.version ?? 1, glPeriod: m.gl_period ?? '', cashAsOf: m.cash_as_of ? d(m.cash_as_of) : '' };

  return { meta: metaObj, properties, cash: cashMap, cashAdjustments, gl: glLines, projects };
}
