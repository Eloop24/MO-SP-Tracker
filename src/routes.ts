import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type pg from 'pg';
import { pool, query, tx, assembleState, rowToProject } from './db.js';
import { loadStateInto } from './seed.js';
import { parseGL, parseCushion } from './importers.js';
import { buildContract, type ContractVars, type BidAttachment } from './contract.js';
import { applyCostRules, uid, STEP_KEYS, CONTRACT_STEPS, type Project, type AppState } from '../shared/domain.js';

export const api = Router();

const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Files are stored in Postgres (so they persist across redeploys with no volume).
async function storeFile(name: string, mime: string, buffer: Buffer): Promise<string> {
  const key = `${randomUUID()}${extname(name) || ''}`;
  await query('insert into files(key,name,mime,size,bytes) values($1,$2,$3,$4,$5)', [key, name, mime || 'application/octet-stream', buffer.length, buffer]);
  return key;
}
async function readFile(key: string): Promise<{ name: string; mime: string; bytes: Buffer } | null> {
  const r = await query<{ name: string; mime: string; bytes: Buffer }>('select name,mime,bytes from files where key=$1', [key]);
  return r.rows[0] || null;
}

const nnull = (v: any): number | null => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));
const dnull = (v: any): string | null => {
  if (v == null || v === '') return null;
  const raw = String(v).trim();
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // MM/DD/YYYY -> YYYY-MM-DD
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const s = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/* ---------- bootstrap ---------- */
api.get('/state', async (_req, res) => { res.json(await assembleState()); });

/* ---------- projects ---------- */
async function writeProject(client: pg.PoolClient, p: Project, isNew: boolean): Promise<void> {
  // Server recomputes derived rules: cost→planned tick + no-contract auto-default (spec §10.4).
  applyCostRules(p);
  const cols = [
    p.property, p.category || 'GENERAL', p.name || '(untitled)', p.description || '', p.plan || '', p.actionItem || '',
    p.contractor || '', nnull(p.anticipatedCost), nnull(p.actualCost), dnull(p.dateAdded), dnull(p.plannedStart), dnull(p.plannedEnd),
    JSON.stringify(p.steps || {}), p.notes || '', !!p.onHold, !!p.pinned, !!p.inHouse, p.ihUnit === 'quantity' ? 'quantity' : 'budget',
    nnull(p.totalToComplete), nnull(p.amountCompleted), !!p.noContract, !!p.noContractSet,
  ];
  if (isNew) {
    await client.query(
      `insert into projects(property_code,category,name,description,plan,action_item,contractor,anticipated_cost,actual_cost,
         date_added,planned_start,planned_end,steps,notes,on_hold,pinned,in_house,ih_unit,total_to_complete,amount_completed,
         no_contract,no_contract_set,id)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
      [...cols, p.id]
    );
  } else {
    await client.query(
      `update projects set property_code=$1,category=$2,name=$3,description=$4,plan=$5,action_item=$6,contractor=$7,
         anticipated_cost=$8,actual_cost=$9,date_added=$10,planned_start=$11,planned_end=$12,steps=$13,notes=$14,on_hold=$15,
         pinned=$16,in_house=$17,ih_unit=$18,total_to_complete=$19,amount_completed=$20,no_contract=$21,no_contract_set=$22,
         updated_at=now() where id=$23`,
      [...cols, p.id]
    );
  }
  // sync bids + progress notes (record-level)
  await client.query('delete from bids where project_id=$1', [p.id]);
  let slot = 0;
  for (const b of p.bids || []) {
    await client.query(
      `insert into bids(id,project_id,slot,contractor,amount,approved,file_key,file_name,file_size) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [b.id || `${p.id}-b${slot}`, p.id, slot, b.contractor || '', nnull(b.amount), !!b.approved, b.fileKey || null, b.fileName || null, b.fileSize || null]
    );
    slot++;
  }
  await client.query('delete from progress_notes where project_id=$1', [p.id]);
  for (const n of p.progressNotes || []) {
    await client.query('insert into progress_notes(id,project_id,date,note) values($1,$2,$3,$4)',
      [n.id || uid('N'), p.id, dnull(n.date), n.note || '']);
  }
}

api.post('/projects', async (req, res) => {
  const p = req.body as Project;
  if (!p || !p.property || !p.name) return res.status(400).json({ error: 'property and name are required' });
  p.id = p.id || uid('P');
  p.dateAdded = p.dateAdded || new Date().toISOString().slice(0, 10);
  await tx((c) => writeProject(c, p, true));
  const r = await query('select * from projects where id=$1', [p.id]);
  res.json(rowToProject(r.rows[0], p.bids || [], p.progressNotes || []));
});

api.patch('/projects/:id', async (req, res) => {
  const existing = await query('select id from projects where id=$1', [req.params.id]);
  if (!existing.rowCount) return res.status(404).json({ error: 'not found' });
  const p = { ...(req.body as Project), id: req.params.id };
  if (!p.property || !p.name) return res.status(400).json({ error: 'property and name are required' });
  await tx((c) => writeProject(c, p, false));
  const r = await query('select * from projects where id=$1', [p.id]);
  res.json(rowToProject(r.rows[0], p.bids || [], p.progressNotes || []));
});

api.delete('/projects/:id', async (req, res) => {
  await query('delete from projects where id=$1', [req.params.id]);
  res.json({ ok: true });
});

/* ---------- bid file upload / download (stored in Postgres) ---------- */
api.post('/projects/:id/bids/:slot/file', memUpload.single('file'), async (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'no file' });
  const key = await storeFile(f.originalname, f.mimetype, f.buffer);
  res.json({ fileKey: key, fileName: f.originalname, fileSize: f.size });
});

api.get('/bids/file/:key', async (req, res) => {
  const r = await readFile(req.params.key);
  if (!r) return res.status(404).send('not found');
  res.setHeader('Content-Type', r.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline');
  res.send(r.bytes);
});

// Download a stored file (used for generated contracts). ?name sets the filename.
api.get('/files/:key', async (req, res) => {
  const r = await readFile(req.params.key);
  if (!r) return res.status(404).send('not found');
  const name = String(req.query.name || r.name || 'file').replace(/[^a-zA-Z0-9._ -]/g, '');
  res.setHeader('Content-Type', r.mime || 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(r.bytes);
});

/* ---------- Generate Independent Contractor Agreement (spec: Contract_Generation_Workflow) ---------- */
function monarchFileName(code: string, effectiveDate: string, contractorName: string, total: number | null, scope: string, status: 'Unexecuted' | 'Full Executed'): string {
  const d = String(effectiveDate || '');
  let year = new Date().getFullYear().toString();
  let mmdd = '0101';
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const mdy = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (iso) { year = iso[1]; mmdd = iso[2] + iso[3]; }
  else if (mdy) { year = mdy[3]; mmdd = mdy[1].padStart(2, '0') + mdy[2].padStart(2, '0'); }
  const contractor = (String(contractorName || '').trim().split(/\s+/)[0] || 'Contractor');
  const amtK = total != null ? String(Math.round(Number(total) / 1000)) : '0';
  const scopeClean = String(scope || '').replace(/[\/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return `${year} ${mmdd} ${code} ${contractor} ${amtK} ${scopeClean} ${status} CA.pdf`;
}

api.post('/projects/:id/contract', async (req, res) => {
  const projRow = await query('select * from projects where id=$1', [req.params.id]);
  if (!projRow.rowCount) return res.status(404).json({ error: 'project not found' });
  const proj = projRow.rows[0];
  const b = req.body || {};
  const vars: ContractVars = {
    effectiveDate: b.effectiveDate || '', termEndDate: b.termEndDate || '', ownerEntity: b.ownerEntity || '',
    contractorName: b.contractorName || '', propertyName: b.propertyName || '', propertyAddr: b.propertyAddr || '',
    ownerNoticeAddr: b.ownerNoticeAddr || b.propertyAddr || '', contractorAddr: b.contractorAddr || '', contractTotal: b.contractTotal || '',
    dailyReduction: b.dailyReduction || '', workDays: b.workDays || '', workHours: b.workHours || '',
  };
  if (!vars.ownerEntity || !vars.contractorName || !vars.contractTotal) return res.status(400).json({ error: 'ownerEntity, contractorName and contractTotal are required' });

  // Gather bid attachments for this project (approved first), reading files from storage.
  const bidsRows = (await query('select * from bids where project_id=$1 order by approved desc, slot asc', [proj.id])).rows;
  const attachments: BidAttachment[] = [];
  for (const bd of bidsRows) {
    if (!bd.file_key) continue;
    const fr = await readFile(bd.file_key);
    if (fr) attachments.push({ buffer: fr.bytes, name: bd.file_name || bd.file_key });
  }

  let pdf: Uint8Array;
  try { pdf = await buildContract(vars, attachments); }
  catch (e: any) { return res.status(500).json({ error: 'contract build failed: ' + (e?.message || e) }); }

  // Filename: YYYY MMDD PropertyCode ContractorFirst AmtK Scope Unexecuted CA.pdf
  const propRow = (await query('select contract_code from properties where code=$1', [proj.property_code])).rows[0];
  const code = (propRow?.contract_code || proj.property_code);
  const total = nnull(String(vars.contractTotal).replace(/[^0-9.\-]/g, ''));
  const fileName = monarchFileName(code, vars.effectiveDate, vars.contractorName, total, b.scope || proj.name || '', 'Unexecuted');
  const fileKey = await storeFile(fileName, 'application/pdf', Buffer.from(pdf));

  await tx(async (c) => {
    // attach the contract to the project
    let steps = proj.steps || {};
    if (b.tickStep !== false) {
      steps = { ...steps, contractGenerated: true };
      // cascade up: completing a post-approval step implies earlier non-N/A steps
      const noContract = !!proj.no_contract;
      STEP_KEYS.slice(0, STEP_KEYS.indexOf('contractGenerated')).forEach((k) => {
        if (!(noContract && CONTRACT_STEPS.includes(k))) steps[k] = true;
      });
    }
    await c.query('update projects set contract_file_key=$1, contract_file_name=$2, steps=$3, updated_at=now() where id=$4',
      [fileKey, fileName, JSON.stringify(steps), proj.id]);
    // record the contract in the contracts table
    await c.query(
      `insert into contracts(id,project_id,property_code,output_filename,owner_entity,contractor,total,effective_date,term_end,scope,file_key)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [uid('C'), proj.id, proj.property_code, fileName, vars.ownerEntity, vars.contractorName, total, dnull(vars.effectiveDate), dnull(vars.termEndDate), b.scope || proj.name || '', fileKey]
    );
    // remember legal fields on the property for next time
    if (b.rememberProperty !== false) {
      await c.query('update properties set owner_entity=$1, address=$2, owner_notice_addr=$3 where code=$4',
        [vars.ownerEntity, vars.propertyAddr, vars.ownerNoticeAddr, proj.property_code]);
    }
  });

  res.json({ contractFileKey: fileKey, contractFileName: fileName, downloadUrl: `/api/files/${fileKey}?name=${encodeURIComponent(fileName)}` });
});

/* ---------- Delete a contract record ---------- */
api.delete('/contracts/:id', async (req, res) => {
  const cRow = (await query('select * from contracts where id=$1', [req.params.id])).rows[0];
  if (!cRow) return res.status(404).json({ error: 'not found' });
  await tx(async (c) => {
    await c.query('delete from contracts where id=$1', [req.params.id]);
    // If this was the project's active contract, point to next most recent or clear
    if (cRow.project_id) {
      const remaining = (await c.query('select file_key, output_filename from contracts where project_id=$1 order by created_at desc limit 1', [cRow.project_id])).rows[0];
      await c.query('update projects set contract_file_key=$1, contract_file_name=$2, updated_at=now() where id=$3',
        [remaining?.file_key || null, remaining?.output_filename || null, cRow.project_id]);
    }
  });
  res.json({ ok: true });
});

/* ---------- Upload countersigned (executed) contract ---------- */
api.post('/projects/:id/contract/upload', memUpload.single('file'), async (req, res) => {
  const projRow = await query('select * from projects where id=$1', [req.params.id]);
  if (!projRow.rowCount) return res.status(404).json({ error: 'project not found' });
  const proj = projRow.rows[0];
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'no file' });

  const propRow = (await query('select contract_code from properties where code=$1', [proj.property_code])).rows[0];
  const code = propRow?.contract_code || proj.property_code;

  // Derive naming data from most recent contract record (or fall back to project)
  const cRow = (await query('select * from contracts where project_id=$1 order by created_at desc limit 1', [proj.id])).rows[0];
  const contractor = cRow?.contractor || proj.contractor || '';
  const total = cRow?.total != null ? Number(cRow.total) : (proj.anticipated_cost != null ? Number(proj.anticipated_cost) : null);
  const scope = cRow?.scope || proj.name || '';
  const effectiveDate = cRow?.effective_date ? new Date(cRow.effective_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

  const fileName = monarchFileName(code, effectiveDate, contractor, total, scope, 'Full Executed');
  const fileKey = await storeFile(fileName, f.mimetype || 'application/pdf', f.buffer);

  await tx(async (c) => {
    if (cRow) {
      // Replace the existing contract record's file with the executed version
      await c.query('update contracts set file_key=$1, output_filename=$2 where id=$3', [fileKey, fileName, cRow.id]);
    } else {
      await c.query(
        `insert into contracts(id,project_id,property_code,output_filename,contractor,total,scope,file_key)
         values($1,$2,$3,$4,$5,$6,$7,$8)`,
        [uid('C'), proj.id, proj.property_code, fileName, contractor, total, scope, fileKey]
      );
    }
    // Auto-tick signed + contractSaved, cascade all prior steps
    let steps: Record<string, boolean> = {};
    try { steps = typeof proj.steps === 'string' ? JSON.parse(proj.steps) : (proj.steps || {}); } catch { steps = {}; }
    const savedIdx = STEP_KEYS.indexOf('contractSaved');
    STEP_KEYS.slice(0, savedIdx + 1).forEach(k => {
      if (!proj.no_contract || !CONTRACT_STEPS.includes(k)) steps[k] = true;
    });
    steps['signed'] = true;
    steps['contractSaved'] = true;
    await c.query('update projects set contract_file_key=$1, contract_file_name=$2, steps=$3, updated_at=now() where id=$4',
      [fileKey, fileName, JSON.stringify(steps), proj.id]);
  });

  res.json({ fileKey, fileName, downloadUrl: `/api/files/${fileKey}?name=${encodeURIComponent(fileName)}` });
});

/* ---------- Upload lien waiver ---------- */
api.post('/projects/:id/lien/upload', memUpload.single('file'), async (req, res) => {
  const projRow = await query('select * from projects where id=$1', [req.params.id]);
  if (!projRow.rowCount) return res.status(404).json({ error: 'project not found' });
  const proj = projRow.rows[0];
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'no file' });

  const propRow = (await query('select contract_code from properties where code=$1', [proj.property_code])).rows[0];
  const code = propRow?.contract_code || proj.property_code;
  const today = new Date().toISOString().slice(0, 10);
  const contractor = proj.contractor || '';
  const total = proj.anticipated_cost != null ? Number(proj.anticipated_cost) : null;
  const fileName = monarchFileName(code, today, contractor, total, proj.name || '', 'Full Executed').replace('Full Executed CA.pdf', 'Lien Waiver.pdf');
  const fileKey = await storeFile(fileName, f.mimetype || 'application/pdf', f.buffer);

  // Tick ONLY lienWaiver — no cascade (lien waivers often arrive before work is complete)
  const steps: Record<string, boolean> = Object.assign({}, proj.steps || {});
  steps['lienWaiver'] = true;

  await tx(async (c) => {
    await c.query('update projects set lien_file_key=$1, lien_file_name=$2, steps=$3, updated_at=now() where id=$4',
      [fileKey, fileName, JSON.stringify(steps), proj.id]);
  });

  res.json({ fileKey, fileName, downloadUrl: `/api/files/${fileKey}?name=${encodeURIComponent(fileName)}` });
});

/* ---------- cash snapshot (mid-month edit) ---------- */
api.patch('/cash/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const c = req.body || {};
  await query(
    `insert into cash_snapshots(property_code,as_of_date,cash,adj_cash,sp_budget,sp_spent,sp_remaining,noi,ds,dcr,market_value,loan_amount,ltv,loan_due,loan_rate,io_end)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     on conflict (property_code) do update set as_of_date=excluded.as_of_date,cash=excluded.cash,adj_cash=excluded.adj_cash,
       sp_budget=excluded.sp_budget,sp_spent=excluded.sp_spent,sp_remaining=excluded.sp_remaining,noi=excluded.noi,ds=excluded.ds,
       dcr=excluded.dcr,market_value=excluded.market_value,loan_amount=excluded.loan_amount,ltv=excluded.ltv,loan_due=excluded.loan_due,
       loan_rate=excluded.loan_rate,io_end=excluded.io_end`,
    [code, dnull(c.asOfDate), nnull(c.cash), nnull(c.adjCash), nnull(c.spBudget), nnull(c.spSpent), nnull(c.spRemaining),
     nnull(c.noi), nnull(c.ds), nnull(c.dcr), nnull(c.marketValue), nnull(c.loanAmount), nnull(c.ltv), c.loanDue || '', nnull(c.loanRate), c.ioEnd || '']
  );
  res.json({ ok: true });
});

/* ---------- cash adjustments (mid-month deltas, preserved across imports) ---------- */
api.post('/cash-adjustments', async (req, res) => {
  const a = req.body || {};
  if (!a.property || a.amount == null) return res.status(400).json({ error: 'property and amount required' });
  const id = uid('A');
  await query('insert into cash_adjustments(id,property_code,date,amount,note) values($1,$2,$3,$4,$5)',
    [id, a.property, dnull(a.date) || new Date().toISOString().slice(0, 10), Number(a.amount) || 0, a.note || '']);
  res.json({ id, property: a.property, date: dnull(a.date), amount: Number(a.amount) || 0, note: a.note || '' });
});
api.delete('/cash-adjustments/:id', async (req, res) => {
  await query('delete from cash_adjustments where id=$1', [req.params.id]);
  res.json({ ok: true });
});

/* ---------- GL link / partial ---------- */
api.patch('/gl/:id/link', async (req, res) => {
  const { linkedProjectId, partial } = req.body || {};
  await query('update gl_lines set linked_project_id=$1, partial=$2 where id=$3',
    [linkedProjectId || null, !!partial, req.params.id]);
  res.json({ ok: true });
});

/* ---------- imports: preview + confirm (server-side parse, spec §8/§10.4) ---------- */
interface Pending { kind: 'gl' | 'cushion'; data: any; ts: number; }
const pending = new Map<string, Pending>();
function stash(kind: 'gl' | 'cushion', data: any): string {
  const token = randomUUID();
  pending.set(token, { kind, data, ts: Date.now() });
  // expire entries older than 30 min
  for (const [k, v] of pending) if (Date.now() - v.ts > 30 * 60 * 1000) pending.delete(k);
  return token;
}

api.post('/import/gl', memUpload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const { tx, period, byProperty } = parseGL(req.file.buffer);
    if (!tx.length) return res.status(400).json({ error: 'No SP ledger lines found — check the file format.' });
    const token = stash('gl', { tx, period });
    res.json({ token, count: tx.length, period, byProperty });
  } catch (e: any) { res.status(400).json({ error: e.message || 'parse error' }); }
});

api.post('/import/gl/confirm', async (req, res) => {
  const p = pending.get(req.body?.token);
  if (!p || p.kind !== 'gl') return res.status(400).json({ error: 'preview expired — re-upload' });
  const { tx: lines, period } = p.data;
  await tx(async (c) => {
    await c.query('truncate gl_lines');
    for (const g of lines) {
      await c.query(
        `insert into gl_lines(id,property_code,account,category,date,vendor,control,amount,remarks,linked_project_id,partial)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,null,false)`,
        [g.id, g.property, g.account || null, g.category || null, dnull(g.date), g.vendor || null, g.control || null, Number(g.amount) || 0, g.remarks || null]
      );
    }
    if (period) await c.query('update app_meta set gl_period=$1 where id=1', [period]);
  });
  pending.delete(req.body.token);
  res.json({ ok: true, count: lines.length });
});

api.post('/import/cushion', memUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const metaRow = await query('select cash_as_of from app_meta where id=1');
    const fallback = metaRow.rows[0]?.cash_as_of ? new Date(metaRow.rows[0].cash_as_of).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const { found, asOf } = parseCushion(req.file.buffer, fallback);
    const token = stash('cushion', { found, asOf });
    res.json({ token, count: Object.keys(found).length, asOf, found });
  } catch (e: any) { res.status(400).json({ error: e.message || 'parse error' }); }
});

api.post('/import/cushion/confirm', async (req, res) => {
  const p = pending.get(req.body?.token);
  if (!p || p.kind !== 'cushion') return res.status(400).json({ error: 'preview expired — re-upload' });
  const { found, asOf } = p.data;
  await tx(async (c) => {
    for (const code of Object.keys(found)) {
      const v = found[code];
      // cushion import upserts snapshot + property sp_budget/units; must NOT touch cash_adjustments (spec §8.2)
      await c.query(
        `insert into cash_snapshots(property_code,as_of_date,cash,adj_cash,sp_budget,sp_spent,sp_remaining,noi,ds,dcr,market_value,loan_amount,ltv,loan_due,loan_rate,io_end)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         on conflict (property_code) do update set as_of_date=excluded.as_of_date,cash=excluded.cash,adj_cash=excluded.adj_cash,
           sp_budget=excluded.sp_budget,sp_spent=excluded.sp_spent,sp_remaining=excluded.sp_remaining,noi=excluded.noi,ds=excluded.ds,
           dcr=excluded.dcr,market_value=excluded.market_value,loan_amount=excluded.loan_amount,ltv=excluded.ltv,loan_due=excluded.loan_due,
           loan_rate=excluded.loan_rate,io_end=excluded.io_end`,
        [code, dnull(asOf), nnull(v.cash), nnull(v.adjCash), nnull(v.spBudget), nnull(v.spSpent), nnull(v.spRemaining),
         nnull(v.noi), nnull(v.ds), nnull(v.dcr), nnull(v.marketValue), nnull(v.loanAmount), nnull(v.ltv), v.loanDue || '', nnull(v.loanRate), v.ioEnd || '']
      );
      if (v.spBudget != null) await c.query('update properties set sp_budget=$1 where code=$2', [Number(v.spBudget), code]);
      if (v.units != null && v.units) await c.query('update properties set units=$1 where code=$2', [Number(v.units), code]);
    }
    await c.query('update app_meta set cash_as_of=$1 where id=1', [dnull(asOf)]);
  });
  pending.delete(req.body.token);
  res.json({ ok: true, count: Object.keys(found).length });
});

/* ---------- exports ---------- */
api.get('/export/backup.json', async (_req, res) => {
  const state = await assembleState();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="nd-sp-tracker-${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify(state, null, 2));
});

api.get('/export/projects.csv', async (_req, res) => {
  const state = await assembleState();
  const cols = ['property', 'region', 'category', 'name', 'contractor', 'anticipatedCost', 'actualCost', 'dateAdded', 'onHold', ...STEP_KEYS];
  const lines = [cols.join(',')];
  for (const p of state.projects) {
    lines.push(cols.map((cc) => {
      let v: any = STEP_KEYS.includes(cc) ? (p.steps && (p.steps as any)[cc] ? 1 : 0) : (p as any)[cc];
      v = v == null ? '' : String(v).replace(/"/g, '""');
      return /[",\n]/.test(v) ? `"${v}"` : v;
    }).join(','));
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="nd-sp-projects-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(lines.join('\n'));
});

/* ---------- reset to seed / restore from backup ---------- */
api.post('/reset', async (_req, res) => {
  const { readFileSync } = await import('node:fs');
  const { SEED_PATH } = await import('./seed.js');
  const raw = JSON.parse(readFileSync(SEED_PATH, 'utf8')) as AppState;
  await tx((c) => loadStateInto(c, raw));
  res.json({ ok: true });
});

api.post('/restore', async (req, res) => {
  const state = req.body as AppState;
  if (!state || !state.properties || !state.projects) return res.status(400).json({ error: 'not a valid backup' });
  await tx((c) => loadStateInto(c, state));
  res.json({ ok: true });
});
