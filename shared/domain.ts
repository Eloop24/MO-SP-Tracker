/* =============================================================================
   ND SPECIAL-PROJECTS / CAPEX TRACKER — SHARED DOMAIN MODULE
   -----------------------------------------------------------------------------
   This is the contract. Every classification and money rule lives here and is
   imported by BOTH the server (src/) and the browser (public/, via the esbuild
   bundle public/domain.js). If these change, the numbers stop matching the
   team's reconciliation against Yardi. Ported verbatim from ND_SP_Tracker_10.
   See SP_Tracker_Spec_for_Railway.md §§4–7 and §10.3.
   ============================================================================= */

/* ---------- Types ---------- */
export interface Bid {
  id: string;
  contractor: string;
  amount: number | null;
  approved: boolean;
  fileKey?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}
export interface ProgressNote { id: string; date: string; note: string; }
export interface Steps { [key: string]: boolean; }

export interface Project {
  id: string;
  property: string;
  region?: string;
  manager?: string;
  category: string;
  name: string;
  description?: string;
  plan?: string;
  actionItem?: string;
  contractor?: string;
  anticipatedCost?: number | null;
  actualCost?: number | null;
  dateAdded?: string;
  plannedStart?: string;
  plannedEnd?: string;
  bids?: Bid[];
  steps?: Steps;
  notes?: string;
  onHold?: boolean;
  pinned?: boolean;
  inHouse?: boolean;
  ihUnit?: 'budget' | 'quantity';
  totalToComplete?: number | null;
  amountCompleted?: number | null;
  progressNotes?: ProgressNote[];
  noContract?: boolean;
  noContractSet?: boolean;
  contractFileKey?: string | null;
  contractFileName?: string | null;
}

export interface Property {
  code: string;
  name: string;
  region: string;
  manager: string;
  spBudget?: number;
  units?: number;
  ownerEntity?: string;
  address?: string;
  ownerNoticeAddr?: string;
  contractCode?: string;
}

export interface ContractRecord {
  id: string;
  projectId?: string | null;
  property: string;
  outputFilename: string;
  ownerEntity?: string;
  contractor?: string;
  total?: number | null;
  effectiveDate?: string;
  termEnd?: string;
  scope?: string;
  fileKey?: string | null;
  createdAt?: string;
}

export interface CashSnapshot {
  asOfDate?: string;
  cash?: number | null;
  adjCash?: number | null;
  spBudget?: number | null;
  spSpent?: number | null;
  spRemaining?: number | null;
  noi?: number | null;
  ds?: number | null;
  dcr?: number | null;
  marketValue?: number | null;
  loanAmount?: number | null;
  ltv?: number | null;
  loanDue?: string;
  loanRate?: number | null;
  ioEnd?: string;
}

export interface CashAdjustment {
  id: string;
  property: string;
  date: string;
  amount: number;
  note?: string;
}

export interface GLLine {
  id: string;
  property: string;
  account?: string;
  category?: string;
  date?: string;
  vendor?: string;
  control?: string;
  amount: number;
  remarks?: string;
  linkedProjectId?: string | null;
  partial?: boolean;
}

export interface AppState {
  meta: Record<string, any>;
  properties: Property[];
  cash: Record<string, CashSnapshot>;
  cashAdjustments: CashAdjustment[];
  gl: GLLine[];
  projects: Project[];
  contracts?: ContractRecord[];
}

/* ---------- Lifecycle (the 12 steps from the workflow brief) ---------- */
export const LIFECYCLE = [
  { key: 'planned',           label: 'Planned',                short: 'Plan', desc: 'Scope, anticipated cost and planned timing captured.' },
  { key: 'gotBids',           label: 'Bids Received',          short: 'Bids', desc: 'Bids collected (3 is standard; not always required).' },
  { key: 'approved',          label: 'Bid Approved',           short: 'Appr', desc: 'One bid selected and approved.' },
  { key: 'contractGenerated', label: 'Contract Generated',     short: 'Ctrct', desc: 'Contract drafted to the approved bid and sent to the contractor.' },
  { key: 'signed',            label: 'Signed & Countersigned', short: 'Sign', desc: 'Contractor signed; we countersigned and returned.' },
  { key: 'contractSaved',     label: 'Contract Filed',         short: 'File', desc: 'Executed contract saved in the property SharePoint folder.' },
  { key: 'workStarted',       label: 'Work Started',           short: 'Start', desc: 'Work underway (may run in phases).' },
  { key: 'workCompleted',     label: 'Work Completed',         short: 'Done', desc: 'Contractor completed the work or phase.' },
  { key: 'paid',              label: 'Work Paid For',          short: 'Paid', desc: 'Invoice paid (confirmed by the general ledger).' },
  { key: 'completed',         label: 'Completed',              short: '✓',    desc: 'Work closed out; reflected in the financial statements.' },
  { key: 'lienWaiver',        label: 'Lien Waiver Received',   short: 'Lien', desc: 'Contractor returned the lien waiver.' },
  { key: 'lienSaved',         label: 'Waiver Filed',           short: 'WFile', desc: 'Lien waiver saved in the same SharePoint folder.' },
] as const;

export const STEP_KEYS: string[] = LIFECYCLE.map(s => s.key);
export const CONTRACT_STEPS = ['contractGenerated', 'signed', 'contractSaved'];
export const APPROVED_IDX = STEP_KEYS.indexOf('approved'); // workflow "lock-in" point (2)
export const OVER_THRESHOLD = 5000;                        // $5K threshold (3 uses, see spec §7.5)

export const CATEGORIES = ['APPLIANCES', 'BUILDING REPAIRS', 'CABINETS/COUNTERTOPS', 'CARPETS/VINYL', 'COMMON AREA UPGRADES', 'Concrete/Asphalt', 'DOORS/WINDOWS', 'DRAPES/BLINDS', 'ELECTRICAL - EXTERIOR', 'ELECTRICAL - INTERIOR', 'ELEVATORS', 'FENCING', 'FIRE', 'FURNITURE/EQUIPMENT', 'GENERAL', 'HVAC', 'INSPECTION EXPENSES', 'JANITORIAL', 'LABOR', 'LANDSCAPING', 'OTHER', 'PAINTING - EXTERIOR', 'PAINTING - INTERIOR', 'PARKING', 'PLUMBING', 'POOL', 'REPAIR DOWN UNITS', 'ROOFING', 'SECURITY CAMERA', 'SIGNAGE', 'SUPPLIES', 'UNIT AMENITIES/UPGRADES', 'WOOD REPLACEMENT'];

/* ---------- Portfolio reference data (spec §2) ----------
   PROPERTIES, PCOLOR, and PORTFOLIO_TITLE are loaded from portfolios/<name>.ts
   at build time. Set the PORTFOLIO environment variable to select a portfolio
   (e.g. PORTFOLIO=mo or PORTFOLIO=nd). Defaults to 'mo'.
   To add a new portfolio, create portfolios/<name>.ts with the same exports. */

import { PROPERTIES as MO_PROPS, PCOLOR as MO_COLORS, PORTFOLIO_TITLE as MO_TITLE } from '../portfolios/mo.js';
import { PROPERTIES as ND_PROPS, PCOLOR as ND_COLORS, PORTFOLIO_TITLE as ND_TITLE } from '../portfolios/nd.js';

const _p = (typeof process !== 'undefined' ? process.env?.PORTFOLIO : undefined) || 'mo';
export const PROPERTIES: Property[] = _p === 'nd' ? ND_PROPS : MO_PROPS;
export const PCOLOR: Record<string, string> = _p === 'nd' ? ND_COLORS : MO_COLORS;
export const PORTFOLIO_TITLE: string = _p === 'nd' ? ND_TITLE : MO_TITLE;
export const pcolor = (code: string): string => PCOLOR[code] || '#7a8190';

/* Map a property code to its region/manager (derived on save, spec §2). */
export function regionFor(code: string): string { return PROPERTIES.find(p => p.code === code)?.region || ''; }
export function managerFor(code: string): string { return PROPERTIES.find(p => p.code === code)?.manager || ''; }

/* ---------- Lifecycle / step helpers (spec §5) ---------- */
export const naKeys = (p: Project): string[] => (p.noContract ? CONTRACT_STEPS : []);
export const isNA = (p: Project, key: string): boolean => !!p.noContract && CONTRACT_STEPS.includes(key);
export const appKeys = (p: Project): string[] => { const na = naKeys(p); return STEP_KEYS.filter(k => !na.includes(k)); };
export const appLifecycle = (p: Project) => { const na = naKeys(p); return LIFECYCLE.filter(s => !na.includes(s.key)); };

/** index of furthest completed GLOBAL step (0–11), used by the dashboard funnel */
export function stage(p: Project): number { let last = -1; STEP_KEYS.forEach((k, i) => { if (p.steps && p.steps[k]) last = i; }); return last; }
/** applicable steps only (N/A excluded) so progress bars rescale */
export function stepsDone(p: Project): number { return appKeys(p).filter(k => p.steps && p.steps[k]).length; }
export function stepsTotal(p: Project): number { return appKeys(p).length; }

export const isApproved = (p: Project): boolean => !!(p.steps && p.steps.approved);
export const isPaidP = (p: Project): boolean => !!(p.steps && p.steps.paid);
export const hasCost = (p: Project): boolean => p.anticipatedCost != null || p.actualCost != null;
/** actualCost overrides anticipatedCost everywhere money is summed (spec §5.4) */
export const projOutflow = (p: Project): number => p.actualCost != null ? Number(p.actualCost) : (p.anticipatedCost != null ? Number(p.anticipatedCost) : 0);

export function isComplete(p: Project): boolean {
  if (p.inHouse) { const t = Number(p.totalToComplete) || 0, d = Number(p.amountCompleted) || 0; return t > 0 && d >= t; }
  return !!(p.steps && p.steps.completed);
}

/* ---------- In-house (own-crew) helpers (spec §6) ---------- */
export const isInHouse = (p: Project): boolean => !!p.inHouse;
export const ihIsBudget = (p: Project): boolean => p.ihUnit !== 'quantity'; // default budget ($)
export const ihTotal = (p: Project): number => Number(p.totalToComplete) || 0;
export const ihDone = (p: Project): number => Number(p.amountCompleted) || 0;
export const ihRemaining = (p: Project): number => Math.max(0, ihTotal(p) - ihDone(p));
export const ihPct = (p: Project): number => { const t = ihTotal(p); return t > 0 ? Math.min(1, ihDone(p) / t) : 0; };

/* ---------- Phase (derived display bucket — not stored, spec §4.3) ---------- */
export type Phase = 'active' | 'paid' | 'discussed' | 'note' | 'hold' | 'done';
export function phase(p: Project): Phase {
  if (p.onHold) return 'hold';
  if (p.inHouse) {
    const t = ihTotal(p), d = ihDone(p);
    if (t <= 0 && d <= 0) return 'note';
    if (t > 0 && d >= t) return 'done';
    return 'active';
  }
  if (isComplete(p)) return 'done';
  if (isPaidP(p)) return 'paid';
  if (isApproved(p)) return 'active';
  if (!hasCost(p)) return 'note';
  return 'discussed';
}

export const PHASES = [
  { key: 'active',    label: 'In progress',             chip: '',          desc: 'Approved & in the pipeline, not yet paid' },
  { key: 'paid',      label: 'Paid · awaiting closeout', chip: 'done',      desc: 'Paid but not fully closed out' },
  { key: 'discussed', label: 'Discussed / planned',      chip: 'discussed', desc: 'Has a cost; pre-approval — order is flexible' },
  { key: 'note',      label: 'Notes',                    chip: 'note',      desc: 'Jotted down — no cost plugged in yet' },
  { key: 'hold',      label: 'On hold',                  chip: 'hold',      desc: 'Parked for a future period' },
  { key: 'done',      label: 'Completed',                chip: 'done',      desc: 'Closed out & in the financials' },
];
export function phaseMeta(k: string) { return PHASES.find(x => x.key === k); }

/* ---------- Advance & cascade (the "lock-in" semantics, spec §5.2) ---------- */
/**
 * Advance to the next applicable step. Mutates p.steps. Returns p.
 * Mirrors the "Advance ▸" button in the original app.
 */
export function advance(p: Project): Project {
  if (!p.steps) p.steps = {};
  const keys = appKeys(p);
  let cur = -1; keys.forEach((k, idx) => { if (p.steps![k]) cur = idx; });
  const next = keys[cur + 1];
  if (next) {
    p.steps[next] = true;
    const gi = STEP_KEYS.indexOf(next);
    if (gi > APPROVED_IDX) { STEP_KEYS.slice(0, gi).forEach(k => { if (!isNA(p, k)) p.steps![k] = true; }); }
  }
  return p;
}

/**
 * Toggle a single global step by index. Mutates p.steps. Returns p.
 * Mirrors the per-row switch in the original app's lifecycle panel.
 *  - index <= APPROVED_IDX: turning OFF `approved` clears every step after it.
 *  - index >  APPROVED_IDX: turning ON cascades earlier non-N/A steps true;
 *    turning OFF clears all steps after it.
 */
export function toggleStep(p: Project, i: number): Project {
  if (!p.steps) p.steps = {};
  const key = STEP_KEYS[i];
  if (isNA(p, key)) return p; // N/A steps are not toggleable
  const nv = !p.steps[key];
  p.steps[key] = nv;
  if (i <= APPROVED_IDX) {
    if (!nv && i === APPROVED_IDX) { STEP_KEYS.slice(i + 1).forEach(k => p.steps![k] = false); }
  } else {
    if (nv) { STEP_KEYS.slice(0, i).forEach(k => { if (!isNA(p, k)) p.steps![k] = true; }); }
    else { STEP_KEYS.slice(i + 1).forEach(k => p.steps![k] = false); }
  }
  return p;
}

/* ---------- GL / cash aggregations over a whole state ---------- */
export function glSpentFor(state: AppState, code: string, cat?: string | null): number {
  return state.gl.filter(g => g.property === code && (cat == null || g.category === cat)).reduce((a, g) => a + (Number(g.amount) || 0), 0);
}
export function cashAdjFor(state: AppState, code: string): number {
  return state.cashAdjustments.filter(a => a.property === code).reduce((a, b) => a + (Number(b.amount) || 0), 0);
}
export function effectiveCash(state: AppState, code: string): number {
  const c = state.cash[code]; const base = c && c.cash != null ? Number(c.cash) : 0; return base + cashAdjFor(state, code);
}
export const projForProp = (state: AppState, code: string): Project[] => state.projects.filter(p => p.property === code);

/* ---------- Cash projection (spec §7.1) ---------- */
export interface CashModel {
  snapshot: number | null; adj: number; cashToday: number;
  outstanding: Project[]; outstandingTotal: number;
  paid: Project[]; paidTotal: number;
  discussed: Project[]; discussedTotal: number;
  projectedCash: number;
}
export function cashModel(state: AppState, code: string): CashModel {
  const c = state.cash[code] || {};
  const snapshot = c.cash != null ? Number(c.cash) : null;
  const adj = cashAdjFor(state, code);
  const cashToday = (snapshot || 0) + adj;
  const projs = projForProp(state, code);
  const outstanding: Project[] = [], paid: Project[] = [], discussed: Project[] = [];
  let outstandingTotal = 0, paidTotal = 0, discussedTotal = 0;
  projs.forEach(p => {
    if (p.inHouse) {
      if (p.onHold || !ihIsBudget(p)) return;        // quantity-tracked in-house has no $ figure
      const t = ihTotal(p), d = ihDone(p);
      if (t <= 0 && d <= 0) return;                  // note
      if (d > 0) { paid.push(p); paidTotal += d; }   // completed-to-date = spent (final)
      const rem = ihRemaining(p);
      if (rem > 0 && !isComplete(p)) { outstanding.push(p); outstandingTotal += rem; }  // remaining = projected out
      return;
    }
    if (phase(p) === 'active') { outstanding.push(p); outstandingTotal += projOutflow(p); }   // committed, unpaid
    else if (isPaidP(p)) { paid.push(p); paidTotal += projOutflow(p); }                       // final
    else if (phase(p) === 'discussed') { discussed.push(p); discussedTotal += projOutflow(p); }
  });
  return { snapshot, adj, cashToday, outstanding, outstandingTotal, paid, paidTotal, discussed, discussedTotal, projectedCash: cashToday - outstandingTotal };
}

/* ---------- Reconciliation vs the GL (spec §7.2) ---------- */
export interface AuditModel { gls: GLLine[]; glTotal: number; unplanned: GLLine[]; paid: Project[]; paidNoGL: Project[]; linkedCount: number; }
export function auditModel(state: AppState, code: string): AuditModel {
  const gls = state.gl.filter(g => g.property === code);
  const glTotal = gls.reduce((a, g) => a + (Number(g.amount) || 0), 0);
  const linkedIds = new Set(gls.map(g => g.linkedProjectId).filter(Boolean));
  const unplanned = gls.filter(g => Number(g.amount) > OVER_THRESHOLD && !g.linkedProjectId);  // posted, >$5k, not tied
  const paid = projForProp(state, code).filter(isPaidP);
  const paidNoGL = paid.filter(p => !linkedIds.has(p.id));                                       // marked paid, no GL backing
  return { gls, glTotal, unplanned, paid, paidNoGL, linkedCount: linkedIds.size };
}
export function unplannedAll(state: AppState): GLLine[] {
  return state.gl.filter(g => Number(g.amount) > OVER_THRESHOLD && !g.linkedProjectId);
}

/* ---------- GL → project match scoring (spec §7.3) ---------- */
export function glMatchScore(g: GLLine, p: Project): { score: number; reasons: string[] } {
  let score = 0; const reasons: string[] = [];
  if (g.category && p.category && String(g.category).toUpperCase() === String(p.category).toUpperCase()) { score += 40; reasons.push('category'); }
  const amt = Math.abs(Number(g.amount) || 0);
  const tot = Math.abs(p.inHouse ? ihTotal(p) : projOutflow(p));
  if (tot > 0 && amt > 0) {
    const diff = Math.abs(amt - tot) / Math.max(amt, tot);
    if (diff < 0.005) { score += 45; reasons.push('exact $'); }
    else if (diff < 0.05) { score += 32; reasons.push('≈ $'); }
    else if (diff < 0.2) { score += 16; reasons.push('~ $'); }
  }
  const toks = (s: any) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2);
  const gtok = new Set([...toks(g.vendor), ...toks(g.remarks)]);
  const ptok = new Set([...toks(p.name), ...toks(p.contractor), ...toks(p.plan)]);
  let overlap = 0; ptok.forEach(t => { if (gtok.has(t)) overlap++; });
  if (overlap) { score += Math.min(30, overlap * 12); reasons.push('name'); }
  return { score, reasons };
}

/* ---------- Conditional-formatting thresholds for property tiles (spec §7.4) ---------- */
export type Tone = 'good' | 'warn' | 'bad';
export function toneRemaining(remaining: number, budget: number): Tone {
  if (remaining < 0) return 'bad';
  if (budget > 0 && remaining < 0.15 * budget) return 'warn';
  return 'good';
}
export function toneProjected(projected: number, cashToday: number): Tone {
  if (projected < 0) return 'bad';
  if (cashToday > 0 && projected < 0.25 * cashToday) return 'warn';
  return 'good';
}
export function toneCashPerDoor(perDoor: number): Tone {
  if (perDoor >= 3000) return 'good';
  if (perDoor >= 2000) return 'warn';
  return 'bad';
}
/** years to loan maturity from an MM/DD/YYYY string, relative to `now` */
export function yearsToMaturity(loanDue: string | undefined, now: Date): number | null {
  if (!loanDue) return null;
  const m = String(loanDue).split('/');
  if (m.length !== 3) return null;
  const due = new Date(+m[2], +m[0] - 1, +m[1]);
  if (isNaN(due.getTime())) return null;
  return (due.getTime() - now.getTime()) / (365.25 * 24 * 3600 * 1000);
}

/* ---------- Auto-default rules applied on write (spec §5.3, §5.4) ---------- */
/**
 * Apply the cost→planned tick and the no-contract auto-default. Mutates p.
 * - Entering any cost auto-ticks `planned`.
 * - If the user hasn't manually set noContract (noContractSet false), set
 *   noContract true when outflow is in (0, OVER_THRESHOLD).
 */
export function applyCostRules(p: Project): Project {
  if (!p.steps) p.steps = {};
  const co = projOutflow(p);
  if (hasCost(p)) p.steps.planned = true;
  if (!p.inHouse && !p.noContractSet) {
    p.noContract = co > 0 && co < OVER_THRESHOLD;
    if (p.noContract) CONTRACT_STEPS.forEach(k => { p.steps![k] = false; });
  }
  return p;
}

export const uid = (prefix: string): string => prefix + Math.random().toString(36).slice(2, 8);
