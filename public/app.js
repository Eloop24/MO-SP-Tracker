
"use strict";
/* ============================================================
   NORTH DAKOTA — SPECIAL PROJECTS / CAPEX TRACKER
   Single-file tool. Data persists via the artifact storage API
   when available, otherwise localStorage, otherwise in-memory.
   A JSON backup can always be exported/imported for portability.
   ============================================================ */

/* ---------- Lifecycle (the 12 steps from the workflow brief) ---------- */
const LIFECYCLE = [
  {key:'planned',           label:'Planned',                 short:'Plan', desc:'Scope, anticipated cost and planned timing captured.'},
  {key:'gotBids',           label:'Bids Received',           short:'Bids', desc:'Bids collected (3 is standard; not always required).'},
  {key:'approved',          label:'Bid Approved',            short:'Appr', desc:'One bid selected and approved.'},
  {key:'contractGenerated', label:'Contract Generated',      short:'Ctrct',desc:'Contract drafted to the approved bid and sent to the contractor.'},
  {key:'signed',            label:'Signed & Countersigned',  short:'Sign', desc:'Contractor signed; we countersigned and returned.'},
  {key:'contractSaved',     label:'Contract Filed',          short:'File', desc:'Executed contract saved in the property SharePoint folder.'},
  {key:'workStarted',       label:'Work Started',            short:'Start',desc:'Work underway (may run in phases).'},
  {key:'workCompleted',     label:'Work Completed',          short:'Done', desc:'Contractor completed the work or phase.'},
  {key:'paid',              label:'Work Paid For',           short:'Paid', desc:'Invoice paid (confirmed by the general ledger).'},
  {key:'completed',         label:'Completed',               short:'✓',    desc:'Work closed out; reflected in the financial statements.'},
  {key:'lienWaiver',        label:'Lien Waiver Received',    short:'Lien', desc:'Contractor returned the lien waiver.'},
  {key:'lienSaved',         label:'Waiver Filed',            short:'WFile',desc:'Lien waiver saved in the same SharePoint folder.'},
];
const STEP_KEYS = LIFECYCLE.map(s=>s.key);
const CATEGORIES = ['APPLIANCES','BUILDING REPAIRS','CABINETS/COUNTERTOPS','CARPETS/VINYL','COMMON AREA UPGRADES','Concrete/Asphalt','DOORS/WINDOWS','DRAPES/BLINDS','ELECTRICAL - EXTERIOR','ELECTRICAL - INTERIOR','ELEVATORS','FENCING','FIRE','FURNITURE/EQUIPMENT','GENERAL','HVAC','INSPECTION EXPENSES','JANITORIAL','LABOR','LANDSCAPING','OTHER','PAINTING - EXTERIOR','PAINTING - INTERIOR','PARKING','PLUMBING','POOL','REPAIR DOWN UNITS','ROOFING','SECURITY CAMERA','SIGNAGE','SUPPLIES','UNIT AMENITIES/UPGRADES','WOOD REPLACEMENT'];
/* IDs of projects that were imported from the spreadsheet's "SP COMPLETE" archive tab and should not appear as active work. Purged once at boot (see S.meta.spCompletePurge). */
const SP_COMPLETE_IDS=["P001","P002","P003","P004","P005","P006","P007","P008","P009","P010","P011","P012","P013","P014","P015","P016","P017","P018","P019","P020","P021","P022","P023","P024","P025","P026","P027","P028","P029","P030","P031","P032","P033","P034","P035","P036","P037","P038","P039","P040","P041","P042","P043","P044","P045","P046","P047","P048","P049","P050","P051","P052","P053","P054","P055","P056","P057","P058","P059","P060","P061","P062","P063","P064","P065","P066","P067","P068","P070","P071","P072","P073","P074","P075","P076","P077","P078","P079","P080","P081","P082","P083","P084","P085","P086","P087","P088","P089","P090","P091","P092","P093","P094","P095","P096","P097","P098","P099","P100","P101","P102","P103","P104","P105","P106","P107","P108","P109","P110","P111","P112","P113","P114","P115","P116","P117","P118","P119","P120"];

/* ---------- Helpers ---------- */
const $ = (s,r=document)=>r.querySelector(s);
/* ── Drag autoscroll: scroll the page when dragging near top/bottom edge ── */
(()=>{
  let _raf=null,_y=0;
  const tick=()=>{
    const edge=120,spd=12,vh=window.innerHeight;
    if(_y<edge) window.scrollBy(0,-spd*(1-_y/edge));
    else if(_y>vh-edge) window.scrollBy(0,spd*((_y-(vh-edge))/edge));
    _raf=requestAnimationFrame(tick);
  };
  document.addEventListener('dragstart',()=>{if(_raf)cancelAnimationFrame(_raf);_raf=requestAnimationFrame(tick);});
  document.addEventListener('dragend',()=>{if(_raf){cancelAnimationFrame(_raf);_raf=null;}});
  document.addEventListener('drop',()=>{if(_raf){cancelAnimationFrame(_raf);_raf=null;}});
  document.addEventListener('dragover',e=>{_y=e.clientY;},{passive:true});
})();

const el = (t,a={},...kids)=>{const n=document.createElement(t);for(const k in a){if(k==='class')n.className=a[k];else if(k==='html')n.innerHTML=a[k];else if(k.startsWith('on'))n.addEventListener(k.slice(2),a[k]);else if(a[k]!=null)n.setAttribute(k,a[k]);}for(let c of kids){if(c==null||c===false)continue;n.append(c.nodeType?c:document.createTextNode(c));}return n;};
const fmt = (n,dash=true)=>{if(n==null||n===''||isNaN(n))return dash?'—':'';const v=Math.round(Number(n));const s=Math.abs(v).toLocaleString('en-US');return v<0?`($${s})`:`$${s}`;};
const fmt1=(n)=>{if(n==null||isNaN(n))return '—';return '$'+Number(n).toLocaleString('en-US',{maximumFractionDigits:0});};
const pct = (n)=>n==null||isNaN(n)?'—':(Number(n)*100).toFixed(n<0.1?1:0)+'%';
const esc = s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const today=()=>new Date().toISOString().slice(0,10);
const fmtDate=(d)=>{ if(!d)return '—'; const m=String(d).slice(0,10).split('-'); if(m.length!==3)return String(d); const dt=new Date(+m[0],+m[1]-1,+m[2]); if(isNaN(dt))return String(d); return dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); };
const inDateRange=(p,state)=>{ const d=(p.dateAdded||'').slice(0,10); if(state.dateFrom&&(!d||d<state.dateFrom))return false; if(state.dateTo&&(!d||d>state.dateTo))return false; return true; };
const uid = p=>p+Math.random().toString(36).slice(2,8);

/* ---------- Persistence ---------- */
/* ---------- API client (replaces localStorage Store; data now lives in Postgres) ---------- */
const API={
  async get(path){ const r=await fetch('/api'+path,{headers:{'Accept':'application/json'}}); if(r.status===401){showLogin();throw new Error('unauthorized');} if(!r.ok)throw new Error(await r.text()); return r.json(); },
  async send(method,path,body){ const r=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json'},body:body!=null?JSON.stringify(body):undefined}); if(r.status===401){showLogin();throw new Error('unauthorized');} if(!r.ok){ let msg; try{msg=(await r.json()).error;}catch(e){ msg='request failed'; } throw new Error(msg||'request failed'); } return r.json(); }
};
async function refreshState(){ S=await API.get('/state'); S.cashAdjustments=S.cashAdjustments||[]; S.gl=S.gl||[]; S.projects=S.projects||[]; S.cash=S.cash||{}; S.meta=S.meta||{}; }

/* ---------- App state ---------- */
let S=null;            // working state
let VIEW={tab:'dashboard',prop:null};
let FILT={region:'',props:null,cats:null,statuses:null,q:'',view:'board',catOpen:false,dateFrom:'',dateTo:''};
let PFILT={hide:{},dateFrom:'',dateTo:''};   // property view: which phase groups are hidden + date range (per session)
let DASH={region:'',props:[],cat:'',hidePlanned:false,discSort:'cost',discProp:''};  // dashboard controls
let CFILT={prop:'',q:'',sort:'date_desc'};  // contracts view filters + sort
const PCOLOR={
  /* Minot — shades of blue */
  CLND:'#5e97cc', SPND:'#3f7cb8', TPND:'#2f6199', TCND:'#234e7d', WYND:'#183a5e',
  /* Williston — shades of warm orange → red */
  BCND:'#e0973a', ECND:'#d2731f', FHND:'#b8501f', PHND:'#8f3818'
};
const pcolor=code=>PCOLOR[code]||'#7a8190';

/* seedState removed — initial data is seeded server-side into Postgres */

async function boot(){ await refreshState(); render(); }
function commit(msg){ render(); if(msg) toast(msg); }
async function afterWrite(msg){ try{ await refreshState(); }catch(e){} render(); if(msg) toast(msg); }
function cleanBids(p){ return (p.bids||[]).map(b=>({id:b.id,contractor:b.contractor||'',amount:b.amount==null?null:b.amount,approved:!!b.approved,fileKey:b.fileKey||null,fileName:b.fileName||null,fileSize:b.fileSize||null})); }
async function saveProjectSilent(p){ const payload={...p,bids:cleanBids(p)}; if(S.projects.find(x=>x.id===p.id)) await API.send('PATCH','/projects/'+p.id,payload); else await API.send('POST','/projects',payload); }
async function saveProject(p,msg,isNew){
  const payload={...p,bids:cleanBids(p)};
  try{
    if(isNew||!S.projects.find(x=>x.id===p.id)){ await API.send('POST','/projects',payload); }
    else { await API.send('PATCH','/projects/'+p.id,payload); }
    await afterWrite(msg);
  }catch(e){ toast('Save failed: '+e.message); }
}
async function deleteProject(id){ try{ await API.send('DELETE','/projects/'+id); await afterWrite('Project deleted'); }catch(e){ toast('Delete failed: '+e.message); } }
async function linkGl(g,msg){ try{ await API.send('PATCH','/gl/'+g.id+'/link',{linkedProjectId:g.linkedProjectId||null,partial:!!g.partial}); await afterWrite(msg); }catch(e){ toast('Failed: '+e.message); } }
async function saveMatch(g,pr,msg){ try{ await API.send('PATCH','/projects/'+pr.id,{...pr,bids:cleanBids(pr)}); await API.send('PATCH','/gl/'+g.id+'/link',{linkedProjectId:g.linkedProjectId||null,partial:!!g.partial}); await afterWrite(msg); }catch(e){ toast('Failed: '+e.message); } }
async function addAdj(a){ try{ await API.send('POST','/cash-adjustments',a); await afterWrite('Adjustment recorded'); }catch(e){ toast('Failed: '+e.message); } }
async function delAdj(id){ try{ await API.send('DELETE','/cash-adjustments/'+id); await afterWrite('Adjustment removed'); }catch(e){ toast('Failed: '+e.message); } }
async function saveCash(code,obj,msg){ try{ await API.send('PATCH','/cash/'+code,obj); await afterWrite(msg||'Cash updated'); }catch(e){ toast('Failed: '+e.message); } }
async function resetSeed(){ try{ await API.send('POST','/reset'); await afterWrite('Reset to starter data'); }catch(e){ toast('Failed: '+e.message); } }
async function restoreBackup(state){ try{ await API.send('POST','/restore',state); await afterWrite('Backup restored'); }catch(e){ toast('That file is not a valid backup.'); } }
/* ---------- login (shared password) ---------- */
function showLogin(){ const o=document.getElementById('login'); if(o)o.style.display='flex'; }
function hideLogin(){ const o=document.getElementById('login'); if(o)o.style.display='none'; }
async function start(){
  const form=document.getElementById('login-form');
  if(form&&!form._wired){ form._wired=true; form.addEventListener('submit',async ev=>{
    ev.preventDefault();
    const pw=document.getElementById('login-pw').value;
    const err=document.getElementById('login-err'); err.textContent='';
    const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})});
    if(r.ok){ hideLogin(); await boot(); } else { err.textContent='Incorrect password.'; }
  }); }
  try{ const st=await fetch('/api/auth/status').then(r=>r.json()); if(st.authed){ hideLogin(); await boot(); } else { showLogin(); } }
  catch(e){ showLogin(); }
}
/* ---------- Derived ---------- */
const PROP=code=>S.properties.find(p=>p.code===code);
/* Contract steps become "N/A" when a project needs no contract (e.g. < $5K). */
const CONTRACT_STEPS=['contractGenerated','signed','contractSaved'];
const naKeys=p=>p.noContract?CONTRACT_STEPS:[];
const isNA=(p,key)=>!!p.noContract && CONTRACT_STEPS.includes(key);
const appKeys=p=>{ const na=naKeys(p); return STEP_KEYS.filter(k=>!na.includes(k)); };
const appLifecycle=p=>{ const na=naKeys(p); return LIFECYCLE.filter(s=>!na.includes(s.key)); };
function stage(p){ let last=-1; STEP_KEYS.forEach((k,i)=>{if(p.steps&&p.steps[k])last=i;}); return last; } // index of furthest completed step (global)
function stepsDone(p){ return appKeys(p).filter(k=>p.steps&&p.steps[k]).length; }   // applicable steps only
function stepsTotal(p){ return appKeys(p).length; }
function isComplete(p){ if(p.inHouse){ const t=Number(p.totalToComplete)||0,d=Number(p.amountCompleted)||0; return t>0&&d>=t; } return !!(p.steps&&p.steps.completed); }
/* consistent per-property colour chip (matches dashboard bubbles + pipeline) */
function propChip(code,extra){ return el('span',{class:'chip pchip'+(extra?' '+extra:''),style:`background:${pcolor(code)};color:#fff`},code); }
function glSpentFor(code,cat){ return S.gl.filter(g=>g.property===code&&Number(g.amount)>0 && (cat==null||g.category===cat)).reduce((a,g)=>a+(Number(g.amount)||0),0); }
function cashAdjFor(code){ return S.cashAdjustments.filter(a=>a.property===code).reduce((a,b)=>a+(Number(b.amount)||0),0); }
function effectiveCash(code){ const c=S.cash[code]; const base=c&&c.cash!=null?Number(c.cash):0; return base+cashAdjFor(code); }
function projForProp(code){ return S.projects.filter(p=>p.property===code); }
function estAdditional(code){ return projForProp(code).filter(p=>!isComplete(p)&&!p.onHold).reduce((a,p)=>a+(Number(p.anticipatedCost)||0),0); }

/* ---------- Cash projection + audit model ---------- */
const OVER_THRESHOLD = 5000;                       // unplanned-spend flag threshold
const APPROVED_IDX = STEP_KEYS.indexOf('approved'); // workflow "lock-in" point
const isApproved=p=>!!(p.steps&&p.steps.approved);
const isPaidP=p=>!!(p.steps&&p.steps.paid);
const hasCost=p=>p.anticipatedCost!=null||p.actualCost!=null;
const projOutflow=p=>p.actualCost!=null?Number(p.actualCost):(p.anticipatedCost!=null?Number(p.anticipatedCost):0);
/* ---- in-house (own-crew) projects: estimate + progress, no contracts/bids/liens ---- */
const isInHouse=p=>!!p.inHouse;
const ihIsBudget=p=>p.ihUnit!=='quantity';        // default budget ($); else quantity (count)
const ihNum=n=>Number(n||0).toLocaleString('en-US');
const ihFmt=(p,n)=>ihIsBudget(p)?fmt(n,false):ihNum(n);
const ihTotal=p=>Number(p.totalToComplete)||0;
const ihDone=p=>Number(p.amountCompleted)||0;
const ihRemaining=p=>Math.max(0, ihTotal(p)-ihDone(p));
const ihPct=p=>{ const t=ihTotal(p); return t>0?Math.min(1, ihDone(p)/t):0; };
/* phase: where a project sits relative to its workflow.
   In-house projects use a progress workflow (total to complete / amount completed).
   Contractor projects: no cost = "note"; cost pre-approval = "discussed"; approval locks the pipeline. */
function phase(p){
  if(p.onHold) return 'hold';
  if(p.inHouse){
    const t=ihTotal(p), d=ihDone(p);
    if(t<=0 && d<=0) return 'note';
    if(t>0 && d>=t)  return 'done';
    return 'active';
  }
  if(isComplete(p)) return 'done';
  if(isPaidP(p)) return 'paid';
  if(isApproved(p)) return 'active';
  if(!hasCost(p)) return 'note';
  return 'discussed';
}
const PHASES=[
  {key:'active',   label:'In progress',      chip:'',     desc:'Approved & in the pipeline, not yet paid'},
  {key:'paid',     label:'Paid · awaiting closeout', chip:'done', desc:'Paid but not fully closed out'},
  {key:'discussed',label:'Discussed / planned', chip:'discussed', desc:'Has a cost; pre-approval — order is flexible'},
  {key:'note',     label:'Notes',            chip:'note', desc:'Jotted down — no cost plugged in yet'},
  {key:'hold',     label:'On hold',          chip:'hold', desc:'Parked for a future period'},
  {key:'done',     label:'Completed',        chip:'done', desc:'Closed out & in the financials'},
];
function phaseMeta(k){ return PHASES.find(x=>x.key===k); }

/* What cash *should* be: snapshot is a point-in-time fact; the tracker projects
   forward by netting outstanding (committed, unpaid) work against it. */
function cashModel(code){
  const c=S.cash[code]||{};
  const snapshot = c.cash!=null?Number(c.cash):null;
  const adj = cashAdjFor(code);
  const cashToday = (snapshot||0)+adj;
  const projs=projForProp(code);
  const outstanding=[], paid=[], discussed=[];
  let outstandingTotal=0, paidTotal=0, discussedTotal=0;
  projs.forEach(p=>{
    if(p.inHouse){
      if(p.onHold || !ihIsBudget(p)) return;          // quantity-tracked in-house has no $ figure
      const t=ihTotal(p), d=ihDone(p);
      if(t<=0 && d<=0) return;                        // note
      if(d>0){ paid.push(p); paidTotal+=d; }          // completed-to-date = spent (final)
      const rem=ihRemaining(p);
      if(rem>0 && !isComplete(p)){ outstanding.push(p); outstandingTotal+=rem; }  // remaining = projected out
      return;
    }
    if(phase(p)==='active'){ outstanding.push(p); outstandingTotal+=projOutflow(p); }   // committed, unpaid
    else if(isPaidP(p)){ paid.push(p); paidTotal+=projOutflow(p); }                      // final
    else if(phase(p)==='discussed'){ discussed.push(p); discussedTotal+=projOutflow(p); }
  });
  return {snapshot,adj,cashToday,outstanding,outstandingTotal,paid,paidTotal,discussed,discussedTotal,
          projectedCash: cashToday-outstandingTotal};
}
/* Reconcile project records against the general ledger. GL = source of truth for paid work. */
function auditModel(code){
  const gls=S.gl.filter(g=>g.property===code);
  const glTotal=gls.reduce((a,g)=>a+(Number(g.amount)||0),0);
  const linkedIds=new Set(gls.map(g=>g.linkedProjectId).filter(Boolean));
  const unplanned=gls.filter(g=>Number(g.amount)>OVER_THRESHOLD && !g.linkedProjectId);   // posted, >$5k, not tied to a project
  const paid=projForProp(code).filter(isPaidP);
  const paidNoGL=paid.filter(p=>!linkedIds.has(p.id));                                     // marked paid but no GL backing
  return {gls,glTotal,unplanned,paid,paidNoGL,linkedCount:linkedIds.size};
}
function unplannedAll(){ return S.gl.filter(g=>Number(g.amount)>OVER_THRESHOLD && !g.linkedProjectId); }
/* Rough GL→project match scoring, so tying out is point-and-click rather than hunting. */
function glMatchScore(g,p){
  let score=0; const reasons=[];
  if(g.category && p.category && String(g.category).toUpperCase()===String(p.category).toUpperCase()){ score+=40; reasons.push('category'); }
  const amt=Math.abs(Number(g.amount)||0);
  const tot=Math.abs(p.inHouse?ihTotal(p):projOutflow(p));
  if(tot>0 && amt>0){
    const diff=Math.abs(amt-tot)/Math.max(amt,tot);
    if(diff<0.005){ score+=45; reasons.push('exact $'); }
    else if(diff<0.05){ score+=32; reasons.push('≈ $'); }
    else if(diff<0.2){ score+=16; reasons.push('~ $'); }
  }
  const toks=s=>String(s||'').toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>2);
  const gtok=new Set([...toks(g.vendor),...toks(g.remarks)]);
  const ptok=new Set([...toks(p.name),...toks(p.contractor),...toks(p.plan)]);
  let overlap=0; ptok.forEach(t=>{ if(gtok.has(t))overlap++; });
  if(overlap){ score+=Math.min(30,overlap*12); reasons.push('name'); }
  return {score,reasons};
}

/* =========================================================
   RENDER
========================================================= */
function render(){
  const root=$('#root');
  root.innerHTML='';
  const app=el('div',{class:'app'});
  app.append(rail(), mainCol());
  root.append(app);
}

function openBudgetItem(bi,activeProjs,allGls){
  /* Simple budget item detail — no bids/lifecycle, just title+notes+GL+linked contracts */
  if(!bi)return;
  activeProjs=activeProjs||S.projects.filter(p=>p.linkedBudgetItemId===bi.id&&!p.isBudgetItem);
  allGls=allGls||S.gl.filter(g=>g.property===bi.property);
  const linkedGls=allGls.filter(g=>g.linkedProjectId===bi.id&&Number(g.amount)>0&&!g.ignored);
  const glSum=linkedGls.reduce((a,g)=>a+(Number(g.amount)||0),0);
  const linkedProjects=activeProjs.filter(p=>p.linkedBudgetItemId===bi.id);
  const budget=Number(bi.anticipatedCost)||0;
  const spent=bi.actualCost!=null?Number(bi.actualCost):glSum;
  const contracted=linkedProjects.reduce((a,p)=>{const d=(p.depositPaid&&p.depositAmount)?Number(p.depositAmount):0;return a+Math.max(0,(Number(p.anticipatedCost)||0)-d);},0);
  const variance=spent+contracted-budget;

  const scrim=el('div',{class:'scrim modal-center',onclick:e=>{if(e.target===scrim)scrim.remove();}});
  const sheet=el('div',{class:'sheet',style:'max-width:540px;width:94vw'});
  const close=()=>scrim.remove();

  /* header */
  const acctCode=(bi.category||'').match(/^(\d{4})/);
  sheet.append(el('div',{class:'sh'},
    acctCode?el('span',{class:'chip mono'},acctCode[1]):null,
    el('h2',{style:'font-size:16px;flex:1'},bi.name||'Budget Item'),
    el('button',{class:'btn ghost',onclick:close},'Close')));

  const body=el('div',{class:'sb'});

  /* stats row */
  const stats=el('div',{style:'display:flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-bottom:16px'});
  const st=(lbl,val,color)=>{const d=el('div',{style:'flex:1;padding:9px 12px;text-align:center;border-right:1px solid var(--line)'});d.append(el('div',{style:'font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600'},lbl),el('div',{class:'mono',style:'font-size:14px;font-weight:700;margin-top:2px'+(color?';color:'+color:'')},val));return d;};
  const vColor=(budget||spent||contracted)?(variance>0?'var(--rust)':variance<0?'var(--green)':''):'';
  stats.append(
    st('Budget',budget?fmt(budget):'—'),
    st('GL Spent',spent?fmt(spent):'—'),
    st('Contracted',contracted?fmt(contracted):'—'),
    st('Variance',(budget||spent||contracted)?((variance>=0?'+':'')+fmt(variance,false)):'—',vColor));
  body.append(stats);

  /* edit panel */
  const ep=el('div',{class:'panel pad',style:'margin-bottom:14px'});
  const fld=(lbl,node)=>{const d=el('div',{style:'margin-bottom:10px'});d.append(el('label',{style:'font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600;display:block;margin-bottom:3px'},lbl),node);return d;};
  const inpStyle='width:100%;padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:var(--panel-2);font-size:13px;box-sizing:border-box';
  const nameInp=el('input',{type:'text',value:bi.name||'',style:inpStyle+';font-weight:600',oninput:e=>bi.name=e.target.value});
  const acctInp=el('input',{type:'text',value:bi.category||'',style:inpStyle+';font-family:var(--mono)',placeholder:'e.g. 7322 - SP BUILDING REPAIRS',oninput:e=>bi.category=e.target.value});
  const bdgInp=el('input',{type:'number',value:bi.anticipatedCost==null?'':bi.anticipatedCost,style:inpStyle,placeholder:'0',oninput:e=>bi.anticipatedCost=e.target.value===''?null:+e.target.value});
  const notesTa=el('textarea',{style:inpStyle+';min-height:80px;resize:vertical;line-height:1.5',placeholder:'Description of work, scope, follow-up…'});
  notesTa.value=bi.notes||'';notesTa.oninput=e=>bi.notes=e.target.value;
  ep.append(fld('Title',nameInp),fld('Account Code',acctInp),fld('Budgeted Amount',bdgInp),fld('Description / Notes',notesTa));
  ep.append(el('button',{class:'btn accent',onclick:async()=>{await saveProject(bi,'Budget item saved');close();}},'Save'));
  body.append(ep);

  /* linked contracts */
  if(linkedProjects.length){
    const lp=el('div',{class:'panel',style:'overflow:hidden;margin-bottom:14px'});
    lp.append(el('div',{class:'ph'},el('h3',{},'Contracts / Active Work'),el('div',{class:'sp'}),el('span',{class:'chip'},linkedProjects.length+' project'+(linkedProjects.length===1?'':'s'))));
    linkedProjects.forEach(p=>{
      const row=el('div',{style:'padding:9px 16px;border-bottom:1px solid var(--line-2);display:flex;align-items:center;gap:10px;cursor:pointer',onclick:()=>{close();openProject(p.id);}});
      row.append(el('div',{style:'flex:1;min-width:0'},el('div',{style:'font-size:13px;font-weight:600'},p.name),el('div',{style:'font-size:11px;color:var(--ink-3)'},p.contractor||'no contractor'+(p.depositPaid?' · deposit paid':''))),
        el('span',{class:'mono',style:'font-size:12px;font-weight:600'},fmt(Number(p.anticipatedCost)||0,false)));
      lp.append(row);
    });
    body.append(lp);
  }

  /* GL charges */
  if(linkedGls.length){
    const gp2=el('div',{class:'panel',style:'overflow:hidden'});
    gp2.append(el('div',{class:'ph'},el('h3',{},'GL Charges'),el('div',{class:'sp'}),el('span',{class:'chip'},linkedGls.length+' lines'),el('span',{class:'chip'},fmt(glSum,false))));
    linkedGls.slice(0,10).forEach(g=>{
      const row=el('div',{style:'padding:7px 16px;border-bottom:1px solid var(--line-2);display:flex;align-items:center;gap:10px;font-size:12px'});
      row.append(el('div',{style:'flex:1;color:var(--ink-1)'},g.vendor||g.category||'—'),el('span',{style:'color:var(--ink-3);font-size:11px'},g.date||''),el('span',{class:'mono'},fmt(g.amount,false)));
      if(g.remarks)row.append(el('div',{style:'width:100%;font-size:10.5px;color:var(--ink-3);font-style:italic;padding-top:2px'},'"'+g.remarks+'"'));
      gp2.append(row);
    });
    if(linkedGls.length>10)gp2.append(el('div',{style:'padding:6px 16px;font-size:11px;color:var(--ink-3);text-align:center'},'+'+(linkedGls.length-10)+' more lines'));
    body.append(gp2);
  }

  sheet.append(body);
  scrim.append(sheet);
  document.body.append(scrim);
}

function rail(){
  const counts={
    projects:S.projects.length,
    active:S.projects.filter(p=>!isComplete(p)&&!p.isBudgetItem).length,
  };
  const r=el('div',{class:'rail'+(VIEW.railOpen?' open':'')});
  const brand=el('div',{class:'brand'},
    el('div',{class:'mark'}, el('div',{class:'glyph'},'SP'),
      el('div',{}, el('h1',{},(window.__PORTFOLIO_TITLE__||'SP')), el('div',{class:'sub'},'Special Projects · Capex'))));
  const nav=el('div',{class:'nav'});
  const item=(tab,ic,label,ct)=>{
    const b=el('button',{class:VIEW.tab===tab?'on':'',onclick:()=>{VIEW.tab=tab;VIEW.railOpen=false;render();}},
      el('span',{class:'ic'},ic), el('span',{},label));
    if(ct!=null)b.append(el('span',{class:'ct'},String(ct)));
    return b;
  };
  nav.append(el('div',{class:'grp'},'Overview'));
  nav.append(item('dashboard','◧','Dashboard'));
  nav.append(item('projects','▤','Projects',counts.active));
  nav.append(item('inhouse','🛠','In-house',S.projects.filter(isInHouse).length||null));
  nav.append(item('contracts','▦','Contracts',(S.contracts||[]).length||null));
  nav.append(el('div',{class:'grp'},'Properties'));
  [...new Set(S.properties.map(p=>p.region))].forEach(reg=>{
    nav.append(el('div',{class:'grp',style:'padding-top:6px'},reg));
    S.properties.filter(p=>p.region===reg).forEach(p=>{
      const b=el('button',{class:(VIEW.tab==='property'&&VIEW.prop===p.code)?'on':'',onclick:()=>{VIEW.tab='property';VIEW.prop=p.code;VIEW.railOpen=false;render();}},
        el('span',{class:'ic',style:`color:${pcolor(p.code)}`},'●'), el('span',{},p.code),
        el('span',{class:'ct'},String(projForProp(p.code).filter(x=>!isComplete(x)).length)));
      nav.append(b);
    });
  });
  nav.append(el('div',{class:'grp'},'Money'));
  nav.append(item('cash','$','Cash & Loans'));
  nav.append(item('data','⇪','Upload & Data'));

  const foot=el('div',{class:'foot'},
    el('div',{class:'row'}, el('span',{},'GL period'), el('span',{class:'mono'},S.meta&&S.meta.glPeriod?S.meta.glPeriod:'—')),
    el('div',{class:'row',style:'margin-top:4px'}, el('span',{},'Cash as of'), el('span',{class:'mono'},S.meta&&S.meta.cashAsOf?S.meta.cashAsOf:'—')));
  r.append(brand,nav,foot);
  return r;
}

function mainCol(){
  const m=el('div',{class:'main'});
  const views={dashboard:viewDashboard,projects:viewProjects,inhouse:viewInHouse,contracts:viewContracts,property:viewProperty,cash:viewCash,data:viewData};
  const {bar,body}=(views[VIEW.tab]||viewDashboard)();
  m.append(bar,el('div',{class:'content'},body));
  return m;
}
function topbar(crumb,title,...actions){
  const t=el('div',{class:'topbar'});
  const menu=el('button',{class:'btn ghost sm menu-btn',onclick:()=>{VIEW.railOpen=!VIEW.railOpen;render();}},'☰');
  const tt=el('div',{class:'tt'}, el('div',{class:'crumb'},crumb), el('h2',{},title));
  t.append(menu,tt,el('div',{class:'sp'}),...actions);
  return t;
}

/* =========================================================
   CONTRACTS
========================================================= */
function viewContracts(){
  const usd=n=>(n==null||n==='')?'—':'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  let list=(S.contracts||[]).slice();
  if(CFILT.prop) list=list.filter(c=>c.property===CFILT.prop);
  if(CFILT.q){ const q=CFILT.q.toLowerCase(); list=list.filter(c=>[c.outputFilename,c.contractor,c.ownerEntity,c.scope].some(x=>String(x||'').toLowerCase().includes(q))); }
  const sorters={
    date_desc:(a,b)=>String(b.effectiveDate||'').localeCompare(String(a.effectiveDate||''))||String(b.outputFilename||'').localeCompare(String(a.outputFilename||'')),
    date_asc:(a,b)=>String(a.effectiveDate||'').localeCompare(String(b.effectiveDate||''))||String(a.outputFilename||'').localeCompare(String(b.outputFilename||'')),
    total_desc:(a,b)=>(Number(b.total)||0)-(Number(a.total)||0),
    contractor:(a,b)=>String(a.contractor||'').localeCompare(String(b.contractor||'')),
    property:(a,b)=>String(a.property).localeCompare(String(b.property))||String(b.effectiveDate||'').localeCompare(String(a.effectiveDate||'')),
  };
  list.sort(sorters[CFILT.sort]||sorters.date_desc);
  const total=list.reduce((a,c)=>a+(Number(c.total)||0),0);

  const searchInp=el('input',{type:'search',placeholder:'Search contractor, scope, file…',value:CFILT.q||'',style:'min-width:200px',onchange:e=>{CFILT.q=e.target.value;render();}});
  const propSel=el('select',{onchange:e=>{CFILT.prop=e.target.value;render();}},
    el('option',{value:''},'All properties'),
    ...S.properties.map(p=>el('option',{value:p.code,...(CFILT.prop===p.code?{selected:true}:{})},`${p.code} — ${p.name}`)));
  const sortSel=el('select',{onchange:e=>{CFILT.sort=e.target.value;render();}},
    ...[['date_desc','Newest first'],['date_asc','Oldest first'],['total_desc','Total (high→low)'],['contractor','Contractor (A–Z)'],['property','Property']]
      .map(([v,l])=>el('option',{value:v,...(CFILT.sort===v?{selected:true}:{})},l)));
  const bar=topbar('Pipeline','Contracts', searchInp, propSel, sortSel);

  const body=el('div',{class:'grid'});

  // KPIs
  const kpiBox=(lab,val)=>el('div',{class:'kpi'}, el('div',{class:'lab'},lab), el('div',{class:'val'},val));
  const kpis=el('div',{class:'grid kpis',style:'grid-template-columns:repeat(3,1fr)'});
  kpis.append(kpiBox('Contracts',String(list.length)), kpiBox('Total value',usd(total)), kpiBox('Properties',String(new Set(list.map(c=>c.property)).size)));
  body.append(kpis);

  // By-property breakdown
  const byProp={};
  (S.contracts||[]).forEach(c=>{const k=c.property;(byProp[k]=byProp[k]||{n:0,t:0});byProp[k].n++;byProp[k].t+=Number(c.total)||0;});
  const bpPanel=el('div',{class:'panel'});
  bpPanel.append(el('div',{class:'ph'}, el('h3',{},'Contracts by property')));
  const bpt=el('table',{class:'tbl'});
  bpt.append(el('thead',{},tr(th('Property'),th('# Contracts','r'),th('Total value','r'))));
  const bptb=el('tbody');
  Object.keys(byProp).sort((a,b)=>byProp[b].t-byProp[a].t).forEach(code=>{
    bptb.append(el('tr',{class:'clickrow',onclick:()=>{CFILT.prop=code;render();}},
      td(el('span',{},propChip(code),' ',PROP(code)?PROP(code).name:code)),
      el('td',{class:'num r'},String(byProp[code].n)),
      el('td',{class:'num r'},usd(byProp[code].t))));
  });
  bpt.append(bptb);
  bpPanel.append(el('div',{style:'overflow:auto'},bpt));
  body.append(bpPanel);

  // Main contracts table
  const panel=el('div',{class:'panel'});
  panel.append(el('div',{class:'ph'}, el('h3',{},'All contracts'), el('div',{class:'sp'}), el('span',{class:'chip'},`${list.length} shown`)));
  if(!list.length){
    panel.append(el('div',{class:'empty'}, el('div',{class:'big'},'No contracts yet'), 'Generate a contract from a project’s Bids panel, or they’ll appear here once added.'));
  } else {
    const t=el('table',{class:'tbl'});
    t.append(el('thead',{},tr(th('#'),th('Contract'),th('Property'),th('Owner entity'),th('Contractor'),th('Total','r'),th('Effective'),th('Term end'),th('Scope'),th(''))));
    const tb=el('tbody');
    list.forEach((c,i)=>{
      const fileCell = c.fileKey
        ? el('a',{href:`/api/files/${c.fileKey}?name=${encodeURIComponent(c.outputFilename||'contract.pdf')}`,title:'Download'}, c.outputFilename)
        : el('span',{title:'Tracking record — PDF not stored in app',style:'color:var(--ink-2)'}, c.outputFilename);
      const delBtn=el('button',{class:'btn ghost sm',style:'color:var(--rust);padding:2px 7px',title:'Delete contract',onclick:e=>{e.stopPropagation();deleteContract(c.id);}},'✕');
      tb.append(tr(
        el('td',{class:'num'},String(i+1)),
        td(fileCell),
        td(propChip(c.property)),
        td(c.ownerEntity||'—'),
        td(c.contractor||'—'),
        el('td',{class:'num r'},usd(c.total)),
        td(fmtDate(c.effectiveDate)),
        td(fmtDate(c.termEnd)),
        td(c.scope||'—'),
        el('td',{},delBtn)));
    });
    t.append(tb);
    panel.append(el('div',{style:'overflow:auto'},t));
  }
  body.append(panel);
  return {bar,body};
}

/* =========================================================
   DASHBOARD
========================================================= */
function viewDashboard(){
  const regions=[...new Set(S.properties.map(p=>p.region))];
  DASH.props=DASH.props||[];
  let props=S.properties.filter(p=>!DASH.region||p.region===DASH.region);
  if(DASH.props.length) props=props.filter(p=>DASH.props.includes(p.code));
  const codeset=new Set(props.map(p=>p.code));
  const inReg=code=>codeset.has(code);
  const catOk=p=>!DASH.cat||p.category===DASH.cat;
  const glOk=g=>inReg(g.property)&&(!DASH.cat||g.category===DASH.cat);

  // dashboard controls: region toggle + hide-planned
  const regSeg=el('div',{class:'seg-ctl'},
    el('button',{class:DASH.region===''?'on':'',onclick:()=>{DASH.region='';render();}},'All'),
    ...regions.map(r=>el('button',{class:DASH.region===r?'on':'',onclick:()=>{DASH.region=r;DASH.props=[];render();}},r)));
  const hideChk=el('label',{class:'chk'},
    (()=>{const c=el('input',{type:'checkbox',onchange:e=>{DASH.hidePlanned=e.target.checked;render();}});if(DASH.hidePlanned)c.checked=true;return c;})(),
    'Hide \u2018Planned\u2019');
  const bar=topbar('Portfolio','Dashboard', regSeg, hideChk,
    el('button',{class:'btn accent',onclick:()=>openProject(null)},'+ New project'));
  const body=el('div',{class:'grid'});

  // property bubble toggles + category filter
  const pbWrap=el('div',{class:'bubbles'}, el('span',{class:'bub-lab'},'Properties'));
  S.properties.filter(p=>!DASH.region||p.region===DASH.region).forEach(pr=>{
    const on=DASH.props.includes(pr.code);
    pbWrap.append(el('button',{class:'bub'+(on?' on':''),style:on?`background:${pcolor(pr.code)};border-color:${pcolor(pr.code)};color:#fff`:'',
      onclick:()=>{const i=DASH.props.indexOf(pr.code);if(i<0)DASH.props.push(pr.code);else DASH.props.splice(i,1);render();}},
      el('span',{class:'bub-dot',style:'background:'+pcolor(pr.code)}), pr.code));
  });
  if(DASH.props.length)pbWrap.append(el('button',{class:'bub clear',onclick:()=>{DASH.props=[];render();}},'clear'));
  const catsPresent=[...new Set(S.projects.filter(p=>inReg(p.property)).map(p=>p.category))].sort();
  const catSel=el('select',{class:'mini-sel',onchange:e=>{DASH.cat=e.target.value;render();}});
  catSel.append(el('option',{value:'',...(DASH.cat?{}:{selected:true})},'All categories'));
  catsPresent.forEach(cd=>catSel.append(el('option',{value:cd,...(DASH.cat===cd?{selected:true}:{})},cd)));
  body.append(el('div',{class:'dash-filter'}, pbWrap, el('div',{class:'bubbles'}, el('span',{class:'bub-lab'},'Category'), catSel,
    DASH.cat?el('button',{class:'bub clear',onclick:()=>{DASH.cat='';render();}},'clear'):null)));

  const all=S.projects.filter(p=>inReg(p.property)&&catOk(p));
  const notesCount=all.filter(p=>phase(p)==='note').length;
  const active=all.filter(p=>!isComplete(p)&&phase(p)!=='note');   // in-progress = priced, non-complete work (notes excluded)
  const totBudget=props.reduce((a,p)=>a+(Number(p.spBudget)||0),0);
  const totSpent=S.gl.filter(glOk).reduce((a,g)=>a+(Number(g.amount)||0),0);
  const totOutstanding=props.reduce((a,p)=>a+cashModel(p.code).outstandingTotal,0);
  const totCash=props.reduce((a,p)=>a+effectiveCash(p.code),0);

  const kpis=el('div',{class:'grid kpis'});
  const kpi=(lab,val,sub,cls)=>el('div',{class:'kpi'+(cls?' '+cls:'')}, el('div',{class:'lab'},lab), el('div',{class:'val'+(typeof val==='string'&&val[0]==='('?' neg':'')},val), el('div',{class:'sub'},sub));
  kpis.append(
    kpi('Properties',String(props.length),DASH.region||regions.join(' · ')),
    kpi('Active projects',String(active.length),`${all.length} tracked${notesCount?` · ${notesCount} note${notesCount!==1?'s':''}`:''}`),
    kpi('SP budget (2026)',fmt(totBudget),DASH.region?DASH.region:'across portfolio','accent'),
    kpi('Spent to date',fmt(totSpent),'posted per ledger'),
    kpi('Cash today',fmt(totCash),'snapshot + adjustments'),
    kpi('Projected cash',fmt(totCash-totOutstanding),`less ${fmt(totOutstanding,false)} committed`),
  );
  body.append(kpis);

  /* Pipeline funnel — contractor lifecycle, stacked one colour per property (in-house excluded) */
  let hold=0; active.forEach(p=>{ if(p.onHold)hold++; });
  const fActive=active.filter(p=>!isInHouse(p));
  const stageProp=LIFECYCLE.map(()=>({})); const stageTotal=new Array(LIFECYCLE.length).fill(0);
  fActive.forEach(p=>{ if(p.onHold)return; const s=Math.max(0,stage(p)); stageProp[s][p.property]=(stageProp[s][p.property]||0)+1; stageTotal[s]++; });
  const maxT=Math.max(1,...stageTotal);
  const funnel=el('div',{class:'panel'});
  funnel.append(el('div',{class:'ph'}, el('h3',{},'Lifecycle pipeline'), el('div',{class:'sp'}),
    el('span',{style:'font-size:11.5px;color:var(--ink-3)'},'segment = property · click to open'),
    el('span',{class:'chip'},`${hold} on hold`)));
  const legendProps=props.filter(pr=>fActive.some(p=>!p.onHold&&p.property===pr.code));
  const legend=el('div',{class:'plegend'});
  legendProps.forEach(pr=>legend.append(el('button',{class:'pl-item',title:`Open ${pr.code}`,onclick:()=>{VIEW.tab='property';VIEW.prop=pr.code;render();}},
    el('span',{class:'pl-dot',style:'background:'+pcolor(pr.code)}), pr.code)));
  funnel.append(el('div',{class:'pad',style:'padding-bottom:6px'},legend));
  const fwrap=el('div',{class:'pad',style:'padding-top:6px'});
  const fn=el('div',{class:'funnel'});
  LIFECYCLE.forEach((s,i)=>{
    if(DASH.hidePlanned&&i===0)return;        // hide the Planned stage to cut clutter
    const row=el('div',{class:'f'});
    row.append(el('div',{class:'fn'},`${i+1}. ${s.label}`));
    const stack=el('div',{class:'fstack',style:`width:${Math.max(2,stageTotal[i]/maxT*100)}%`});
    const entries=Object.entries(stageProp[i]).sort((a,b)=>b[1]-a[1]);
    if(!entries.length) stack.append(el('div',{class:'fseg empty'}));
    entries.forEach(([cd,n])=>{
      const seg=el('div',{class:'fseg',style:`flex:${n};background:${pcolor(cd)}`,title:`${cd}: ${n} at ${s.label}`,
        onclick:e=>{e.stopPropagation();VIEW.tab='property';VIEW.prop=cd;render();}});
      if(n/Math.max(1,stageTotal[i])>0.14) seg.textContent=String(n);
      stack.append(seg);
    });
    row.append(el('div',{},stack), el('div',{class:'fc'},String(stageTotal[i])));
    fn.append(row);
  });
  fwrap.append(fn); funnel.append(fwrap); body.append(funnel);

  /* Portfolio table */
  const tp=el('div',{class:'panel'});
  tp.append(el('div',{class:'ph'}, el('h3',{},'Portfolio — budget, spend & cash'), el('div',{class:'sp'}),
    el('span',{class:'chip'},`as of ${S.meta&&S.meta.cashAsOf||'—'}`)));
  const tbl=el('table',{class:'tbl'});
  tbl.append(el('thead',{},tr(
    th('Property'),th('Units','r'),th('SP budget','r'),th('Spent','r'),th('Remaining','r'),th('% used','r'),
    th('Open plan','r'),th('Active','r'),th('Cash','r'),th('Loan matures','r'))));
  const tb=el('tbody');
  regions.filter(r=>!DASH.region||r===DASH.region).forEach(reg=>{
    const regProps=props.filter(p=>p.region===reg); if(!regProps.length)return;
    tb.append(el('tr',{class:'grp'}, el('td',{colspan:10}, `${reg} — ${PROP(regProps[0].code).manager}`)));
    let bB=0,bS=0,bR=0;
    regProps.forEach(p=>{
      const c=S.cash[p.code]||{};
      const budget=Number(p.spBudget)||0;
      const spent=glSpentFor(p.code)|| (c.spSpent!=null?Number(c.spSpent):0);
      const rem=budget-spent; bB+=budget;bS+=spent;bR+=rem;
      const used=budget?spent/budget:0;
      const actv=projForProp(p.code).filter(x=>!isComplete(x)&&phase(x)!=='note').length;
      const row=el('tr',{class:'clickrow',onclick:()=>{VIEW.tab='property';VIEW.prop=p.code;render();}},
        td(el('div',{style:'display:flex;align-items:center;gap:8px'}, el('span',{class:'pl-dot',style:'background:'+pcolor(p.code)}), el('div',{}, el('strong',{},p.code), el('div',{style:'font-size:11px;color:var(--ink-3)'},p.name)))),
        tdn(p.units), tdn(budget,1), tdn(spent,1),
        td(el('span',{class:rem<0?'mono neg':'mono'},fmt(rem)),'r'),
        td(barCell(used),'r'),
        tdn(estAdditional(p.code),1), tdn(actv),
        tdn(effectiveCash(p.code),1),
        td(el('span',{class:'mono',style:'font-size:12px'}, c.loanDue||'—'),'r'));
      tb.append(row);
    });
    tb.append(el('tr',{class:'sub'}, td('Subtotal'), td(''),
      tdn(bB,1),tdn(bS,1), td(el('span',{class:bR<0?'mono neg':'mono'},fmt(bR)),'r'),
      td(barCell(bB?bS/bB:0),'r'), td(''),td(''),td(''),td('')));
  });
  tbl.append(tb);
  tp.append(el('div',{style:'overflow:auto'},tbl));
  body.append(tp);

  /* Needs attention */
  const att=el('div',{class:'grid',style:'grid-template-columns:1fr 1fr'});
  att.append(discussedPanel(active.filter(p=>!p.onHold&&phase(p)==='discussed')),
             attentionPanel('Work done, not yet closed', active.filter(p=>p.steps.workCompleted&&!p.steps.completed)));
  body.append(att);

  /* Unplanned large postings (audit) */
  const unp=unplannedAll().filter(g=>glOk(g));
  const up=el('div',{class:'panel'});
  up.append(el('div',{class:'ph'}, el('h3',{},'Unplanned postings over $5,000'), el('div',{class:'sp'}),
    el('span',{style:'font-size:11.5px;color:var(--ink-3)'},'large GL entries not tied to a tracked project'),
    el('span',{class:'chip'+(unp.length?' hold':' done')},String(unp.length))));
  const ub=el('div',{style:'max-height:320px;overflow:auto'});
  if(!unp.length)ub.append(el('div',{class:'empty'},'None — every large posting is tied to a project.'));
  else{
    const t=el('table',{class:'tbl'});
    t.append(el('thead',{},tr(th('Property'),th('Date'),th('Category'),th('Vendor / description'),th('Amount','r'))));
    const tb2=el('tbody');
    unp.slice().sort((a,b)=>b.amount-a.amount).forEach(g=>{
      tb2.append(el('tr',{class:'clickrow',onclick:()=>{VIEW.tab='property';VIEW.prop=g.property;render();}},
        td(propChip(g.property)),
        td(el('span',{class:'mono',style:'font-size:12px'},g.date)),
        td(el('span',{style:'font-size:12px'},g.category)),
        td(el('div',{style:'font-size:12px;max-width:340px'}, el('div',{},g.vendor), g.remarks?el('div',{style:'color:var(--ink-3);font-size:11px'},g.remarks):null)),
        tdn(g.amount,1)));
    });
    t.append(tb2); ub.append(t);
  }
  up.append(ub); body.append(up);
  return {bar,body};
}
function discussedPanel(list){
  const p=el('div',{class:'panel'});
  const propsInList=[...new Set(list.map(x=>x.property))].sort();
  const cost=x=>(x.anticipatedCost!=null?x.anticipatedCost:(x.actualCost!=null?x.actualCost:0));
  let view=list.slice();
  if(DASH.discProp && propsInList.includes(DASH.discProp)) view=view.filter(x=>x.property===DASH.discProp);
  const sorters={cost:(a,b)=>cost(b)-cost(a),costAsc:(a,b)=>cost(a)-cost(b),
    new:(a,b)=>(b.dateAdded||'').localeCompare(a.dateAdded||''),old:(a,b)=>(a.dateAdded||'').localeCompare(b.dateAdded||''),
    prop:(a,b)=>a.property.localeCompare(b.property)||cost(b)-cost(a),name:(a,b)=>(a.name||'').localeCompare(b.name||'')};
  view.sort(sorters[DASH.discSort]||sorters.cost);
  p.append(el('div',{class:'ph'}, el('h3',{},'Discussed · awaiting approval'), el('div',{class:'sp'}), el('span',{class:'chip'},String(view.length))));
  const sortSel=el('select',{class:'mini-sel',onchange:e=>{DASH.discSort=e.target.value;render();}});
  [['cost','Cost: high → low'],['costAsc','Cost: low → high'],['new','Newest first'],['old','Oldest first'],['prop','Property'],['name','Name A–Z']]
    .forEach(o=>sortSel.append(el('option',{value:o[0],...(DASH.discSort===o[0]?{selected:true}:{})},o[1])));
  const propSel=el('select',{class:'mini-sel',onchange:e=>{DASH.discProp=e.target.value;render();}});
  propSel.append(el('option',{value:'',...(DASH.discProp?{}:{selected:true})},'All properties'));
  propsInList.forEach(cd=>propSel.append(el('option',{value:cd,...(DASH.discProp===cd?{selected:true}:{})},cd)));
  p.append(el('div',{class:'pad disc-tools'}, el('span',{class:'dt-lab'},'Sort'), sortSel, el('span',{class:'dt-lab'},'Filter'), propSel));
  const b=el('div',{style:'max-height:300px;overflow:auto'});
  if(!view.length) b.append(el('div',{class:'empty'},'Nothing here — all clear.'));
  view.slice(0,80).forEach(p2=>{
    const r=el('div',{class:'clickrow',style:'display:flex;gap:10px;align-items:center;padding:10px 16px;border-bottom:1px solid var(--line-2)',onclick:()=>openProject(p2.id)});
    r.append(propChip(p2.property),
      el('div',{style:'flex:1;min-width:0'}, el('div',{style:'font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'},p2.name),
        el('div',{style:'font-size:11px;color:var(--ink-3)'},p2.category+(p2.dateAdded?' · '+p2.dateAdded:''))),
      el('span',{class:'mono',style:'font-size:12px;color:var(--ink-3)'},fmt(cost(p2),false)));
    b.append(r);
  });
  p.append(b); return p;
}
function attentionPanel(title,list){
  const p=el('div',{class:'panel'});
  p.append(el('div',{class:'ph'}, el('h3',{},title), el('div',{class:'sp'}), el('span',{class:'chip'},String(list.length))));
  const b=el('div',{style:'max-height:280px;overflow:auto'});
  if(!list.length) b.append(el('div',{class:'empty'},'Nothing here — all clear.'));
  list.slice(0,40).forEach(p2=>{
    const r=el('div',{class:'clickrow',style:'display:flex;gap:10px;align-items:center;padding:10px 16px;border-bottom:1px solid var(--line-2)',onclick:()=>openProject(p2.id)});
    r.append(propChip(p2.property),
      el('div',{style:'flex:1;min-width:0'}, el('div',{style:'font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'},p2.name),
        el('div',{style:'font-size:11px;color:var(--ink-3)'},p2.category)),
      el('span',{class:'mono',style:'font-size:12px;color:var(--ink-3)'},fmt(p2.anticipatedCost||p2.actualCost,false)));
    b.append(r);
  });
  p.append(b); return p;
}
function legendItem(color,label){ return el('span',{}, el('span',{class:'dot',style:`background:${color}`}), label); }
/* Conditional-format tile for the property sticky header. tone: good|warn|bad|none */
function hstat(label,valueText,tone,sub){
  return el('div',{class:'hstat tone-'+(tone||'none')},
    el('div',{class:'hs-lab'},label),
    el('div',{class:'hs-val mono'},valueText),
    sub?el('div',{class:'hs-sub'},sub):null);
}
/* Locked (sticky) property header: name + key SP-budget & cash-per-door metrics. */
function propHead(p,actions,metrics){
  const t=el('div',{class:'topbar prop-head'});
  const menu=el('button',{class:'btn ghost sm menu-btn',onclick:()=>{VIEW.railOpen=!VIEW.railOpen;render();}},'☰');
  const r1=el('div',{class:'ph-row1'}, menu,
    el('div',{class:'tt'}, el('div',{class:'crumb'},`${p.region} · ${p.manager}`), el('h2',{}, el('span',{style:`display:inline-block;width:11px;height:11px;border-radius:3px;background:${pcolor(p.code)};margin-right:8px;vertical-align:middle`}), `${p.code} — ${p.name}`)),
    el('div',{class:'sp'}), ...actions);
  t.append(r1, el('div',{class:'headstats'}, ...metrics));
  return t;
}
function barCell(used){
  const over=used>1;
  const w=Math.min(100,used*100);
  return el('div',{style:'display:flex;align-items:center;gap:7px;justify-content:flex-end'},
    el('span',{class:'mono',style:'font-size:11px;color:'+(over?'var(--rust)':'var(--ink-3)')},pct(used)),
    el('div',{class:'bar'+(over?' over':''),style:'width:70px'}, el('i',{style:`width:${w}%`})));
}
function reconCell(label,val,flag){
  return el('div',{class:'rc'}, el('div',{class:'rk'},label),
    el('div',{class:'rv mono'+(flag?' neg':'')},fmt(val)));
}
function flagBlock(title,items,tone,note){
  const wrap=el('div',{class:'flagblock'});
  wrap.append(el('div',{class:'fb-h'}, el('span',{class:'fb-dot '+tone}),
    el('span',{},title), el('span',{style:'flex:1'}),
    el('span',{class:'chip'+(items.length?(tone==='rust'?' hold':' '):' done'),style:items.length&&tone==='amber'?'background:var(--amber-soft);color:var(--amber)':''},String(items.length))));
  if(!items.length){ wrap.append(el('div',{class:'fb-ok'},'None — all clear.')); return wrap; }
  wrap.append(el('div',{class:'fb-note'},note));
  items.slice(0,8).forEach(it=>{
    const r=el('div',{class:'fb-row'+(it.onclick?' clickrow':'')});
    if(it.onclick)r.addEventListener('click',it.onclick);
    r.append(el('div',{style:'flex:1;min-width:0'}, el('div',{class:'fb-t'},it.title), el('div',{class:'fb-s'},it.sub)),
      el('span',{class:'mono fb-amt'},fmt(it.amt)));
    wrap.append(r);
  });
  if(items.length>8) wrap.append(el('div',{class:'fb-s',style:'padding:6px 0 0'},`+ ${items.length-8} more`));
  return wrap;
}

/* =========================================================
   PROJECTS
========================================================= */
function dateFilterGroup(state){
  const g=el('div',{class:'fgroup'}, el('span',{class:'bub-lab'},'Added'));
  g.append(el('input',{type:'date',class:'date-f',value:state.dateFrom||'',title:'Added on or after',oninput:e=>{state.dateFrom=e.target.value;render();}}));
  g.append(el('span',{class:'date-sep'},'to'));
  g.append(el('input',{type:'date',class:'date-f',value:state.dateTo||'',title:'Added on or before',oninput:e=>{state.dateTo=e.target.value;render();}}));
  if(state.dateFrom||state.dateTo) g.append(el('button',{class:'bub sm',title:'Clear date range',onclick:()=>{state.dateFrom='';state.dateTo='';render();}},'Clear ✕'));
  return g;
}
function viewProjects(){
  const bar=topbar('Pipeline','Projects',
    el('button',{class:'btn accent',onclick:()=>openProject(null)},'+ New project'));
  const body=el('div',{});

  // ---- filters: all selected by default; every group can select-all / clear-all ----
  const ALLPROPS=S.properties.map(p=>p.code);
  const STAT=[['open','Open'],['note','Notes'],['discussed','Discussed'],['active','In progress'],['paid','Paid'],['inhouse','In-house'],['hold','On hold'],['done','Completed']];
  const ALLSTAT=STAT.map(s=>s[0]);
  const ALLCATS=[...new Set(S.projects.filter(p=>!p.isBudgetItem).map(p=>p.category))].sort();
  if(!Array.isArray(FILT.props))FILT.props=ALLPROPS.slice();
  if(!Array.isArray(FILT.statuses))FILT.statuses=ALLSTAT.slice();
  if(!Array.isArray(FILT.cats))FILT.cats=ALLCATS.slice();
  FILT.cats=FILT.cats.filter(c=>ALLCATS.includes(c));
  const toggle=(arr,v)=>{const i=arr.indexOf(v);if(i<0)arr.push(v);else arr.splice(i,1);render();};
  const setAll=(arr,full)=>{ if(arr.length>=full.length){arr.length=0;} else {arr.length=0; full.forEach(v=>arr.push(v));} render(); };
  const isAll=(arr,full)=>arr.length>=full.length;

  // toolbar: search + board/table
  const tb=el('div',{class:'toolbar'});
  tb.append(el('input',{type:'search',placeholder:'Search projects…',value:FILT.q,style:'min-width:220px;flex:1',oninput:e=>{FILT.q=e.target.value;debounced();}}));
  tb.append(el('div',{class:'seg-ctl'},
    el('button',{class:FILT.view==='board'?'on':'',onclick:()=>{FILT.view='board';render();}},'Board'),
    el('button',{class:FILT.view==='table'?'on':'',onclick:()=>{FILT.view='table';render();}},'Table')));
  body.append(tb);

  const fbar=el('div',{class:'filter-panel'});

  // property group
  const allP=isAll(FILT.props,ALLPROPS);
  const propRow=el('div',{class:'fgroup'}, el('span',{class:'bub-lab'},'Property'),
    el('button',{class:'bub all'+(allP?' on':''),onclick:()=>setAll(FILT.props,ALLPROPS)}, allP?'All ✓':'All'));
  S.properties.forEach(pr=>{ const on=FILT.props.includes(pr.code);
    propRow.append(el('button',{class:'bub'+(on?' on':''),style:on?`background:${pcolor(pr.code)};border-color:${pcolor(pr.code)};color:#fff`:'',
      onclick:()=>toggle(FILT.props,pr.code)}, el('span',{class:'bub-dot',style:'background:'+pcolor(pr.code)}), pr.code)); });
  fbar.append(propRow);

  // status group
  const allS=isAll(FILT.statuses,ALLSTAT);
  const statRow=el('div',{class:'fgroup'}, el('span',{class:'bub-lab'},'Status'),
    el('button',{class:'bub all'+(allS?' on':''),onclick:()=>setAll(FILT.statuses,ALLSTAT)}, allS?'All ✓':'All'));
  STAT.forEach(([k,lab])=>{ const on=FILT.statuses.includes(k);
    statRow.append(el('button',{class:'bub'+(on?' on accent':''),onclick:()=>toggle(FILT.statuses,k)},lab)); });
  fbar.append(statRow);

  // category group — checkbox dropdown, with selected shown as bubbles
  const allC=isAll(FILT.cats,ALLCATS);
  const catRow=el('div',{class:'fgroup'}, el('span',{class:'bub-lab'},'Category'));
  const ddWrap=el('div',{class:'cat-dd'});
  ddWrap.append(el('button',{class:'bub dd-btn'+(FILT.catOpen?' open':''),onclick:()=>{FILT.catOpen=!FILT.catOpen;render();}},
    (allC?'All categories':`${FILT.cats.length} of ${ALLCATS.length}`), el('span',{class:'chev'},'▾')));
  if(FILT.catOpen){
    const panel=el('div',{class:'cat-dd-panel'});
    panel.append(el('button',{class:'bub all'+(allC?' on':''),style:'margin-bottom:6px',onclick:()=>setAll(FILT.cats,ALLCATS)}, allC?'Clear all':'Select all'));
    ALLCATS.forEach(cat=>{ const on=FILT.cats.includes(cat);
      panel.append(el('label',{class:'cat-item'},
        (()=>{const c=el('input',{type:'checkbox',onchange:()=>toggle(FILT.cats,cat)}); if(on)c.checked=true; return c;})(),
        el('span',{},cat))); });
    ddWrap.append(panel);
  }
  catRow.append(ddWrap);
  if(!allC) FILT.cats.slice().sort().forEach(cat=>catRow.append(el('button',{class:'bub on accent sm',title:'Remove',onclick:()=>toggle(FILT.cats,cat)},cat,' ✕')));
  fbar.append(catRow);
  fbar.append(dateFilterGroup(FILT));
  body.append(fbar);

  // ---- apply filters ----
  let list=S.projects.filter(p=>FILT.props.includes(p.property) && FILT.cats.includes(p.category) && !p.isBudgetItem);
  if(FILT.q){const q=FILT.q.toLowerCase();list=list.filter(p=>(p.name+' '+p.contractor+' '+p.plan+' '+p.actionItem+' '+p.category).toLowerCase().includes(q));}
  const stMatch=p=>FILT.statuses.some(s=>
    s==='open'?(!isComplete(p)&&!p.onHold):
    s==='inhouse'?isInHouse(p):
    s==='hold'?p.onHold:
    phase(p)===s);
  list=list.filter(stMatch);
  list=list.filter(p=>inDateRange(p,FILT));

  body.append(el('div',{style:'font-size:12.5px;color:var(--ink-3);margin:4px 0 12px'},`${list.length} project${list.length!==1?'s':''}`));

  if(!list.length){ body.append(el('div',{class:'empty'}, el('div',{class:'big'},'No projects match'),'Adjust the filters or add a new project.')); return {bar,body}; }

  if(FILT.view==='board'){
    const board=el('div',{class:'board'});
    list.sort((a,b)=>((b.pinned?1:0)-(a.pinned?1:0))||(a.onHold-b.onHold)|| (stage(b)-stage(a)) || (b.dateAdded||'').localeCompare(a.dateAdded||''));
    list.forEach(p=>board.append(projectCard(p)));
    body.append(board);
  } else {
    body.append(projectsTable(list));
  }
  return {bar,body};
}
let _t;function debounced(){clearTimeout(_t);_t=setTimeout(render,180);}

/* =========================================================
   IN-HOUSE TRACKING (own-crew projects)
========================================================= */
function viewInHouse(){
  const bar=topbar('Own crew','In-house projects',
    el('button',{class:'btn accent',onclick:()=>openProject(null,{inHouse:true})},'+ New in-house project'));
  const body=el('div',{});
  const list=S.projects.filter(isInHouse);
  if(!list.length){ body.append(el('div',{class:'empty'}, el('div',{class:'big'},'No in-house projects yet'),'Add one here, or toggle “In-house (own crew)” on any project in its editor.')); return {bar,body}; }
  const bud=list.filter(ihIsBudget);
  const tot=bud.reduce((a,p)=>a+ihTotal(p),0), done=bud.reduce((a,p)=>a+ihDone(p),0);
  const inProg=list.filter(p=>!isComplete(p)&&!p.onHold).length;
  const qtyCount=list.length-bud.length;
  const k=el('div',{class:'grid kpis',style:'grid-template-columns:repeat(4,1fr)'});
  const kpi=(l,v,s,cls)=>el('div',{class:'kpi'+(cls?' '+cls:'')}, el('div',{class:'lab'},l), el('div',{class:'val'},v), el('div',{class:'sub'},s));
  k.append(kpi('In-house projects',String(list.length),`${inProg} in progress${qtyCount?` · ${qtyCount} by count`:''}`),
    kpi('Est. to complete',fmt(tot),'budget-tracked'),
    kpi('Completed to date',fmt(done),pct(tot?done/tot:0)+' of budget','accent'),
    kpi('Remaining',fmt(tot-done),'budget work left'));
  body.append(k);
  const grid=el('div',{class:'ih-grid'});
  list.sort((a,b)=>(a.onHold-b.onHold)||((isComplete(a)?1:0)-(isComplete(b)?1:0))||(ihPct(b)-ihPct(a)));
  list.forEach(p=>grid.append(ihTile(p)));
  body.append(grid);
  return {bar,body};
}
function ihTile(p){
  const pc=ihPct(p), done=isComplete(p);
  const t=el('div',{class:'ih-tile',style:'border-top:3px solid '+pcolor(p.property),onclick:()=>openProject(p.id)});
  t.append(el('div',{class:'iht-top'}, propChip(p.property),
    el('span',{class:'chip',style:'font-size:9.5px'}, ihIsBudget(p)?'$':'#'),
    el('div',{style:'flex:1'}),
    p.onHold?el('span',{class:'chip hold'},'Hold'):done?el('span',{class:'chip done'},'Done'):el('span',{class:'chip ih'},ihTotal(p)>0?pct(pc):'note')));
  t.append(el('div',{class:'iht-name'},p.name));
  t.append(el('div',{class:'iht-cat'},p.category));
  t.append(el('div',{class:'ih-bigbar'}, el('i',{class:done?'full':'',style:'width:'+Math.round(pc*100)+'%'})));
  t.append(el('div',{class:'iht-fig'},
    el('span',{}, el('span',{class:'mono',style:'font-weight:600'},ihFmt(p,ihDone(p))), el('span',{style:'color:var(--ink-3)'},' / '+ihFmt(p,ihTotal(p)))),
    el('span',{style:'color:var(--ink-3)'},ihFmt(p,ihRemaining(p))+' left')));
  const last=(p.progressNotes||[]).slice(-1)[0];
  t.append(el('div',{class:'iht-note'}, last?el('span',{},el('span',{class:'mono'},last.date),' · ',last.note):el('span',{style:'color:var(--ink-3)'},'No progress notes yet')));
  return t;
}

function projectCard(p){
  const ih=isInHouse(p);
  const c=el('div',{class:'pcard'+(ih?' inhouse':''),onclick:()=>openProject(p.id)});
  const top=el('div',{class:'top'}, propChip(p.property));
  if(ih)top.append(el('span',{class:'chip ih'},'In-house'));
  if(p.pinned)top.append(el('span',{class:'pin-i',title:'Pinned'},'📌'));
  if(p.onHold)top.append(el('span',{class:'chip hold'},'On hold'));
  else if(isComplete(p))top.append(el('span',{class:'chip done'},'Complete'));
  else if(phase(p)==='note')top.append(el('span',{class:'chip note'},'Note'));
  else if(!ih&&phase(p)==='discussed')top.append(el('span',{class:'chip discussed'},'Discussed'));
  top.append(el('div',{style:'flex:1'}), el('span',{style:'font-size:11px;color:var(--ink-3)'},p.category));
  c.append(top);
  c.append(el('div',{class:'nm'},p.name));
  c.append(el('div',{class:'meta'}, p.contractor? '◷ '+p.contractor : (p.actionItem? p.actionItem.slice(0,70):'—')));
  c.append(el('div',{class:'card-added'}, 'Added '+fmtDate(p.dateAdded)));
  if(ih){
    c.append(progressEl(p));
    const t=ihTotal(p), d=ihDone(p);
    c.append(el('div',{class:'ft'},
      el('span',{}, isComplete(p)?'✓ done':(t>0?pct(ihPct(p))+' complete':'note')),
      el('span',{class:'cost'}, t>0?ihFmt(p,d)+' / '+ihFmt(p,t):'—')));
  } else {
    c.append(trackEl(p));
    const cost=p.actualCost!=null?p.actualCost:p.anticipatedCost;
    const lab=p.actualCost!=null?'actual':'planned';
    c.append(el('div',{class:'ft'},
      el('span',{}, `${stepsDone(p)}/${stepsTotal(p)} · `, el('span',{},isComplete(p)?'done':(phase(p)==='note'?'note':(stage(p)>=0?LIFECYCLE[stage(p)].label:'planned')))),
      el('span',{class:'cost'}, cost!=null? fmt(cost):'—', cost!=null?el('span',{style:'font-weight:400;color:var(--ink-3);font-size:10px'},' '+lab):'')));
  }
  return c;
}
function progressEl(p){
  const pc=ihPct(p); const done=isComplete(p);
  return el('div',{class:'progress',title:pct(pc)+' complete'}, el('i',{class:done?'full':'',style:`width:${Math.round(pc*100)}%`}));
}
function trackEl(p){
  const t=el('div',{class:'track'});
  const steps=appLifecycle(p);                       // N/A (no-contract) steps excluded
  let cur=-1; steps.forEach((s,i)=>{ if(p.steps&&p.steps[s.key])cur=i; });
  steps.forEach((s,i)=>{
    const done=p.steps&&p.steps[s.key];
    const cls=done?(i===cur&&!isComplete(p)?'seg cur':'seg done'):'seg';
    const seg=el('div',{class:cls,title:`${s.label}${done?' ✓':''}`});
    t.append(seg);
  });
  return t;
}
function projectsTable(list){
  const wrap=el('div',{class:'panel',style:'overflow:auto'});
  const tbl=el('table',{class:'tbl'});
  tbl.append(el('thead',{},tr(th('Property'),th('Project'),th('Category'),th('Added'),th('Contractor'),th('Lifecycle'),th('Cost','r'),th('Status'))));
  const tb=el('tbody');
  list.sort((a,b)=>(a.property).localeCompare(b.property)||(stage(b)-stage(a)));
  list.forEach(p=>{
    const ih=isInHouse(p);
    const cost=ih?ihTotal(p):(p.actualCost!=null?p.actualCost:p.anticipatedCost);
    tb.append(el('tr',{class:'clickrow',onclick:()=>openProject(p.id)},
      td(propChip(p.property)),
      td(el('div',{style:'font-weight:600;max-width:280px'},p.name, ih?el('span',{class:'chip ih',style:'margin-left:6px'},'In-house'):null)),
      td(el('span',{style:'font-size:12px'},p.category)),
      td(el('span',{style:'font-size:12px;white-space:nowrap;color:var(--ink-3)'},fmtDate(p.dateAdded))),
      td(el('span',{style:'font-size:12px'},ih?'own crew':(p.contractor||'—'))),
      td(el('div',{style:'min-width:150px'}, ih?progressEl(p):trackElMini(p))),
      tdn(cost,1),
      td(p.onHold?el('span',{class:'chip hold'},'Hold'):isComplete(p)?el('span',{class:'chip done'},'Done'):(ih?el('span',{class:'chip ih'},pct(ihPct(p))):el('span',{class:'chip'},`${stepsDone(p)}/${stepsTotal(p)}`)))));
  });
  tbl.append(tb); wrap.append(tbl); return wrap;
}
function trackElMini(p){ const t=trackEl(p); return t; }

/* =========================================================
   PROJECT EDITOR (sheet)
========================================================= */
function openProject(id,preset){
  const isNew=!id;
  let p = isNew ? {id:uid('P'),property:VIEW.prop||S.properties[0].code,category:'GENERAL',name:'',description:'',plan:'',contractor:'',actionItem:'',anticipatedCost:null,actualCost:null,dateAdded:today(),plannedStart:'',plannedEnd:'',bids:[],steps:{},notes:'',onHold:false,pinned:false,inHouse:false,ihUnit:'budget',totalToComplete:null,amountCompleted:null,progressNotes:[],noContract:false,noContractSet:false}
                 : JSON.parse(JSON.stringify(S.projects.find(x=>x.id===id)));
  if(isNew&&preset)Object.assign(p,preset);
  p.steps=p.steps||{}; p.bids=p.bids||[]; p.progressNotes=p.progressNotes||[];
  while(p.bids.length<3) p.bids.push({id:uid('b'),contractor:'',amount:null,approved:false,file:null});
  const fileSize=n=>n==null?'':n<1024?n+' B':n<1048576?(n/1024).toFixed(0)+' KB':(n/1048576).toFixed(1)+' MB';
  const reg=()=>PROP(p.property)?PROP(p.property).region:'';

  const scrim=el('div',{class:'scrim',onclick:e=>{if(e.target===scrim)close();}});
  const sheet=el('div',{class:'sheet sheet-editor'});
  function close(){scrim.remove();}
  function save(){
    if(!p.name.trim()){toast('Give the project a name first.');return;}
    p.region=reg(); p.manager=PROP(p.property).manager;
    p.bids=p.bids.filter(bd=>bd.contractor||bd.amount!=null||bd.file||bd.fileKey||bd.approved);
    close(); saveProject(p, isNew?'Project added':'Project saved', isNew);
  }
  function del(){ close(); deleteProject(p.id); }

  const head=el('div',{class:'sh'},
    propChip(p.property),
    el('h2',{style:'font-size:16px;flex:1'}, isNew?'New project':'Edit project'),
    el('button',{class:'btn ghost',onclick:close},'Cancel'),
    el('button',{class:'btn accent',onclick:save},'Save'));
  const b=el('div',{class:'sb'});

  // --- core fields ---
  const core=el('div',{class:'panel pad'});
  const f=(label,node)=>el('div',{class:'field'}, el('label',{},label), node);
  const inp=(key,attrs={})=>{const n=el('input',{value:p[key]==null?'':p[key],...attrs,oninput:e=>p[key]=attrs.type==='number'?(e.target.value===''?null:+e.target.value):e.target.value});return n;};
  // Entering a cost figure promotes a bare note into a planned project — tick "Planned".
  const costInp=(key)=>{const n=inp(key,{type:'number',placeholder:key==='actualCost'?'from GL':'0'});
    n.addEventListener('input',()=>{
      if(p[key]!=null && !isNaN(p[key]) && !p.steps.planned){ p.steps.planned=true; }
      if(!p.noContractSet){ const co=projOutflow(p); p.noContract = co>0 && co<OVER_THRESHOLD; if(p.noContract)CONTRACT_STEPS.forEach(k=>p.steps[k]=false); }
      if(typeof drawSteps==='function')drawSteps();
      if(typeof refreshNC==='function')refreshNC();
    });
    return n;};
  const propSel=el('select',{onchange:e=>{p.property=e.target.value;}});
  S.properties.forEach(pr=>propSel.append(el('option',{value:pr.code,...(p.property===pr.code?{selected:true}:{})},`${pr.code} — ${pr.name}`)));
  const catSel=el('select',{onchange:e=>p.category=e.target.value});
  CATEGORIES.forEach(c=>catSel.append(el('option',{value:c,...(p.category===c?{selected:true}:{})},c)));

  core.append(f('Project name',inp('name',{placeholder:'e.g. Garage roof repairs'})));
  core.append(el('div',{class:'frow'}, f('Property',propSel), f('Category',catSel)));
  core.append(f('Plan / scope / comments',el('textarea',{oninput:e=>p.plan=e.target.value},p.plan||'')));
  core.append(el('div',{class:'frow'},
    f('Contractor',inp('contractor',{placeholder:'Awarded / leading contractor'})),
    f('Current action item',inp('actionItem',{placeholder:'Next step / who owns it'}))));
  core.append(el('div',{class:'frow3'},
    f('Date added',inp('dateAdded',{type:'date'})),
    f('Planned start',inp('plannedStart',{type:'date'})),
    f('Planned end',inp('plannedEnd',{type:'date'}))));
  // mode-specific cost block
  const contractorCost=el('div',{class:'frow'},
    f('Anticipated cost',costInp('anticipatedCost')),
    f('Actual cost',costInp('actualCost')));
  const ihTotalInp=inp('totalToComplete',{type:'number',placeholder:'estimated total $'});
  const ihDoneInp=inp('amountCompleted',{type:'number',placeholder:'$ completed so far'});
  const inhouseCost=el('div',{class:'frow'},
    f('Total to complete',ihTotalInp),
    f('Amount completed',ihDoneInp));
  core.append(contractorCost, inhouseCost);
  const holdWrap=el('label',{style:'display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;cursor:pointer'},
    (()=>{const c=el('input',{type:'checkbox',onchange:e=>p.onHold=e.target.checked});if(p.onHold)c.checked=true;return c;})(),'Mark as on hold');
  const pinWrap=el('label',{style:'display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;cursor:pointer'},
    (()=>{const c=el('input',{type:'checkbox',onchange:e=>p.pinned=e.target.checked});if(p.pinned)c.checked=true;return c;})(),'📌 Pin to top');
  const ihWrap=el('label',{class:'ih-toggle',style:'display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;cursor:pointer'},
    (()=>{const c=el('input',{type:'checkbox',onchange:e=>{p.inHouse=e.target.checked;applyMode();}});if(p.inHouse)c.checked=true;return c;})(),'🛠 In-house (own crew)');
  let ncChk;
  const ncWrap=el('label',{class:'nc-toggle',style:'display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;cursor:pointer'},
    (()=>{ncChk=el('input',{type:'checkbox',onchange:e=>{p.noContract=e.target.checked;p.noContractSet=true; if(p.noContract)CONTRACT_STEPS.forEach(k=>p.steps[k]=false); drawSteps();}}); if(p.noContract)ncChk.checked=true; return ncChk;})(),'📄 No contract needed');
  function refreshNC(){ if(ncChk)ncChk.checked=!!p.noContract; }
  core.append(el('div',{style:'display:flex;gap:24px;flex-wrap:wrap'},holdWrap,pinWrap,ihWrap,ncWrap));
  b.append(core);

  // --- in-house panel: progress + additional notes ---
  const inhousePanel=el('div',{class:'panel ih-panel',style:'margin-top:16px'});
  const unitSeg=el('div',{class:'seg-ctl sm'},
    el('button',{onclick:()=>{p.ihUnit='budget';applyUnit();}},'Budget $'),
    el('button',{onclick:()=>{p.ihUnit='quantity';applyUnit();}},'Quantity #'));
  inhousePanel.append(el('div',{class:'ph'}, el('h3',{},'In-house progress'), el('div',{class:'sp'}), unitSeg, el('span',{class:'ih-meta'},'')));
  const ihBody=el('div',{class:'pad'});
  const ihIntro=el('p',{style:'margin-top:0;color:var(--ink-3);font-size:12.5px'},'');
  ihBody.append(ihIntro);
  const ihBar=el('div',{class:'ih-bigbar'}, el('i',{}));
  const ihStat=el('div',{class:'ih-stat'});
  ihBody.append(ihBar, ihStat);
  // additional progress notes (timestamped)
  ihBody.append(el('div',{class:'field',style:'margin-top:14px'}, el('label',{},'Progress / additional notes')));
  const pnList=el('div',{class:'pn-list'});
  const pnInput=el('input',{placeholder:'Add a dated progress note…',onkeydown:e=>{if(e.key==='Enter'&&e.target.value.trim()){p.progressNotes.push({id:uid('n'),date:today(),note:e.target.value.trim()});e.target.value='';drawIH();}}});
  ihBody.append(el('div',{class:'pn-add'}, pnInput, el('button',{class:'btn sm',onclick:()=>{if(pnInput.value.trim()){p.progressNotes.push({id:uid('n'),date:today(),note:pnInput.value.trim()});pnInput.value='';drawIH();}}},'Add note')));
  ihBody.append(pnList);
  inhousePanel.append(ihBody); b.append(inhousePanel);
  function drawIH(){
    const t=ihTotal(p), d=ihDone(p), pc=ihPct(p);
    ihBar.firstChild.style.width=Math.round(pc*100)+'%';
    ihBar.firstChild.className=(t>0&&d>=t)?'full':'';
    ihStat.innerHTML='';
    ihStat.append(el('span',{class:'mono',style:'font-weight:600'},ihFmt(p,d)+' of '+ihFmt(p,t)),
      el('span',{style:'color:var(--ink-3)'},'  ·  '+pct(pc)+' complete'+(t>0?'  ·  '+ihFmt(p,ihRemaining(p))+' remaining':'')));
    inhousePanel.querySelector('.ih-meta').textContent=t>0?pct(pc)+' complete':'no estimate yet';
    pnList.innerHTML='';
    p.progressNotes.slice().reverse().forEach(n=>{
      pnList.append(el('div',{class:'pn-item'},
        el('span',{class:'pn-date mono'},n.date),
        el('span',{style:'flex:1'},n.note),
        el('button',{class:'btn ghost sm',onclick:()=>{p.progressNotes=p.progressNotes.filter(x=>x.id!==n.id);drawIH();}},'✕')));
    });
    if(!p.progressNotes.length) pnList.append(el('div',{style:'font-size:12px;color:var(--ink-3)'},'No progress notes yet.'));
  }
  function applyUnit(){
    const budget=ihIsBudget(p);
    ihTotalInp.placeholder=budget?'estimated total $':'total count';
    ihDoneInp.placeholder=budget?'$ completed so far':'count completed';
    unitSeg.children[0].className=budget?'on':'';
    unitSeg.children[1].className=budget?'':'on';
    ihIntro.textContent=budget
      ? 'Own-crew work — no contracts, bids, or lien waivers. Track an estimated dollar total and update the amount completed as work progresses.'
      : 'Own-crew work tracked by count (e.g. units done). Set the total to complete and update the quantity completed as work progresses.';
    inhouseCost.querySelector('label').textContent = budget?'Total to complete ($)':'Total to complete (#)';
    inhouseCost.querySelectorAll('label')[1].textContent = budget?'Amount completed ($)':'Quantity completed (#)';
    drawIH();
  }
  ihTotalInp.addEventListener('input',drawIH);
  ihDoneInp.addEventListener('input',drawIH);
  applyUnit();

  // --- bids (collapsible: 3 standard slots, each with a bid document) ---
  const anyBid=p.bids.some(bd=>bd.approved||bd.contractor||bd.amount!=null||bd.file||bd.fileKey);
  const bidsWrap=el('details',{class:'panel acc',style:'margin-top:16px',...(anyBid?{open:''}:{})});
  const bidMeta=el('span',{class:'bs-meta'},'');
  const summary=el('summary',{class:'ph as-summary'}, el('span',{class:'chev'},'▸'), el('h3',{},'Bids'), el('div',{class:'sp'}), bidMeta);
  const bidBody=el('div',{class:'pad'});
  bidBody.append(el('p',{class:'bs-hint'},'Three standard slots — attach each contractor’s bid document, then approve the winner. Approving fills in the contractor and anticipated cost and advances the workflow to “Bid Approved”.'));
  const slotsWrap=el('div',{});
  bidBody.append(slotsWrap);
  async function attachBid(bd,file){
    const slot=p.bids.indexOf(bd);
    const fd=new FormData(); fd.append('file',file);
    toast('Uploading bid…');
    try{
      const r=await fetch(`/api/projects/${p.id}/bids/${slot}/file`,{method:'POST',body:fd});
      if(!r.ok)throw new Error(await r.text());
      const meta=await r.json();
      bd.fileKey=meta.fileKey; bd.fileName=meta.fileName; bd.fileSize=meta.fileSize; bd.file=null;
      drawBids();
    }catch(e){ toast('Upload failed: '+e.message); }
  }
  function openBidFile(bd){ if(bd.fileKey) window.open('/api/bids/file/'+bd.fileKey,'_blank'); }
  function bidSlot(i){
    const bd=p.bids[i];
    const slot=el('div',{class:'bidslot'+(bd.approved?' win':'')});
    slot.append(el('div',{class:'bs-hd'},
      el('span',{class:'bs-no'},'Bid '+(i+1)),
      bd.approved?el('span',{class:'chip done',style:'margin-left:8px'},'Selected'):null,
      el('div',{style:'flex:1'}),
      el('button',{class:'bs-appr'+(bd.approved?' on':''),onclick:()=>{
        const willApprove=!bd.approved;
        p.bids.forEach((x,j)=>x.approved=(j===i)?willApprove:false);
        if(willApprove){ p.steps.approved=true; p.steps.planned=true; if(bd.contractor)p.contractor=bd.contractor; if(bd.amount!=null)p.anticipatedCost=bd.amount; }
        drawBids(); drawSteps();
      }}, bd.approved?'✓ Approved':'Approve')));
    slot.append(el('div',{class:'bs-row'},
      el('input',{value:bd.contractor||'',placeholder:'Contractor / vendor',oninput:e=>{bd.contractor=e.target.value;refreshMeta();}}),
      el('input',{type:'number',value:bd.amount==null?'':bd.amount,placeholder:'Bid amount ($)',oninput:e=>{bd.amount=e.target.value===''?null:+e.target.value;refreshMeta();}})));
    const fileRow=el('div',{class:'bs-file'});
    if(bd.fileKey){
      fileRow.append(el('span',{class:'bs-doc'},'📄'),
        el('a',{href:'/api/bids/file/'+bd.fileKey,target:'_blank',title:'View stored bid'},bd.fileName||'bid'),
        el('span',{class:'bs-sz'},bd.fileSize?fileSize(bd.fileSize):''),
        el('div',{style:'flex:1'}),
        el('button',{class:'btn ghost sm',onclick:()=>{bd.fileKey=null;bd.fileName=null;bd.fileSize=null;drawBids();}},'✕ Remove'));
    } else {
      const inp=el('input',{type:'file',accept:'.pdf,.png,.jpg,.jpeg,.zip',style:'display:none',onchange:e=>{if(e.target.files[0])attachBid(bd,e.target.files[0]);}});
      const lbl=el('button',{class:'btn sm ghost',onclick:()=>inp.click()},'⇪ Attach bid document');
      fileRow.append(lbl,inp);
    }
    slot.append(fileRow);
    return slot;
  }
  function refreshMeta(){ const filled=p.bids.filter(bd=>bd.contractor||bd.amount!=null||bd.file||bd.fileKey).length; bidMeta.textContent=`${filled}/3 filled${p.bids.some(b=>b.approved)?' · winner selected':''}`; }

  // --- Generate Contract (Independent Contractor Agreement) ---
  const genRow=el('div',{style:'margin-top:12px;padding-top:12px;border-top:1px solid var(--line-2);display:flex;align-items:center;gap:10px;flex-wrap:wrap'});
  bidBody.append(genRow);
  function refreshGen(){
    genRow.innerHTML='';
    const hasFile=p.bids.some(bd=>bd.fileKey);
    const btn=el('button',{class:'btn accent sm',onclick:()=>openContractDialog()},'📄 Generate Contract');
    if(!hasFile){ btn.disabled=true; btn.title='Attach a bid document to a slot first'; btn.style.opacity='.5'; btn.style.cursor='default'; }
    genRow.append(btn, el('span',{class:'bs-meta'}, hasFile?'Builds the Independent Contractor Agreement with the bid embedded (Exhibits A–D).':'Attach a bid document to enable.'));
    if(p.contractFileKey){ genRow.append(el('div',{style:'flex:1'}), el('a',{class:'btn ghost sm',href:'/api/files/'+p.contractFileKey+'?name='+encodeURIComponent(p.contractFileName||'contract.pdf')},'⬇ '+(p.contractFileName||'contract.pdf'))); }
  }

  function openContractDialog(){
    const prop=PROP(p.property)||{};
    const approved=p.bids.find(b=>b.approved&&b.fileKey)||p.bids.find(b=>b.fileKey)||{};
    const total=p.actualCost!=null?p.actualCost:(approved.amount!=null?approved.amount:(p.anticipatedCost!=null?p.anticipatedCost:0));
    const usd=n=>'$'+Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    const isoToMdy=iso=>{const m=String(iso||'').split('-');return m.length===3?`${m[1]}/${m[2]}/${m[0]}`:'';};
    const plusDays=n=>{const d=new Date();d.setDate(d.getDate()+n);return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;};
    const data={
      effectiveDate:isoToMdy(today()), termEndDate:plusDays(60),
      ownerEntity:prop.ownerEntity||'', contractorName:(approved.contractor||p.contractor||''),
      propertyName:prop.name||'', propertyAddr:prop.address||'',
      ownerNoticeAddr:prop.ownerNoticeAddr||prop.address||'', contractorAddr:'',
      contractTotal:usd(total), unit:'', scope:p.name||'',
      dailyReduction:'', workDays:'', workHours:''
    };
    const scrim=el('div',{class:'scrim modal-center',onclick:e=>{if(e.target===scrim)scrim.remove();}});
    const sheet=el('div',{class:'sheet'});
    const head=el('div',{class:'sh'}, el('h2',{style:'font-size:16px;flex:1'},'Generate contract'),
      el('button',{class:'btn ghost',onclick:()=>scrim.remove()},'Cancel'));
    const bb=el('div',{class:'sb'});
    bb.append(el('p',{style:'margin-top:0;color:var(--ink-3);font-size:12.5px'},'Pre-filled from the property and approved bid. Owner entity and addresses are saved to the property for next time.'));
    const f=(label,key,opts={})=>el('div',{class:'field'},el('label',{},label),el('input',{value:data[key]||'',placeholder:opts.ph||'',oninput:e=>data[key]=e.target.value}));
    const sect=t=>bb.append(el('div',{style:'font-family:var(--disp);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin:18px 0 8px;border-bottom:1px solid var(--line-2);padding-bottom:5px'},t));
    // --- Property ---
    sect('Property');
    bb.append(f('Property name','propertyName'));
    bb.append(f('Owner entity (legal)','ownerEntity',{ph:'e.g. MIMG CCXXXI South Pointe Sub, LLC'}));
    bb.append(f('Property address','propertyAddr',{ph:'street, city, ST ZIP'}));
    bb.append(f('Owner notice address','ownerNoticeAddr',{ph:'usually same as property'}));
    // --- Contract ---
    sect('Contract');
    bb.append(el('div',{class:'frow'}, f('Effective date (MM/DD/YYYY)','effectiveDate'), f('Term end date (MM/DD/YYYY)','termEndDate')));
    bb.append(el('div',{class:'frow'}, f('Contract total','contractTotal'), f('Unit # (optional)','unit',{ph:'e.g. 201'})));
    bb.append(f('Scope of work','scope',{ph:'e.g. HVAC replacement — Unit 316'}));
    bb.append(el('div',{class:'frow'}, f('Daily reduction amount','dailyReduction',{ph:'e.g. $500'}), f('Work days','workDays',{ph:'e.g. Mon - Fri'})));
    bb.append(f('Work hours','workHours',{ph:'e.g. 8:00 AM - 5:00 PM'}));
    // --- Contractor (with vendor lookup autocomplete) ---
    sect('Contractor');
    (()=>{
      // Drop rendered to body so it floats above the scrollable modal
      const drop=el('div',{style:'display:none;position:fixed;z-index:10000;background:var(--panel);border:1px solid var(--line);border-radius:8px;box-shadow:0 12px 32px rgba(0,0,0,.22);max-height:220px;overflow-y:auto;min-width:260px'});
      document.body.append(drop);
      // Remove drop when the modal is closed
      const _obs=new MutationObserver(()=>{ if(!document.body.contains(scrim)){ drop.remove(); _obs.disconnect(); } });
      _obs.observe(document.body,{childList:true});
      function positionDrop(){ const r=inp.getBoundingClientRect(); drop.style.left=r.left+'px'; drop.style.top=(r.bottom+4)+'px'; drop.style.width=r.width+'px'; }
      const wrap=el('div',{class:'field'});
      const lbl=el('label',{},'Contractor name');
      const inp=el('input',{value:data.contractorName||'',placeholder:'Type to search 15k vendors, or enter manually',
        oninput:e=>{ data.contractorName=e.target.value; schedSearch(e.target.value); }
      });
      let _st;
      function schedSearch(v){ clearTimeout(_st); if(v.length<2){drop.style.display='none';return;} _st=setTimeout(()=>runSearch(v),280); }
      async function runSearch(v){
        try{
          const r=await fetch('/api/vendors?q='+encodeURIComponent(v));
          const hits=await r.json();
          drop.innerHTML='';
          if(!hits.length){ drop.style.display='none'; return; }
          hits.forEach((h,i)=>{
            const row=el('div',{style:'padding:9px 14px;cursor:pointer;'+(i<hits.length-1?'border-bottom:1px solid var(--line-2);':''),
              onmousedown:e=>{ e.preventDefault(); data.contractorName=h.name; data.contractorAddr=h.addr; inp.value=h.name; addrInp.value=h.addr; drop.style.display='none'; },
              onmouseover:e=>{ e.currentTarget.style.background='var(--line-2)'; },
              onmouseout:e=>{ e.currentTarget.style.background=''; }
            });
            row.append(
              el('div',{style:'font-size:13px;font-weight:500;color:var(--ink-1)'},h.name),
              el('div',{style:'font-size:11.5px;color:var(--ink-3);margin-top:1px'},h.addr)
            );
            drop.append(row);
          });
          positionDrop(); drop.style.display='block';
        }catch(e){ drop.style.display='none'; }
      }
      inp.addEventListener('focus',()=>{ if(inp.value.length>=2) schedSearch(inp.value); });
      inp.addEventListener('blur',()=>setTimeout(()=>{ drop.style.display='none'; },160));
      wrap.append(lbl,inp); bb.append(wrap);
      // Address field — auto-filled by selection, still editable
      const addrWrap=el('div',{class:'field'});
      const addrInp=el('input',{value:data.contractorAddr||'',placeholder:'Auto-filled on selection, or enter manually',
        oninput:e=>data.contractorAddr=e.target.value});
      addrWrap.append(el('label',{},'Contractor address'),addrInp); bb.append(addrWrap);
    })();
    const err=el('div',{style:'color:var(--rust);font-size:12px;min-height:16px'});
    const genBtn=el('button',{class:'btn accent',onclick:async()=>{
      if(!data.ownerEntity||!data.contractorName||!data.contractTotal){ err.textContent='Owner entity, contractor name and contract total are required.'; return; }
      genBtn.disabled=true; genBtn.textContent='Generating…'; err.textContent='';
      try{
        try{ await saveProjectSilent(p); }catch(se){ console.warn('pre-save before contract failed:',se.message); }
        const r=await fetch('/api/projects/'+p.id+'/contract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
        if(!r.ok){ const e=await r.json().catch(()=>({})); err.textContent=e.error||'Generation failed.'; genBtn.disabled=false; genBtn.textContent='Generate contract'; return; }
        const out=await r.json();
        const a=el('a',{href:out.downloadUrl}); document.body.append(a); a.click(); a.remove();
        scrim.remove(); close(); await afterWrite('Contract generated · '+out.contractFileName);
      }catch(e){ err.textContent='Failed: '+e.message; genBtn.disabled=false; genBtn.textContent='Generate contract'; }
    }},'Generate contract');
    bb.append(err, el('div',{style:'display:flex;gap:8px;margin-top:6px'}, el('div',{style:'flex:1'}), genBtn));
    sheet.append(head,bb); scrim.append(sheet); document.body.append(scrim);
  }

  function drawBids(){ slotsWrap.innerHTML=''; for(let i=0;i<3;i++) slotsWrap.append(bidSlot(i)); refreshMeta(); refreshGen(); }
  drawBids(); bidsWrap.append(summary,bidBody); b.append(bidsWrap);

  // --- countersigned contract upload ---
  if(!p.inHouse && !p.noContract){
    const csWrap=el('details',{class:'panel acc',style:'margin-top:16px',...(p.steps&&p.steps.signed?{open:''}:{})});
    const csMeta=el('span',{class:'bs-meta'});
    const csSum=el('summary',{class:'ph as-summary'},el('span',{class:'chev'},'▸'),el('h3',{},'Countersigned Contract'),el('div',{class:'sp'}),csMeta);
    const csBody=el('div',{class:'sb'});
    csBody.append(el('p',{class:'bs-hint',style:'margin-top:0'},'Drop the fully-executed PDF here. Auto-ticks "Signed & Countersigned" in the lifecycle.'));
    const csDropzone=el('div',{class:'drop-target',style:'border:2px dashed var(--line-2);border-radius:8px;padding:24px 16px;text-align:center;cursor:pointer;color:var(--ink-3);font-size:13px',
      ondragover:e=>{e.preventDefault();csDropzone.style.borderColor='var(--accent)';},
      ondragleave:()=>{csDropzone.style.borderColor='var(--line-2)';},
      ondrop:async e=>{e.preventDefault();csDropzone.style.borderColor='var(--line-2)';const file=e.dataTransfer.files[0];if(file)await uploadExecuted(file);},
      onclick:()=>csInput.click()
    },'📄 Drop fully-executed PDF here, or click to browse');
    const csInput=el('input',{type:'file',accept:'application/pdf',style:'display:none',onchange:async e=>{if(e.target.files[0])await uploadExecuted(e.target.files[0]);}});
    const csResult=el('div',{style:'margin-top:10px'});
    function showCsFile(fileKey,fileName){
      csResult.innerHTML='';
      if(!fileKey) return;
      const removeBtn=el('button',{class:'btn ghost sm',style:'color:var(--rust)',title:'Remove countersigned contract',onclick:async()=>{
        try{ await API.send('DELETE','/projects/'+p.id+'/contract-file');
          p.steps={...p.steps,signed:false}; p.contractFileKey=null; p.contractFileName=null;
          csResult.innerHTML=''; csMeta.textContent='Awaiting countersigned copy'; drawSteps(); toast('Countersigned contract removed');
        }catch(e){ toast('Remove failed: '+e.message); }
      }},'✕ Remove');
      csResult.append(el('div',{style:'display:flex;align-items:center;gap:8px;padding:8px 0'},
        el('a',{href:'/api/files/'+fileKey+'?name='+encodeURIComponent(fileName||'contract.pdf'),class:'btn ghost sm'},'⬇ '+(fileName||'contract.pdf')),
        removeBtn
      ));
    }
    async function uploadExecuted(file){
      csDropzone.textContent='Uploading…'; csDropzone.style.opacity='.6';
      try{
        const fd=new FormData(); fd.append('file',file);
        const r=await fetch('/api/projects/'+p.id+'/contract/upload',{method:'POST',body:fd});
        if(!r.ok){ const e=await r.json().catch(()=>({})); csDropzone.textContent='Upload failed: '+(e.error||r.status); csDropzone.style.opacity='1'; return; }
        const out=await r.json();
        csDropzone.textContent='📄 Drop fully-executed PDF here, or click to browse'; csDropzone.style.opacity='1';
        p.steps={...p.steps,signed:true}; p.contractFileKey=out.fileKey; p.contractFileName=out.fileName;
        showCsFile(out.fileKey,out.fileName);
        csMeta.textContent='Signed ✓'; csWrap.open=true;
        drawSteps(); toast('Executed contract uploaded ✓');
      }catch(e){ csDropzone.textContent='Upload failed: '+e.message; csDropzone.style.opacity='1'; }
    }
    function refreshCsMeta(){
      if(p.steps&&p.steps.signed){ csMeta.textContent='Signed ✓'; csWrap.open=true; }
      else{ csMeta.textContent='Awaiting countersigned copy'; }
    }
    refreshCsMeta();
    if(p.contractFileKey&&p.steps&&p.steps.signed) showCsFile(p.contractFileKey,p.contractFileName);
    csBody.append(csDropzone,csInput,csResult);
    csWrap.append(csSum,csBody); b.append(csWrap);
  }

  // --- lien waiver upload ---
  if(!p.inHouse && !p.noContract){
    const lwWrap=el('details',{class:'panel acc',style:'margin-top:16px',...(p.steps&&p.steps.lienWaiver?{open:''}:{})});
    const lwMeta=el('span',{class:'bs-meta'});
    const lwSum=el('summary',{class:'ph as-summary'},el('span',{class:'chev'},'▸'),el('h3',{},'Lien Waiver'),el('div',{class:'sp'}),lwMeta);
    const lwBody=el('div',{class:'sb'});
    lwBody.append(el('p',{class:'bs-hint',style:'margin-top:0'},'Drop the signed lien waiver here. Auto-ticks "Lien Waiver Received" only — no other lifecycle steps are affected (lien waivers often arrive before work is complete).'));
    const lwDropzone=el('div',{class:'drop-target',style:'border:2px dashed var(--line-2);border-radius:8px;padding:24px 16px;text-align:center;cursor:pointer;color:var(--ink-3);font-size:13px',
      ondragover:e=>{e.preventDefault();lwDropzone.style.borderColor='var(--accent)';},
      ondragleave:()=>{lwDropzone.style.borderColor='var(--line-2)';},
      ondrop:async e=>{e.preventDefault();lwDropzone.style.borderColor='var(--line-2)';const file=e.dataTransfer.files[0];if(file)await uploadLien(file);},
      onclick:()=>lwInput.click()
    },'📋 Drop signed lien waiver here, or click to browse');
    const lwInput=el('input',{type:'file',accept:'application/pdf',style:'display:none',onchange:async e=>{if(e.target.files[0])await uploadLien(e.target.files[0]);}});
    const lwResult=el('div',{style:'margin-top:10px'});
    function showLwFile(fileKey,fileName){
      lwResult.innerHTML='';
      if(!fileKey) return;
      const removeBtn=el('button',{class:'btn ghost sm',style:'color:var(--rust)',title:'Remove lien waiver',onclick:async()=>{
        try{ await API.send('DELETE','/projects/'+p.id+'/lien-file');
          p.steps={...p.steps,lienWaiver:false}; p.lienFileKey=null; p.lienFileName=null;
          lwResult.innerHTML=''; lwMeta.textContent='Awaiting waiver'; drawSteps(); toast('Lien waiver removed');
        }catch(e){ toast('Remove failed: '+e.message); }
      }},'✕ Remove');
      lwResult.append(el('div',{style:'display:flex;align-items:center;gap:8px;padding:8px 0'},
        el('a',{href:'/api/files/'+fileKey+'?name='+encodeURIComponent(fileName||'lien-waiver.pdf'),class:'btn ghost sm'},'⬇ '+(fileName||'lien-waiver.pdf')),
        removeBtn
      ));
    }
    async function uploadLien(file){
      lwDropzone.textContent='Uploading…'; lwDropzone.style.opacity='.6';
      try{
        const fd=new FormData(); fd.append('file',file);
        const r=await fetch('/api/projects/'+p.id+'/lien/upload',{method:'POST',body:fd});
        if(!r.ok){ const e=await r.json().catch(()=>({error:r.status})); lwDropzone.textContent='Upload failed: '+(e.error||r.status); lwDropzone.style.opacity='1'; return; }
        const out=await r.json();
        lwDropzone.textContent='📋 Drop signed lien waiver here, or click to browse'; lwDropzone.style.opacity='1';
        p.steps={...p.steps,lienWaiver:true}; p.lienFileKey=out.fileKey; p.lienFileName=out.fileName;
        showLwFile(out.fileKey,out.fileName);
        lwMeta.textContent='Received ✓'; lwWrap.open=true;
        drawSteps(); toast('Lien waiver uploaded ✓');
      }catch(e){ lwDropzone.textContent='Upload failed: '+e.message; lwDropzone.style.opacity='1'; }
    }
    if(p.steps&&p.steps.lienWaiver){ lwMeta.textContent='Received ✓'; lwWrap.open=true; }
    else{ lwMeta.textContent='Awaiting waiver'; }
    if(p.lienFileKey) showLwFile(p.lienFileKey,p.lienFileName);
    lwBody.append(lwDropzone,lwInput,lwResult);
    lwWrap.append(lwSum,lwBody); b.append(lwWrap);
  }

  // --- lifecycle steps ---
  const stepsPanel=el('div',{class:'panel',style:'margin-top:16px'});
  stepsPanel.append(el('div',{class:'ph'}, el('h3',{},'Lifecycle'), el('div',{class:'sp'}),
    el('button',{class:'btn sm',onclick:()=>{
      const keys=appKeys(p); let cur=-1; keys.forEach((k,idx)=>{if(p.steps[k])cur=idx;});
      const next=keys[cur+1];
      if(next){ p.steps[next]=true; const gi=STEP_KEYS.indexOf(next);
        if(gi>APPROVED_IDX){ STEP_KEYS.slice(0,gi).forEach(k=>{ if(!isNA(p,k))p.steps[k]=true; }); }
        drawSteps(); }
    }},'Advance ▸')));
  const stepBody=el('div',{class:'pad'}); const stepsList=el('div',{class:'steps'});
  function drawSteps(){
    stepsList.innerHTML='';
    LIFECYCLE.forEach((s,i)=>{
      const na=isNA(p,s.key);
      const on=!na && !!p.steps[s.key];
      const row=el('div',{class:'step'+(on?' on':'')+(na?' na':'')});
      row.append(el('div',{class:'num'}, na?'–':(on?'✓':String(i+1))),
        el('div',{style:'flex:1'}, el('div',{class:'nm'},s.label), el('div',{class:'ds'}, na?'Not applicable — no contract needed.':s.desc)));
      if(na){
        row.append(el('div',{class:'toggle'}, el('span',{class:'na-badge'},'N/A')));
      } else {
        const sw=el('button',{class:'switch'+(on?' on':''),title:'toggle',onclick:()=>{
          const nv=!p.steps[s.key];
          p.steps[s.key]=nv;
          if(i<=APPROVED_IDX){
            if(!nv && i===APPROVED_IDX){ STEP_KEYS.slice(i+1).forEach(k=>p.steps[k]=false); }
          } else {
            if(nv){ STEP_KEYS.slice(0,i).forEach(k=>{ if(!isNA(p,k))p.steps[k]=true; }); }
            else  { STEP_KEYS.slice(i+1).forEach(k=>p.steps[k]=false); }
          }
          drawSteps();
        }});
        row.append(el('div',{class:'toggle'},sw));
      }
      stepsList.append(row);
    });
  }
  drawSteps(); stepBody.append(stepsList); stepsPanel.append(stepBody); b.append(stepsPanel);

  // show contractor panels or in-house panel depending on mode
  function applyMode(){
    const ih=!!p.inHouse;
    contractorCost.style.display=ih?'none':'';
    inhouseCost.style.display=ih?'':'none';
    inhousePanel.style.display=ih?'':'none';
    bidsWrap.style.display=ih?'none':'';
    stepsPanel.style.display=ih?'none':'';
    sheet.classList.toggle('ih-mode',ih);
  }
  applyMode();

  // notes
  const np=el('div',{class:'panel pad',style:'margin-top:16px'});
  np.append(el('div',{class:'field'}, el('label',{},'Notes'), el('textarea',{oninput:e=>p.notes=e.target.value},p.notes||'')));
  b.append(np);

  if(!isNew){
    b.append(el('div',{style:'margin-top:18px;display:flex'}, el('div',{style:'flex:1'}),
      el('button',{class:'btn danger',onclick:()=>{if(confirm('Delete this project?'))del();}},'Delete project')));
    // linked GL
    const gls=S.gl.filter(g=>g.linkedProjectId===p.id);
    if(gls.length){
      const gp=el('div',{class:'panel',style:'margin-top:16px;overflow:auto'});
      gp.append(el('div',{class:'ph'}, el('h3',{},'Linked ledger entries')));
      const t=el('table',{class:'tbl'});t.append(el('thead',{},tr(th('Date'),th('Vendor'),th('Amount','r'))));
      const tbb=el('tbody');gls.forEach(g=>tbb.append(tr(td(g.date),td(g.vendor),tdn(g.amount,1))));
      t.append(tbb);gp.append(t);b.append(gp);
    }
  }

  // Two-column layout: everything on the left, the lifecycle track on the right
  // (keeps notes visible without scrolling past the tall step list).
  const edGrid=el('div',{class:'editor-grid'});
  const edMain=el('div',{class:'ed-main'});
  const edSide=el('div',{class:'ed-side'});
  Array.from(b.childNodes).forEach(n=>{ if(n===stepsPanel) edSide.append(n); else edMain.append(n); });
  edGrid.append(edMain, edSide);
  b.append(edGrid);
  applyMode();

  sheet.append(head,b); scrim.append(sheet); document.body.append(scrim);
}

/* =========================================================
   BUDGET TRACKER  (GL drag-and-drop assignment)
========================================================= */
function budgetTracker(code, glRows){
  /* pool zone replaced with sticky return-to-pool bar in the budget table — see below */
  /* glRows: live <tr> elements from the GL table — passed so we can
     re-render chips without a full page reload on unlink.           */
  const projs=projForProp(code).filter(p2=>!p2.inHouse);
  const allGls=S.gl.filter(g=>g.property===code);
  function linkedGls(pr){ return allGls.filter(g=>g.linkedProjectId===pr.id); }
  function effectiveSpent(pr){
    if(pr.actualCost!=null) return Number(pr.actualCost);
    return linkedGls(pr).reduce((a,g)=>a+(Number(g.amount)||0),0);
  }
  const totalBudget=projs.reduce((a,p2)=>a+(Number(p2.anticipatedCost)||0),0);
  const totalSpent =projs.reduce((a,p2)=>a+effectiveSpent(p2),0);
  const totalVar   =totalSpent-totalBudget;
  const panel=el('div',{class:'panel'});
  panel.append(el('div',{class:'ph'},
    el('h3',{},'SP Budget Tracker'), el('div',{class:'sp'}),
    el('span',{class:'chip'},projs.length+' budget items'),
    allGls.length?el('span',{class:'chip'},'GL loaded · '+allGls.length+' lines'):null));
  /* summary strip */
  const strip=el('div',{style:'display:flex;border-bottom:1px solid var(--line-2)'});
  const kk=(lbl,val)=>{
    const d=el('div',{style:'flex:1;padding:12px 16px;text-align:center;border-right:1px solid var(--line-2)'});
    d.append(el('div',{style:'font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600'},lbl));
    d.append(el('div',{class:'mono',style:'font-size:18px;font-weight:700;margin-top:3px'},fmt(val)));
    return d;
  };
  const varColor=totalVar>500?'var(--rust)':totalVar<-500?'var(--green)':'var(--ink)';
  const varEl=el('div',{style:'flex:1;padding:12px 16px;text-align:center'});
  varEl.append(el('div',{style:'font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600'},'Variance'));
  varEl.append(el('div',{class:'mono',style:`font-size:18px;font-weight:700;margin-top:3px;color:${varColor}`},(totalVar>=0?'+':'')+fmt(totalVar,false)));
  varEl.append(el('div',{style:'font-size:11px;color:var(--ink-3);margin-top:2px'},
    totalVar<-100?fmt(Math.abs(totalVar),false)+' available to reallocate':totalVar>100?'over budget':'on budget'));
  strip.append(kk('Total Budget',totalBudget),kk('Total Spent',totalSpent),varEl);
  panel.append(strip);
  /* per-project cards */
  const list=el('div');
  const sorted=[...projs].sort((a,b)=>(stage(b)-stage(a))||((Number(b.anticipatedCost)||0)-(Number(a.anticipatedCost)||0)));
  sorted.forEach(pr=>{
    const budget=Number(pr.anticipatedCost)||0;
    const gLinked=linkedGls(pr);
    const spent=effectiveSpent(pr);
    const variance=spent-budget;
    const clampPct=budget?Math.min(spent/budget,1):0;
    const isOver=budget>0&&spent>budget;
    const isWarn=!isOver&&budget>0&&spent/budget>=0.75;
    const barColor=isOver?'var(--rust)':isWarn?'var(--amber)':'var(--green)';
    const card=el('div',{style:'padding:14px 16px;border-bottom:1px solid var(--line-2)'});
    /* header row */
    card.append(el('div',{style:'display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap'},
      el('strong',{style:'font-size:13px;flex:1;min-width:0;cursor:pointer;text-decoration:underline dotted',onclick:()=>openProject(pr.id)},pr.name||'(untitled)'),
      el('span',{style:'font-size:11px;background:var(--panel-2);border:1px solid var(--line-2);border-radius:4px;padding:2px 7px;color:var(--ink-2);white-space:nowrap'},pr.category||'—'),
      pr.plannedStart?el('span',{style:'font-size:11px;color:var(--ink-3);white-space:nowrap'},pr.plannedStart):null
    ));
    /* progress bar */
    const barBg=el('div',{style:'background:var(--line);border-radius:6px;height:10px;margin-bottom:10px;overflow:hidden'});
    barBg.append(el('div',{style:`width:${Math.round(clampPct*100)}%;height:100%;background:${barColor};border-radius:6px;transition:width .4s`}));
    card.append(barBg);
    /* numbers */
    const nums=el('div',{style:'display:flex;gap:20px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px'});
    const nc=(lbl,content)=>{const d=el('div',{});d.append(el('div',{style:'font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);margin-bottom:2px'},lbl));d.append(content);return d;};
    nums.append(nc('Budget',el('span',{class:'mono',style:'font-size:15px;font-weight:700'},budget?fmt(budget):'—')));
    /* spent (click to manually override) */
    const spentWrap=el('div',{});
    function redrawSpent(){
      spentWrap.innerHTML='';
      const s=effectiveSpent(pr);
      const isManual=pr.actualCost!=null;
      spentWrap.append(el('div',{style:'font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);margin-bottom:2px'},isManual?'Spent (manual)':'Spent (GL)'));
      const r2=el('div',{style:'display:flex;gap:5px;align-items:center;cursor:pointer',title:'Click to set manual override',
        onclick:()=>{
          spentWrap.innerHTML='';
          spentWrap.append(el('div',{style:'font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);margin-bottom:2px'},'Spent'));
          const inp=el('input',{type:'number',value:pr.actualCost!=null?pr.actualCost:'',placeholder:'0',
            style:'width:110px;padding:4px 8px;font-size:13px;border:1px solid var(--accent,#c2802b);border-radius:5px;font-family:var(--mono)',
            onblur:async e=>{const v=e.target.value===''?null:+e.target.value;pr.actualCost=v;await saveProject(pr,'Spent updated');redrawSpent();},
            onkeydown:e=>{if(e.key==='Enter')e.target.blur();if(e.key==='Escape')redrawSpent();}
          });
          spentWrap.append(inp); inp.focus(); inp.select();
        }});
      r2.append(el('span',{class:'mono',style:'font-size:15px;font-weight:700'},s?fmt(s):'—'));
      r2.append(el('span',{style:'font-size:10px;color:var(--ink-3)'},'✎'));
      if(isManual)r2.append(el('button',{class:'btn ghost sm',style:'font-size:10px;padding:1px 5px',title:'Clear override',
        onclick:async e=>{e.stopPropagation();pr.actualCost=null;await saveProject(pr,'Override cleared');redrawSpent();}},'×'));
      spentWrap.append(r2);
    }
    redrawSpent();
    nums.append(nc('',spentWrap));
    const varC=budget?(variance>=0?'var(--rust)':'var(--green)'):'var(--ink-3)';
    nums.append(nc('Variance',el('span',{class:'mono',style:`font-size:15px;font-weight:700;color:${varC}`},budget?(variance>=0?'+':'')+fmt(variance,false):'—')));
    if(budget)nums.append(el('span',{style:`align-self:flex-end;padding-bottom:1px;font-size:12px;font-weight:600;color:${barColor}`},Math.round(clampPct*100)+'% used'));
    card.append(nums);
    /* linked GL chips */
    const chipsWrap=el('div',{style:'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;min-height:0'});
    function redrawChips(){
      chipsWrap.innerHTML='';
      const lgs=linkedGls(pr);
      if(!lgs.length){chipsWrap.style.display='none';return;}
      chipsWrap.style.display='flex';
      lgs.forEach(g=>{
        const chip=el('div',{style:'display:inline-flex;align-items:center;gap:5px;background:var(--green-soft);border:1px solid var(--green);border-radius:6px;padding:3px 8px;font-size:12px'});
        chip.append(el('span',{class:'mono',style:'font-weight:600'},fmt(g.amount,false)));
        chip.append(el('span',{style:'color:var(--ink-2)'},g.vendor?(' · '+g.vendor.slice(0,22)):''));
        if(g.date)chip.append(el('span',{style:'color:var(--ink-3);font-size:11px'},' '+g.date));
        chip.append(el('button',{class:'btn ghost sm',style:'padding:0 2px;font-size:11px;line-height:1;margin-left:2px',title:'Unlink',
          onclick:async()=>{g.linkedProjectId=null;await linkGl(g,'GL unlinked');/* afterWrite re-renders */}},'✕'));
        chipsWrap.append(chip);
      });
    }
    redrawChips();
    card.append(chipsWrap);
    /* drop zone — receives dragged GL rows */
    const dz=el('div',{
      style:'border:2px dashed var(--line);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--ink-3);text-align:center;transition:background .15s,border-color .15s;cursor:default',
      ondragover:e=>{e.preventDefault();dz.style.background='var(--wheat-soft)';dz.style.borderColor='var(--wheat)';},
      ondragleave:()=>{dz.style.background='';dz.style.borderColor='var(--line)';},
      ondrop:async e=>{
        e.preventDefault();dz.style.background='';dz.style.borderColor='var(--line)';
        const gid=e.dataTransfer.getData('glId');
        if(!gid)return;
        const g=S.gl.find(x=>x.id===gid||String(x.id)===gid);
        if(!g){toast('GL line not found');return;}
        g.linkedProjectId=pr.id;
        await linkGl(g,'GL assigned · '+pr.name);
        /* afterWrite triggers full re-render */
      }
    },'↓ Drop GL lines here to assign spend');
    card.append(dz);
    /* status comment */
    const stWrap=el('div',{style:'margin-top:8px'});
    function redrawStatus(){
      stWrap.innerHTML='';
      const note=pr.notes||'';
      stWrap.append(el('div',{style:'display:flex;gap:6px;align-items:flex-start;cursor:pointer;min-height:20px',title:'Click to edit status',
        onclick:()=>{
          stWrap.innerHTML='';
          const ta=el('textarea',{placeholder:'Add status / comment…',rows:2,
            style:'width:100%;padding:5px 8px;font-size:12px;border:1px solid var(--accent,#c2802b);border-radius:5px;resize:vertical;box-sizing:border-box',
            onblur:async e=>{pr.notes=e.target.value;await saveProject(pr,'Status updated');redrawStatus();},
            onkeydown:e=>{if(e.key==='Escape')redrawStatus();}
          });
          ta.value=note; stWrap.append(ta); ta.focus();
        }},
        el('span',{style:'font-size:11px;color:var(--ink-3);line-height:1.6'},'💬'),
        el('span',{style:'font-size:12px;color:'+(note?'var(--ink)':'var(--ink-3);font-style:italic')},note||'Add status comment…')
      ));
    }
    redrawStatus();
    card.append(stWrap);
    list.append(card);
  });
  if(!projs.length)list.append(el('div',{class:'empty'},'No budget items yet. Add them with + New project above.'));
  panel.append(list);
  return panel;
}


/* =========================================================
   PROPERTY DETAIL
========================================================= */
function viewProperty(){
  const code=VIEW.prop||S.properties[0].code;
  if(code==='WVMO'||code==='SPMO'||code==='HRMO') return viewPropertyBudgetTracker(code);
  const p=PROP(code); const c=S.cash[code]||{};
  const budget=Number(p.spBudget)||0;
  const glSpent=glSpentFor(code);
  const cushSpent=c.spSpent!=null?Number(c.spSpent):null;
  const spent=glSpent||cushSpent||0;
  const remaining=budget-spent;
  const cm=cashModel(code);
  const am=auditModel(code);
  const usedPct=budget?spent/budget:0;
  const cashToday=cm.cashToday;
  const cpd=p.units?cashToday/Number(p.units):null;
  // years remaining on the loan, from the cash record's maturity date (MM/DD/YYYY)
  let loanYrs=null;
  if(c.loanDue){ const m=String(c.loanDue).split('/'); if(m.length===3){ const due=new Date(+m[2],+m[0]-1,+m[1]); if(!isNaN(due)){ loanYrs=(due-new Date())/(1000*60*60*24*365.25); } } }
  const cashPerYr=(loanYrs!=null&&loanYrs>0)?cashToday/loanYrs:null;
  // conditional formatting
  const remTone = remaining<0?'bad':(budget&&remaining<budget*0.15?'warn':'good');
  const cpdTone = cpd==null?'none':(cpd>=3000?'good':(cpd>=2000?'warn':'bad'));   // green >$3k · yellow $2k–$3k · red <$2k
  const projTone = cm.projectedCash<0?'bad':(cm.projectedCash<cashToday*0.25?'warn':'good');
  const bar=propHead(p,
    [ el('button',{class:'btn',onclick:()=>{VIEW.tab='cash';render();}},'Adjust cash'),
      el('button',{class:'btn accent',onclick:()=>{VIEW.prop=code;openProject(null);}},'+ New project') ],
    [ hstat('Current cash', fmt(cashToday), 'none', c.asOfDate?('as of '+c.asOfDate):'snapshot + adj'),
      hstat('SP budget (2026)', fmt(budget), 'none'),
      hstat('Spent to date', fmt(spent), 'none', 'posted per GL'),
      hstat('Remaining', fmt(remaining), remTone, pct(usedPct)+' used'),
      hstat('Projected cash', fmt(cm.projectedCash), projTone, 'after committed'),
      hstat('Cash / door', cpd==null?'—':fmt(cpd), cpdTone, p.units?`${p.units} units`:'no unit count'),
      hstat('Cash / yr of loan', cashPerYr==null?'—':fmt(cashPerYr), 'none', loanYrs!=null&&loanYrs>0?`${loanYrs.toFixed(1)} yrs to ${c.loanDue}`:'no loan maturity') ]);
  const body=el('div',{class:'grid',style:'grid-template-columns:330px 1fr'});

  // LEFT: cash + loan
  const left=el('div',{class:'grid',style:'gap:16px;align-content:start'});
  const cashPanel=el('div',{class:'panel'});
  cashPanel.append(el('div',{class:'ph'}, el('h3',{},'Cash position'), el('div',{class:'sp'}), el('span',{class:'chip'},`snapshot ${c.asOfDate||S.meta.cashAsOf||'—'}`)));
  const sl=el('div',{class:'pad stat-list'});
  const row=(k,v,cls,sub)=>el('div',{class:'sl'+(cls?' '+cls:'')}, el('span',{class:'k'},k,sub?el('span',{class:'sl-sub'},sub):null), el('span',{class:'v'+(typeof v==='number'&&v<0?' neg':'')},typeof v==='number'?fmt(v):v));
  // Projected cash with an expandable, line-by-line breakdown by status.
  const projCashRow=(()=>{
    const mini=(k,v,o={})=>el('div',{style:`display:flex;justify-content:space-between;gap:10px;padding:2px 0;font-size:12px;${o.strong?'font-weight:600;':'color:var(--ink-2);'}${o.indent?'padding-left:16px;':''}`},
      el('span',{},k), el('span',{class:'mono'+((typeof v==='number'&&v<0)?' neg':'')}, typeof v==='number'?fmt(v):v));
    const grp=t=>el('div',{style:'font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin:8px 0 2px'},t);
    const bd=el('div',{style:'padding:8px 0 2px;border-top:1px dashed var(--line-2);margin-top:6px'});
    bd.append(mini('Cash today',cm.cashToday,{strong:true}));
    if(cm.outstanding.length){
      bd.append(grp('Less — outstanding (approved, not yet paid)'));
      cm.outstanding.forEach(p=>bd.append(mini('− '+(p.name||'(untitled)'), -(p.inHouse?ihRemaining(p):projOutflow(p)), {indent:true})));
      bd.append(mini('Subtotal outstanding', -cm.outstandingTotal, {strong:true,indent:true}));
    } else { bd.append(mini('Less — outstanding', 0, {indent:true})); }
    bd.append(mini('= Projected cash', cm.projectedCash, {strong:true}));
    if(cm.paid.length){
      bd.append(grp('For reference — paid (already out)'));
      cm.paid.forEach(p=>bd.append(mini(p.name||'(untitled)', (p.inHouse?ihDone(p):projOutflow(p)), {indent:true})));
    }
    if(cm.discussed.length){
      bd.append(grp('For reference — discussed (not committed)'));
      cm.discussed.forEach(p=>bd.append(mini(p.name||'(untitled)', projOutflow(p), {indent:true})));
    }
    const d=el('details',{});
    d.append(el('summary',{class:'sl',style:'cursor:pointer;align-items:flex-start'},
      el('span',{class:'k'},'Projected cash', el('span',{class:'sl-sub'},'once open work is paid · show math')),
      el('span',{class:'v'+(cm.projectedCash<0?' neg':'')}, fmt(cm.projectedCash))), bd);
    return d;
  })();
  sl.append(
    row('Cash snapshot', cm.snapshot==null?'—':cm.snapshot,null,'from cushion report'),
    row('Mid-month adjustments', cm.adj),
    row('Cash today', cm.cashToday,'hl','final · actual'),
    row('Outstanding commitments', cm.outstandingTotal?-cm.outstandingTotal:0,null,'approved, not yet paid'),
    projCashRow,
    row('Spent vs SP budget', budget-(spent+cm.outstandingTotal),null,'budget less spent & committed'),
    cm.discussedTotal?row('Discussed / ideas', cm.discussedTotal,null,'not yet committed'):null,
  );
  cashPanel.append(sl);

  const loanPanel=el('div',{class:'panel'});
  loanPanel.append(el('div',{class:'ph'}, el('h3',{},'Loan & valuation')));
  const sl3=el('div',{class:'pad stat-list'});
  sl3.append(
    row('Market value', c.marketValue!=null?Number(c.marketValue):'—'),
    row('Loan amount', c.loanAmount!=null?Number(c.loanAmount):'—'),
    row('LTV', c.ltv!=null?pct(c.ltv):'—'),
    row('Loan rate', c.loanRate!=null?pct(c.loanRate):'—'),
    row('Loan matures', c.loanDue||'—'),
    row('DCR', c.dcr!=null?Number(c.dcr).toFixed(2)+'x':'—'),
    row('NOI', c.noi!=null?Number(c.noi):'—'),
    row('Units', p.units||'—'),
  );
  loanPanel.append(sl3); left.append(loanPanel);

  // RIGHT: projects (grouped) + reconciliation + GL
  const right=el('div',{class:'grid',style:'gap:16px;align-content:start'});
  const projs=projForProp(code).filter(p2=>inDateRange(p2,PFILT));
  const pj=el('div',{class:'panel'});
  const counts={}; PHASES.forEach(ph=>counts[ph.key]=projs.filter(p2=>phase(p2)===ph.key).length);
  pj.append(el('div',{class:'ph'}, el('h3',{},'Projects'), el('div',{class:'sp'}), el('span',{class:'chip'},`${projs.length} total`)));
  // phase filter chips — click to hide/show a completion group
  const filt=el('div',{class:'phasefilt'});
  PHASES.forEach(ph=>{ if(!counts[ph.key])return; const hidden=!!PFILT.hide[ph.key];
    filt.append(el('button',{class:'pf-chip'+(hidden?' off':''),title:hidden?'Show':'Hide',onclick:()=>{PFILT.hide[ph.key]=!PFILT.hide[ph.key];render();}},
      el('span',{},ph.label), el('span',{class:'pf-n'},String(counts[ph.key]))));
  });
  pj.append(el('div',{class:'pad',style:'padding-bottom:8px'},dateFilterGroup(PFILT),el('div',{style:'height:9px'}),filt,
    el('div',{style:'font-size:11px;color:var(--ink-3);margin-top:8px'},'Auto-grouped by completion. Click a group to hide it; 📌 pins a project to the top.')));
  const pb=el('div',{style:'max-height:560px;overflow:auto;padding-bottom:6px'});
  if(!projs.length)pb.append(el('div',{class:'empty'},'No projects yet for this property.'));
  function projRow(pr){
    const ih=isInHouse(pr);
    const r=el('div',{class:'clickrow proj-row',style:'padding:11px 16px;border-bottom:1px solid var(--line-2)',onclick:()=>openProject(pr.id)});
    const topr=el('div',{style:'display:flex;gap:8px;align-items:center;margin-bottom:6px'},
      el('button',{class:'pinbtn'+(pr.pinned?' on':''),title:pr.pinned?'Unpin':'Pin to top',onclick:e=>{e.stopPropagation();pr.pinned=!pr.pinned;saveProject(pr,pr.pinned?'Pinned':'Unpinned');}},'📌'),
      el('strong',{style:'font-size:13px;flex:1;min-width:0'},pr.name),
      ih?el('span',{class:'chip ih'},'In-house'):null,
      el('span',{style:'font-size:11px;color:var(--ink-3)'},pr.category),
      el('span',{style:'font-size:11px;color:var(--ink-3);white-space:nowrap'},'· '+fmtDate(pr.dateAdded)),
      el('span',{class:'mono',style:'font-size:12px;font-weight:600'},fmt(ih?ihTotal(pr):(pr.actualCost!=null?pr.actualCost:pr.anticipatedCost),false)));
    r.append(topr, ih?progressEl(pr):trackEl(pr));
    return r;
  }
  const pinned=projs.filter(p2=>p2.pinned && !PFILT.hide[phase(p2)]);
  if(pinned.length){ pb.append(el('div',{class:'grp-h pinned'},'📌 Pinned', el('span',{class:'grp-n'},String(pinned.length)))); pinned.forEach(pr=>pb.append(projRow(pr))); }
  PHASES.forEach(ph=>{
    if(PFILT.hide[ph.key])return;
    const list=projs.filter(p2=>phase(p2)===ph.key && !p2.pinned);
    if(!list.length)return;
    list.sort((a,b)=>(stage(b)-stage(a))||(b.dateAdded||'').localeCompare(a.dateAdded||''));
    pb.append(el('div',{class:'grp-h'}, ph.label, el('span',{class:'grp-n'},String(list.length))));
    list.forEach(pr=>pb.append(projRow(pr)));
  });
  pj.append(pb);

  // reconciliation & flags
  const auditP=el('div',{class:'panel'});
  const reviewN=am.unplanned.length+am.paidNoGL.length;
  auditP.append(el('div',{class:'ph'}, el('h3',{},'Reconciliation & flags'), el('div',{class:'sp'}),
    el('span',{class:'chip'+(reviewN?' hold':' done')}, reviewN?`${reviewN} to review`:'all clear')));
  const ab=el('div',{class:'pad'});
  ab.append(el('div',{class:'recon'},
    reconCell('GL posted',am.glTotal),
    reconCell('Paid per tracker',cm.paidTotal),
    reconCell('Difference',am.glTotal-cm.paidTotal,Math.abs(am.glTotal-cm.paidTotal)>OVER_THRESHOLD)));
  ab.append(flagBlock('Posted over $5,000 — unplanned',
    am.unplanned.map(g=>({title:g.vendor||g.category,sub:(g.date||'')+' · '+g.category,amt:g.amount})),'rust',
    'Large ledger postings not linked to a tracked project. Link them on the ledger below, or add the project so the spend is accounted for.'));
  ab.append(flagBlock('Marked paid — no ledger match',
    am.paidNoGL.map(p2=>({title:p2.name,sub:p2.category,amt:projOutflow(p2),onclick:()=>openProject(p2.id)})),'amber',
    'Flagged paid in the tracker but with no linked GL entry to confirm. Link a ledger line below to finalize.'));
  auditP.append(ab); right.append(auditP);

  // GL
  const gls=S.gl.filter(g=>g.property===code);
  const gp=el('div',{class:'panel',style:'overflow:auto'});
  gp.append(el('div',{class:'ph'}, el('h3',{},'General ledger — SP spend'), el('div',{class:'sp'}), el('span',{class:'chip'},`${gls.length} lines`), el('span',{class:'chip'},fmt(glSpent))));
  if(gls.length){
    const t=el('table',{class:'tbl'});
    t.append(el('thead',{},tr(th('Date'),th('Category'),th('Vendor / description'),th('Amount','r'),th('Match'))));
    const tbb=el('tbody');
    gls.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    gls.forEach(g=>{
      tbb.append(tr(td(el('span',{class:'mono',style:'font-size:12px'},g.date)),td(el('span',{style:'font-size:12px'},g.category)),
        td(el('div',{style:'font-size:12px;max-width:260px'}, el('div',{},g.vendor), g.remarks?el('div',{style:'color:var(--ink-3);font-size:11px'},g.remarks):null)),
        tdn(g.amount,1), td(glLinkCell(g,code))));
    });
    t.append(tbb); gp.append(t);
  } else gp.append(el('div',{class:'empty'},'No ledger lines for this property. Upload a general ledger on the Data tab.'));
  right.append(gp);
  body.append(left, right);
  return {bar,body};
}

/* WVMO — budget-tracker layout (pilot) */

/* =========================================================
   PROPERTY DETAIL
========================================================= */
/* =========================================================
   WVMO — PILOT: active-projects + budget-tracker layout
========================================================= */
const _BUDGET_IDS={
  WVMO:new Set(['bb644402-5eb9-4b40-85e7-56a555f20a1a','10117f84-31ff-4b2b-8c9c-bdb566851f01','22aa6995-b149-455c-b364-58725544969c','e1f4656e-a17b-4f6d-b182-48500b9c8994','90bee722-5f8e-4255-b11b-35b2a86da290','8de979e9-cfff-404b-a211-2f62706491f9','16c1b277-824b-40a5-9694-8531dbfbe072','fcbc2db6-37c5-45c1-944e-6bdb9ed1bf21','4de13189-dd1a-4074-9319-6d171ed29346','08acfbe7-a08d-4cfc-a744-c060ee425d6e','0be24236-d6af-4f6a-b8d0-a6a70233ad19']),
  HRMO:new Set([]),
  SPMO:new Set(['0180566f-5362-4c8e-828b-520937d8e39b','41a10bc0-9b34-47b7-a7ab-c34d9473885a','02d18241-ab6d-4279-8696-26251ffba049','5bc7a20e-d582-457c-a1ac-c1c204669fb4','395106be-8007-4ba5-83e4-810cab518d3b','d8eca409-eb06-40c4-b2b4-007bf709be50','2aa21f5e-d209-41d5-bc50-05a6a9497381','a049a011-ddd5-40e7-a9c3-f6166323a905','98bfd486-4999-43d3-8b09-1dd561c4d37c','823048da-123e-4dd7-b491-e0de8b567da3','87c67135-683f-4b11-ad2c-b5e67094f371','e08a6bcd-2835-40ad-8b03-c0150e4e2020','fcd4dfe2-0d70-40e7-af72-53755bce6749']),
};
function viewPropertyBudgetTracker(code){
  const p=PROP(code); const c=S.cash[code]||{};
  const budget=Number(p.spBudget)||0;
  const glSpent=glSpentFor(code);
  const spent=glSpent||(c.spSpent!=null?Number(c.spSpent):0);
  const remaining=budget-spent;
  const cm=cashModel(code);
  const cashToday=cm.cashToday;
  const cpd=p.units?cashToday/Number(p.units):null;
  let loanYrs=null;
  if(c.loanDue){const m=String(c.loanDue).split('/');if(m.length===3){const due=new Date(+m[2],+m[0]-1,+m[1]);if(!isNaN(due))loanYrs=(due-new Date())/(1000*60*60*24*365.25);}}
  const remTone=remaining<0?'bad':(budget&&remaining<budget*0.15?'warn':'good');
  const projTone=cm.projectedCash<0?'bad':(cm.projectedCash<cashToday*0.25?'warn':'good');
  const cpdTone=cpd==null?'none':(cpd>=3000?'good':(cpd>=2000?'warn':'bad'));
  const cashPerYr=(loanYrs!=null&&loanYrs>0)?cashToday/loanYrs:null;

  const bar=propHead(p,
    [el('button',{class:'btn',onclick:()=>{VIEW.tab='cash';render();}},'Adjust cash'),
     el('button',{class:'btn accent',onclick:()=>{VIEW.prop=code;openProject(null);}},'+ New project')],
    [hstat('Current cash',fmt(cashToday),'none',c.asOfDate?('as of '+c.asOfDate):'snapshot + adj'),
     hstat('SP budget (2026)',fmt(budget),'none'),
     hstat('Spent to date',fmt(spent),'none','posted per GL'),
     hstat('Remaining',fmt(remaining),remTone,pct(budget?spent/budget:0)+' used'),
     hstat('Projected cash',fmt(cm.projectedCash),projTone,'after committed'),
     hstat('Outstanding',cm.outstandingTotal?fmt(cm.outstandingTotal):'—',cm.outstandingTotal>0?'warn':'none','approved, not yet paid'),
     hstat('Cash / door',cpd==null?'—':fmt(cpd),cpdTone,p.units?`${p.units} units`:'no unit count'),
     hstat('Cash / yr of loan',cashPerYr==null?'—':fmt(cashPerYr),'none',loanYrs!=null&&loanYrs>0?`${loanYrs.toFixed(1)} yrs to ${c.loanDue}`:'no loan maturity')]);

  const body=el('div',{class:'grid',style:'gap:16px'});

  /* ── CASH POSITION (top, full width) ─────────────────── */
  const cashPanel=el('div',{class:'panel'});
  cashPanel.append(el('div',{class:'ph'},el('h3',{},'Cash position'),el('div',{class:'sp'}),el('span',{class:'chip'},`snapshot ${c.asOfDate||S.meta.cashAsOf||'—'}`)));
  const sl=el('div',{class:'pad stat-list',style:'display:grid;grid-template-columns:1fr 1fr;gap:0 24px'});
  const row=(k,v,cls,sub)=>el('div',{class:'sl'+(cls?' '+cls:'')},el('span',{class:'k'},k,sub?el('span',{class:'sl-sub'},sub):null),el('span',{class:'v'+(typeof v==='number'&&v<0?' neg':'')},typeof v==='number'?fmt(v):v));
  const projCashRow=(()=>{
    const mini=(k,v,o={})=>el('div',{style:`display:flex;justify-content:space-between;gap:10px;padding:2px 0;font-size:12px;${o.strong?'font-weight:600;':'color:var(--ink-2);'}${o.indent?'padding-left:16px;':''}`},el('span',{},k),el('span',{class:'mono'+((typeof v==='number'&&v<0)?' neg':'')},typeof v==='number'?fmt(v):v));
    const grp=t=>el('div',{style:'font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin:8px 0 2px'},t);
    const bd=el('div',{style:'padding:8px 0 2px;border-top:1px dashed var(--line-2);margin-top:6px'});
    bd.append(mini('Cash today',cm.cashToday,{strong:true}));
    if(cm.outstanding.length){bd.append(grp('Less — outstanding'));cm.outstanding.forEach(p2=>bd.append(mini('− '+(p2.name||'(untitled)'),-(p2.inHouse?ihRemaining(p2):projOutflow(p2)),{indent:true})));bd.append(mini('Subtotal outstanding',-cm.outstandingTotal,{strong:true,indent:true}));}else{bd.append(mini('Less — outstanding',0,{indent:true}));}
    bd.append(mini('= Projected cash',cm.projectedCash,{strong:true}));
    if(cm.paid.length){bd.append(grp('Paid (already out)'));cm.paid.forEach(p2=>bd.append(mini(p2.name||'(untitled)',p2.inHouse?ihDone(p2):projOutflow(p2),{indent:true})));}
    if(cm.discussed.length){bd.append(grp('Discussed (not committed)'));cm.discussed.forEach(p2=>bd.append(mini(p2.name||'(untitled)',projOutflow(p2),{indent:true})));}
    const d=el('details',{});
    d.append(el('summary',{class:'sl',style:'cursor:pointer;align-items:flex-start'},el('span',{class:'k'},'Projected cash',el('span',{class:'sl-sub'},'once open work is paid · show math')),el('span',{class:'v'+(cm.projectedCash<0?' neg':'')},fmt(cm.projectedCash))),bd);
    return d;
  })();
  sl.append(
    row('Cash snapshot',cm.snapshot==null?'—':cm.snapshot,null,'from cushion report'),
    row('Mid-month adjustments',cm.adj),
    row('Cash today',cm.cashToday,'hl','final · actual'),
    row('Outstanding commitments',cm.outstandingTotal?-cm.outstandingTotal:0,null,'approved, not yet paid'),
    projCashRow,
    row('Spent vs SP budget',budget-(spent+cm.outstandingTotal),null,'budget less spent & committed'),
    cm.discussedTotal?row('Discussed / ideas',cm.discussedTotal,null,'not yet committed'):null,
  );
  cashPanel.append(sl);

  /* ── ACTIVE PROJECTS + BUDGET TABLE + GL (full width) ─── */
  const allGls=S.gl.filter(g=>g.property===code&&!g.deleted);
  /* Identify budget line items: either flagged by migration 006 OR known by seed IDs from migration 005 */
  const WVMO_BUDGET_IDS=_BUDGET_IDS[code]||new Set();
  const isBudgetLine=p2=>p2.isBudgetItem||WVMO_BUDGET_IDS.has(p2.id);
  const budgetItems=projForProp(code).filter(isBudgetLine);
  const activeProjs=projForProp(code).filter(p2=>!isBudgetLine(p2)&&!p2.inHouse); // user contracts

  /* helpers */
  const linkedFor=pr=>allGls.filter(g=>g.linkedProjectId===pr.id);
  const glSum=pr=>linkedFor(pr).reduce((a,g)=>a+(Number(g.amount)||0),0);
  const effectiveSpent=pr=>pr.actualCost!=null?Number(pr.actualCost):glSum(pr);
  const contractedFor=pr=>activeProjs.filter(ap=>ap.linkedBudgetItemId===pr.id);
  const contractedTotal=pr=>contractedFor(pr).reduce((a,ap)=>{
    const contract=Number(ap.anticipatedCost)||0;
    const paidDep=(ap.depositPaid&&ap.depositAmount)?Number(ap.depositAmount):0;
    return a+Math.max(0,contract-paidDep);
  },0);

  /* Helper: extract 4-digit account code from a budget item category e.g. "7322 - SP BUILDING REPAIRS" → "7322" */
  const biAcct=p2=>{const m=(p2.category||'').match(/^(\d{4})/);return m?m[1]:null;};
  /* Auto-match unassigned GL lines for a specific budget item's account code */
  const autoMatchForItem=async(bi)=>{
    const code4=biAcct(bi); if(!code4)return 0;
    let n=0;
    for(const g of allGls){
      if(!g.linkedProjectId&&Number(g.amount)>0&&g.account&&String(g.account).trim()===code4){
        g.linkedProjectId=bi.id; await linkGl(g,'Auto-matched · '+bi.name); n++;
      }
    }
    return n;
  };

  /* ── SECTION 1: Active Projects ──────────────────── */
  const projs=activeProjs.filter(p2=>inDateRange(p2,PFILT));
  const pj=el('div',{class:'panel'});
  const counts={}; PHASES.forEach(ph=>counts[ph.key]=projs.filter(p2=>phase(p2)===ph.key).length);
  pj.append(el('div',{class:'ph'},el('h3',{},'Active Projects'),el('div',{class:'sp'}),el('span',{class:'chip'},`${projs.length} total`),
    el('button',{class:'btn ghost sm',style:'margin-left:4px',onclick:()=>{VIEW.prop=code;openProject(null);}},'+ Add')));
  const filt=el('div',{class:'phasefilt'});
  PHASES.forEach(ph=>{if(ph.key==='discussed'||ph.key==='note')return;if(!counts[ph.key])return;const hidden=!!PFILT.hide[ph.key];
    filt.append(el('button',{class:'pf-chip'+(hidden?' off':''),title:hidden?'Show':'Hide',onclick:()=>{PFILT.hide[ph.key]=!PFILT.hide[ph.key];render();}},el('span',{},ph.label),el('span',{class:'pf-n'},String(counts[ph.key]))));});
  pj.append(el('div',{class:'pad',style:'padding-bottom:8px'},dateFilterGroup(PFILT),el('div',{style:'height:9px'}),filt));
  const pb=el('div',{style:'max-height:340px;overflow:auto'});
  if(!projs.length)pb.append(el('div',{class:'empty'},'No projects yet.'));
  function projRow2(pr){
    const ih=isInHouse(pr);
    const r=el('div',{class:'clickrow proj-row',style:'padding:10px 16px;border-bottom:1px solid var(--line-2)',onclick:()=>openProject(pr.id)});
    r.append(
      el('div',{style:'display:flex;gap:8px;align-items:center;margin-bottom:5px;flex-wrap:wrap'},
        el('button',{class:'pinbtn'+(pr.pinned?' on':''),onclick:e=>{e.stopPropagation();pr.pinned=!pr.pinned;saveProject(pr,pr.pinned?'Pinned':'Unpinned');}},'📌'),
        el('strong',{style:'font-size:13px;flex:1;min-width:0'},pr.name),
        ih?el('span',{class:'chip ih'},'In-house'):null,
        el('span',{style:'font-size:11px;color:var(--ink-3)'},pr.category),
        el('span',{class:'mono',style:'font-size:12px;font-weight:600'},fmt(ih?ihTotal(pr):(pr.actualCost!=null?pr.actualCost:pr.anticipatedCost),false)),
        (()=>{const sel=el('select',{style:'font-size:11px;padding:2px 6px;border:1px solid var(--line);border-radius:4px;background:var(--panel-2);color:var(--ink-2);max-width:180px',title:'Assign to SP Budget item',onclick:e=>e.stopPropagation(),onchange:async e=>{
    e.stopPropagation();
    const val=e.target.value||null;
    pr.linkedBudgetItemId=val;
    try{
      const r=await API.send('PATCH','/projects/'+pr.id+'/link',{linkedBudgetItemId:val});
      if(r&&r.ok){toast('Budget item assigned');render();}else{toast('Save failed','err');}
    }catch(ex){toast('Save failed','err');console.error(ex);}
  }});sel.append(el('option',{value:''},'— SP Budget item —'));budgetItems.forEach(bi=>sel.append(el('option',{value:bi.id},bi.name)));sel.value=pr.linkedBudgetItemId||'';return sel;})()),
      ih?progressEl(pr):trackEl(pr),
      // Deposit row
      (()=>{
        const dep=el('div',{style:'display:flex;align-items:center;gap:8px;padding:6px 0 0;border-top:1px solid var(--line-2);margin-top:6px;flex-wrap:wrap',onclick:e=>e.stopPropagation()});
        const rebuildDep=async(changes)=>{
          if(changes){Object.assign(pr,changes);
            try{await API.send('PATCH','/projects/'+pr.id,{...pr,bids:cleanBids(pr)});}catch(e){toast('Deposit save failed','err');}
          }
          dep.innerHTML='';
          dep.append(el('span',{style:'font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600;white-space:nowrap'},'Deposit'));
          if(!pr.depositAmount){
            dep.append(el('button',{class:'btn ghost sm',style:'font-size:11px',onclick:async e=>{
              e.stopPropagation();
              const v=prompt('Deposit amount:');
              if(!v||isNaN(Number(v)))return;
              await rebuildDep({depositAmount:Number(v),depositPaid:false,depositGlLineId:null});
            }},'+ Add deposit'));
          } else {
            // amount (click to edit)
            const amtEl=el('span',{class:'mono',style:'font-size:12px;font-weight:600;cursor:text;color:var(--wheat)',title:'Click to edit'},fmt(pr.depositAmount,false));
            amtEl.onclick=async e=>{e.stopPropagation();const v=prompt('Deposit amount:',pr.depositAmount);if(v===null)return;if(!isNaN(Number(v))){await rebuildDep({depositAmount:Number(v)||null});}};
            dep.append(amtEl);
            // paid checkbox
            const paidCb=el('input',{type:'checkbox',title:'Mark deposit as paid',style:'cursor:pointer'});
            paidCb.checked=!!pr.depositPaid;
            paidCb.onchange=async()=>{
              await rebuildDep({depositPaid:paidCb.checked});
              // auto-match if just marked paid
              if(paidCb.checked&&!pr.depositGlLineId){
                const match=allGls.filter(g=>Number(g.amount)>0&&!g.linkedProjectId&&Math.abs(Number(g.amount)-(pr.depositAmount||0))<=(pr.depositAmount||0)*0.07).sort((a,b)=>Math.abs(Number(a.amount)-(pr.depositAmount||0))-Math.abs(Number(b.amount)-(pr.depositAmount||0)));
                if(match.length){
                  match[0].linkedProjectId=pr.id;
                  pr.depositGlLineId=String(match[0].id);
                  await linkGl(match[0],'Deposit · '+pr.name);
                  await rebuildDep({depositGlLineId:String(match[0].id)});
                  toast('Deposit matched to GL: '+fmt(match[0].amount,false)+' '+match[0].vendor);
                }else{toast('Deposit marked paid — no close GL match found');}
              }
            };
            dep.append(el('label',{style:'display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer'},paidCb,pr.depositPaid?el('span',{style:'color:var(--green);font-weight:600'},'Paid ✓'):el('span',{style:'color:var(--amber)'},'Unpaid')));
            // GL match chip
            if(pr.depositGlLineId){
              const glMatch=allGls.find(g=>String(g.id)===String(pr.depositGlLineId));
              if(glMatch){dep.append(el('span',{style:'font-size:11px;color:var(--green);background:var(--green-soft);border:1px solid rgba(46,125,87,.3);border-radius:5px;padding:2px 7px;display:flex;align-items:center;gap:4px'},
                '🔗 '+fmt(glMatch.amount,false),(glMatch.vendor?' · '+glMatch.vendor.slice(0,16):''),
                el('button',{class:'btn ghost sm',style:'font-size:10px;padding:0 4px;margin-left:2px',title:'Unlink GL match',onclick:async e=>{e.stopPropagation();glMatch.linkedProjectId=null;await linkGl(glMatch,'Deposit GL unlinked');await rebuildDep({depositGlLineId:null});}},'×')));}
            } else if(pr.depositPaid){
              dep.append(el('button',{class:'btn ghost sm',style:'font-size:11px;color:var(--amber)',
                title:'Try to find a matching GL line',onclick:async e=>{e.stopPropagation();
                  const match=allGls.filter(g=>Number(g.amount)>0&&!g.linkedProjectId&&Math.abs(Number(g.amount)-(pr.depositAmount||0))<=(pr.depositAmount||0)*0.07).sort((a,b)=>Math.abs(Number(a.amount)-(pr.depositAmount||0))-Math.abs(Number(b.amount)-(pr.depositAmount||0)));
                  if(!match.length){toast('No close GL match found');return;}
                  match[0].linkedProjectId=pr.id;pr.depositGlLineId=String(match[0].id);
                  await linkGl(match[0],'Deposit · '+pr.name);await rebuildDep({depositGlLineId:String(match[0].id)});
                  toast('Matched: '+fmt(match[0].amount,false)+' · '+match[0].vendor);}
              },'⚡ Match GL'));
            }
            // remove deposit
            dep.append(el('button',{class:'btn ghost sm',style:'font-size:10px;color:var(--ink-3);margin-left:auto',title:'Remove deposit',onclick:async e=>{e.stopPropagation();if(!confirm('Remove deposit?'))return;await rebuildDep({depositAmount:null,depositPaid:false,depositGlLineId:null});}},'✕'));
          }
        };
        rebuildDep();
        return dep;
      })());
    return r;
  }
  const pinned2=projs.filter(p2=>p2.pinned&&!PFILT.hide[phase(p2)]);
  if(pinned2.length){pb.append(el('div',{class:'grp-h pinned'},'📌 Pinned',el('span',{class:'grp-n'},String(pinned2.length))));pinned2.forEach(pr=>pb.append(projRow2(pr)));}
  PHASES.forEach(ph=>{
    if(ph.key==='discussed'||ph.key==='note')return;
    if(PFILT.hide[ph.key])return;
    const list=projs.filter(p2=>phase(p2)===ph.key&&!p2.pinned);
    if(!list.length)return;
    list.sort((a,b)=>(stage(b)-stage(a))||(b.dateAdded||'').localeCompare(a.dateAdded||''));
    pb.append(el('div',{class:'grp-h'},ph.label,el('span',{class:'grp-n'},String(list.length))));
    list.forEach(pr=>pb.append(projRow2(pr)));
  });
  pj.append(pb);

  /* ── SECTION 2: SP Budget Table ─────────────────── */
  const totalBudget=budgetItems.reduce((a,p2)=>a+(Number(p2.anticipatedCost)||0),0);
  const totalSpent =budgetItems.reduce((a,p2)=>a+effectiveSpent(p2),0);
  const totalContracted=budgetItems.reduce((a,p2)=>a+contractedTotal(p2),0);
  // GL spend not linked to any budget item — reduces available variance
  const unbudgetedGlSpend=allGls.filter(g=>Number(g.amount)>0&&!budgetItems.some(bi=>bi.id===g.linkedProjectId)).reduce((a,g)=>a+(Number(g.amount)||0),0);
  const totalVar   =totalSpent+totalContracted-totalBudget;  // budgeted items only
  const netVar     =totalVar+unbudgetedGlSpend;              // includes unbudgeted GL
  const varColor   =netVar>500?'var(--rust)':netVar<-500?'var(--green)':'var(--ink)';

  const bp=el('div',{class:'panel',style:'overflow:visible'});
  async function addBudgetItem(){
    const acct=prompt('Account code + title (e.g. "7399 - SP MISC"):');
    if(!acct||!acct.trim())return;
    const newItem={id:uid('P'),property:code,category:acct.trim(),name:acct.trim(),
      description:'',anticipatedCost:0,steps:{},notes:'',onHold:false,pinned:false,
      inHouse:false,isBudgetItem:true,dateAdded:today()};
    await API.send('POST','/projects',newItem);
    await afterWrite('Budget item added');
  }
  bp.append(el('div',{class:'ph'},
    el('h3',{},'2026 SP Budget — '+(PROP(code).name||code)),
    el('div',{class:'sp'}),
    el('span',{class:'chip'},`${budgetItems.length} items`),
    allGls.length?el('span',{class:'chip'},'GL · '+allGls.length+' lines'):null,
    el('button',{class:'btn ghost sm',style:'margin-left:6px',title:'Add an unplanned or miscellaneous budget line',onclick:addBudgetItem},'+ Add item')));
  /* summary strip */
  const strip=el('div',{style:'display:flex;border-bottom:1px solid var(--line-2)'});
  const kk=(lbl,val,color)=>{const d=el('div',{style:'flex:1;padding:10px 16px;text-align:center;border-right:1px solid var(--line-2)'});d.append(el('div',{style:'font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600'},lbl));d.append(el('div',{class:'mono',style:'font-size:16px;font-weight:700;margin-top:2px'+(color?';color:'+color:'')},fmt(val)));return d;};
  const varStrip=el('div',{style:'flex:1;padding:10px 16px;text-align:center'});
  varStrip.append(el('div',{style:'font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600'},'Net Variance'));
  varStrip.append(el('div',{class:'mono',style:`font-size:16px;font-weight:700;margin-top:2px;color:${varColor}`},(netVar>=0?'+':'')+fmt(netVar,false)));
  varStrip.append(el('div',{style:'font-size:11px;color:var(--ink-3);margin-top:1px'},netVar<-100?fmt(Math.abs(netVar),false)+' available':netVar>100?'over budget':'on budget'));
  strip.append(kk('Total Budget',totalBudget),kk('GL Spent',totalSpent),
    unbudgetedGlSpend?kk('Unbudgeted GL',unbudgetedGlSpend,'var(--amber)'):kk('Under Contract',totalContracted),
    unbudgetedGlSpend?kk('Under Contract',totalContracted):null,
    varStrip);
  bp.append(strip);

  /* table header */
  const tbl=el('table',{style:'width:100%;border-collapse:collapse;font-size:13px'});
  tbl.append(el('thead',{},el('tr',{style:'background:var(--panel-2);border-bottom:1px solid var(--line)'},
    el('th',{style:'padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600;width:180px'},'Account'),
    el('th',{style:'padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600'},'Description'),
    el('th',{style:'padding:8px 16px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600;white-space:nowrap'},'Budget'),
    el('th',{style:'padding:8px 16px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600;white-space:nowrap'},'GL Spent'),
    el('th',{style:'padding:8px 16px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600;white-space:nowrap'},'Under Contract'),
    el('th',{style:'padding:8px 16px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600'},'Variance'))));
  const tbody=el('tbody');

  /* ── Sticky "Return to Pool" bar: visible while any GL card is being dragged ── */
  let _glDragActive=false;
  let _draggingBudgetId2=null;
  const _retTd=el('td',{colspan:'6',
    style:'padding:10px 16px;background:rgba(46,125,87,.06);border:2px dashed rgba(46,125,87,.4);border-radius:6px;'
          +'font-size:12px;font-weight:600;color:var(--green);text-align:center;cursor:copy;'
          +'transition:background .12s,border-color .12s'},
    '↩ Drop here to return charge to pool (unassign from any budget item)');
  const _retBar=el('tr',{id:'_retPoolBar',
    style:'display:none',
    ondragover:e=>{if(!_draggingBudgetId2){e.preventDefault();_retTd.style.background='rgba(46,125,87,.18)';_retTd.style.borderColor='var(--green)';}},
    ondragleave:()=>{_retTd.style.background='rgba(46,125,87,.06)';_retTd.style.borderColor='rgba(46,125,87,.4)';},
    ondrop:async e=>{
      e.preventDefault();_retTd.style.background='rgba(46,125,87,.06)';_retTd.style.borderColor='rgba(46,125,87,.4)';
      const gid=e.dataTransfer.getData('glId');if(!gid)return;
      const g=S.gl.find(x=>x.id===gid||String(x.id)===gid);if(!g){toast('GL line not found');return;}
      g.linkedProjectId=null;await linkGl(g,'Returned to pool ✓');
    }});
  _retBar.append(_retTd);
  tbody.append(_retBar);
  const _showRetBar=()=>{_glDragActive=true;_retBar.style.display='';};
  const _hideRetBar=()=>{_glDragActive=false;_retBar.style.display='none';_retTd.style.background='rgba(46,125,87,.06)';_retTd.style.borderColor='rgba(46,125,87,.4)';};

  let _draggingBudgetId=null;
  let _draggingFromPrId=null; // set to pr.id when dragging a chip from a budget item
  let _budgetCustomOrder=[];try{_budgetCustomOrder=JSON.parse(localStorage.getItem('wvmo_budget_order_v1')||'[]');}catch(_e){}
  const sorted=[...budgetItems].sort((a,b)=>{const ai=_budgetCustomOrder.indexOf(a.id),bi2=_budgetCustomOrder.indexOf(b.id);if(ai>=0&&bi2>=0)return ai-bi2;if(ai>=0)return-1;if(bi2>=0)return 1;return(a.category||'').localeCompare(b.category||'')||((Number(b.anticipatedCost)||0)-(Number(a.anticipatedCost)||0));});
  sorted.forEach(pr=>{
    const bdg=Number(pr.anticipatedCost)||0;
    const sp=effectiveSpent(pr);
    const ct=contractedTotal(pr);
    const vr=sp+ct-bdg;  // negative = budget still available
    const vrColor=(bdg||sp||ct)?(vr>0?'var(--rust)':vr<0?'var(--green)':'var(--ink)'):'var(--ink-3)';
    const lgs=linkedFor(pr);
    const isOver=bdg>0&&sp>bdg;
    const barColor=isOver?'var(--rust)':bdg>0&&sp/bdg>=0.75?'var(--amber)':'var(--green)';
    const pct2=bdg?Math.min(sp/bdg,1):0;

    /* main row */
    const mainRow=el('tr',{
      style:'border-bottom:1px solid var(--line-2);cursor:pointer',
      ondragover:e=>{e.preventDefault();if(_draggingBudgetId&&_draggingBudgetId!==pr.id){mainRow.style.background='var(--panel-2)';mainRow.style.boxShadow='inset 0 2px 0 var(--green)';}else if(!_draggingBudgetId){mainRow.style.background='var(--wheat-soft)';}},
      ondragleave:()=>{mainRow.style.background='';mainRow.style.boxShadow='';},
      ondrop:async e=>{
        e.preventDefault();mainRow.style.background='';mainRow.style.boxShadow='';
        const bid=e.dataTransfer.getData('budgetRowId');
        if(bid&&bid!==pr.id){const ids=sorted.map(x=>x.id);const fi=ids.indexOf(bid),ti=ids.indexOf(pr.id);if(fi>=0&&ti>=0){ids.splice(fi,1);ids.splice(ti,0,bid);}localStorage.setItem('wvmo_budget_order_v1',JSON.stringify(ids));render();return;}
        const gid=e.dataTransfer.getData('glId');if(!gid)return;
        const g=S.gl.find(x=>x.id===gid||String(x.id)===gid);if(!g){toast('GL line not found');return;}
        if(g.linkedProjectId===pr.id)return; // already here, skip
        g.linkedProjectId=pr.id;await linkGl(g,'GL moved → '+pr.name);
      }
    });

    /* mini bar inside Description cell */
    const barEl=el('div',{style:`height:4px;border-radius:3px;background:var(--line);margin-top:5px;overflow:hidden`});
    barEl.append(el('div',{style:`width:${Math.round(pct2*100)}%;height:100%;background:${barColor};border-radius:3px`}));

    /* toggle row visibility */
    let expanded=false;
    const toggle=()=>{expanded=!expanded;detailRow.style.display=expanded?'':'none';toggleBtn.textContent=expanded?'▲':'▼';};
    const toggleBtn=el('button',{class:'btn ghost sm',style:'padding:2px 6px;font-size:11px',onclick:e=>{e.stopPropagation();toggle();}},lgs.length?`▼ ${lgs.length} charged`:'▼');

    mainRow.append(
      (()=>{
        const acctTd=el('td',{style:'padding:6px 12px;vertical-align:middle'});
        const rebuildAcct=async(newVal)=>{
          if(newVal!==undefined&&newVal.trim()&&newVal.trim()!==pr.category){pr.category=newVal.trim();await saveProject(pr,'Account updated');}
          acctTd.innerHTML='';
          const handle=el('span',{draggable:'true',title:'Drag to reorder',style:'cursor:grab;color:var(--ink-3);font-size:14px;margin-right:5px;user-select:none;flex-shrink:0;opacity:.5',
            ondragstart:e=>{e.stopPropagation();e.dataTransfer.setData('budgetRowId',pr.id);e.dataTransfer.effectAllowed='move';_draggingBudgetId=pr.id;_draggingBudgetId2=pr.id;handle.style.opacity='1';},
            ondragend:()=>{_draggingBudgetId=null;_draggingBudgetId2=null;handle.style.opacity='.5';}
          },'⠿');
          const wrap=el('div',{style:'display:flex;align-items:center'});
          const lbl=el('span',{style:'font-size:11.5px;color:var(--ink-2);cursor:text;line-height:1.3',title:'Click to edit account code'},pr.category||'—');
          lbl.onclick=e=>{e.stopPropagation();
            const inp=el('input',{type:'text',value:pr.category||'',style:'width:145px;font-size:11.5px;padding:2px 6px;border:1px solid var(--green);border-radius:4px;background:var(--panel);font-family:inherit;outline:none'});
            inp.onblur=()=>rebuildAcct(inp.value);
            inp.onkeydown=ke=>{if(ke.key==='Enter')inp.blur();if(ke.key==='Escape'){inp.value=pr.category||'';inp.blur();}};
            wrap.innerHTML='';wrap.append(handle,inp);inp.focus();inp.select();
          };
          wrap.append(handle,lbl);acctTd.append(wrap);
        };
        rebuildAcct();return acctTd;
      })(),
      el('td',{style:'padding:10px 12px;vertical-align:middle'},
        el('div',{style:'display:flex;gap:8px;align-items:center;flex-wrap:wrap'},
          el('span',{style:'font-size:13px;font-weight:600;cursor:pointer;text-decoration:underline dotted',onclick:e=>{e.stopPropagation();openBudgetItem(pr,activeProjs,allGls);}},pr.name||'(untitled)'),
          toggleBtn,
          biAcct(pr)?el('button',{class:'btn ghost sm',style:'font-size:11px;color:var(--ink-3)',title:'Auto-match unassigned GL lines with account '+biAcct(pr)+' to this item',onclick:async e=>{e.stopPropagation();const n=await autoMatchForItem(pr);toast(n?`Matched ${n} GL line${n===1?'':'s'} to ${pr.name}`:'No unassigned lines for this account');}},'≈ Match'):null),
        barEl,
        pr.notes?el('div',{style:'font-size:11px;color:var(--ink-3);margin-top:3px'},pr.notes.slice(0,80)+(pr.notes.length>80?'…':'')):null),
      el('td',{style:'padding:10px 16px;text-align:right;font-family:var(--mono);font-weight:700'},bdg?fmt(bdg):'—'),
      el('td',{style:'padding:10px 16px;text-align:right;font-family:var(--mono);font-weight:700'},sp?fmt(sp):'—'),
      el('td',{style:'padding:10px 16px;text-align:right;font-family:var(--mono);font-weight:700;color:var(--wheat)'},ct?fmt(ct):'—'),
      el('td',{style:`padding:10px 16px;text-align:right;font-family:var(--mono);font-weight:700;color:${vrColor}`},(bdg||sp||ct)?((vr>=0?'+':'')+fmt(vr,false)):'—'));
    tbody.append(mainRow);

    /* detail row (GL charges + drop zone) */
    const detailRow=el('tr',{style:'display:none;background:var(--panel-2);border-bottom:2px solid var(--line)'});
    const detailCell=el('td',{colspan:'6',style:'padding:10px 16px'});

    function redrawDetail(){
      detailCell.innerHTML='';
      const lgs2=linkedFor(pr);
      /* ── layout: two columns ── */
      const layout=el('div',{style:'display:grid;grid-template-columns:1fr 280px;gap:14px;align-items:start'});
      const leftCol=el('div');
      const rightCol=el('div',{style:'border-left:1px solid var(--line-2);padding-left:14px'});
      /* ── left: GL chips ── */
      if(lgs2.length){
        const secLabel=el('div',{style:'font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-3);font-weight:700;margin-bottom:8px'},
          `GL Charges · ${lgs2.length} line${lgs2.length===1?'':'s'} · `+fmt(lgs2.reduce((a,g)=>a+(Number(g.amount)||0),0),false));
        leftCol.append(secLabel);
        const chipWrap=el('div',{style:'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px'});
        lgs2.forEach(g=>{
          const gidStr2=String(g.id);
          const chip=el('div',{draggable:'true',title:'Drag to reassign to another budget item',style:'display:flex;flex-direction:column;background:var(--green-soft);border:1px solid rgba(46,125,87,.3);border-radius:8px;padding:6px 10px;font-size:12px;min-width:160px;max-width:260px;gap:2px;cursor:grab',
            ondragstart:e=>{e.dataTransfer.setData('glId',gidStr2);e.dataTransfer.effectAllowed='link';chip.style.opacity='.4';chip.style.cursor='grabbing';_draggingFromPrId=pr.id;_showRetBar();},
            ondragend:()=>{chip.style.opacity='1';chip.style.cursor='grab';_draggingFromPrId=null;_hideRetBar();}});
          const topRow=el('div',{style:'display:flex;align-items:center;gap:6px;flex-wrap:wrap'});
          topRow.append(
            el('span',{style:'color:var(--ink-3);font-size:10px;cursor:grab',title:'Drag to move'},'⠿'),
            el('span',{class:'mono',style:'font-weight:700;color:var(--green);font-size:13px'},fmt(g.amount,false)),
            el('span',{style:'color:var(--ink-1);font-weight:500'},g.vendor?g.vendor.slice(0,22):''));
          if(g.date)topRow.append(el('span',{style:'color:var(--ink-3);font-size:11px;margin-left:auto'},g.date));
          chip.append(topRow);
          if(g.remarks)chip.append(el('div',{style:'font-size:11px;color:var(--ink-2);font-style:italic;border-top:1px solid rgba(46,125,87,.15);padding-top:4px;margin-top:2px'},'"'+g.remarks.slice(0,65)+(g.remarks.length>65?'…':'')+'"'));
          const actRow=el('div',{style:'display:flex;gap:5px;margin-top:4px;padding-top:4px;border-top:1px solid rgba(46,125,87,.12)'});
          const moveBtn=el('button',{class:'btn ghost sm',style:'font-size:11px',onclick:e=>{e.stopPropagation();showMoveMenu(g,chip,pr,redrawDetail);}},'↔ Move');
          actRow.append(moveBtn);
          actRow.append(el('button',{class:'btn sm',style:'font-size:11px;color:var(--rust);border-color:rgba(180,69,47,.3)',title:'Return to unassigned GL pool',onclick:async()=>{g.linkedProjectId=null;await linkGl(g,'GL returned to pool');redrawDetail();toggleBtn.textContent=linkedFor(pr).length?`▼ ${linkedFor(pr).length} charged`:'▼';}},'↩ Pool'));
          chip.append(actRow);
          chipWrap.append(chip);
        });
        leftCol.append(chipWrap);
      }
      /* drop zone */
      const dz=el('div',{
        style:'border:2px dashed var(--line);border-radius:8px;padding:10px 16px;font-size:12px;color:var(--ink-3);text-align:center;transition:all .15s;display:flex;align-items:center;justify-content:center;gap:6px',
        ondragover:e=>{if(!_draggingBudgetId&&_draggingFromPrId!==pr.id){e.preventDefault();dz.style.background='var(--wheat-soft)';dz.style.borderColor='var(--wheat)';dz.style.color='var(--wheat)';dz.textContent='';dz.append(el('span',{style:'font-size:14px'},'⬇'),el('span',{},'Drop here → '+pr.name.slice(0,30)));}},
        ondragleave:()=>{dz.style.background='';dz.style.borderColor='var(--line)';dz.style.color='var(--ink-3)';},
        ondrop:async e=>{e.preventDefault();dz.style.background='';dz.style.borderColor='var(--line)';dz.style.color='var(--ink-3)';dz.innerHTML='';dz.append(el('span',{style:'font-size:14px'},'⬇'),el('span',{},'Drop GL lines here to assign spend'));const gid=e.dataTransfer.getData('glId');if(!gid)return;if(_draggingFromPrId===pr.id)return;const g=S.gl.find(x=>x.id===gid||String(x.id)===gid);if(!g){toast('GL line not found');return;}g.linkedProjectId=pr.id;await linkGl(g,'GL moved → '+pr.name);redrawDetail();}
      },
        el('span',{style:'font-size:14px'},'⬇'),
        el('span',{},'Drop GL lines here to assign spend'));
      leftCol.append(dz);
      /* ── right: notes ── */
      rightCol.append(el('div',{style:'font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-3);font-weight:700;margin-bottom:6px'},'📝 Notes'));
      const noteTa=el('textarea',{style:'width:100%;min-height:90px;padding:8px 10px;border:1px solid var(--line);border-radius:6px;font-size:12px;background:var(--panel);resize:vertical;box-sizing:border-box;line-height:1.5;color:var(--ink-1)',
        placeholder:'Status, comments, follow-up…',
        onblur:async()=>{pr.notes=noteTa.value;await saveProject(pr,'Notes saved');}});
      noteTa.value=pr.notes||'';
      rightCol.append(noteTa);
      layout.append(leftCol,rightCol);
      detailCell.append(layout);
    }
    redrawDetail();
    detailRow.append(detailCell);
    tbody.append(detailRow);
  });

  /* ── Unbudgeted GL rows: group by account, show red positive variance ─── */
  const unbudgetedGls=allGls.filter(g=>Number(g.amount)>0&&!g.ignored&&!budgetItems.some(bi=>bi.id===g.linkedProjectId));
  if(unbudgetedGls.length){
    // group by account code (fall back to category, then vendor)
    const groups=new Map();
    unbudgetedGls.forEach(g=>{
      const key=g.account||g.category||'Other';
      const grp=groups.get(key)||{key,label:g.category||g.account||'Other',total:0,lines:[]};
      grp.total+=Number(g.amount)||0;
      grp.lines.push(g);
      groups.set(key,grp);
    });
    tbody.append(el('tr',{style:'background:var(--canvas)'},
      el('td',{colspan:'6',style:'padding:5px 16px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:700;border-top:2px solid var(--line)'},'⚠ Unbudgeted GL Spend')));
    groups.forEach(grp=>{
      const notesKey='unbgd_notes_'+code+'_'+grp.key;
      let ubExpanded=false;
      const chevron=el('span',{style:'color:var(--ink-3);font-size:10px;margin-left:4px;user-select:none'},'▼');
      const mainRow=el('tr',{style:'background:rgba(180,120,0,.05);border-bottom:1px solid var(--line-2);cursor:pointer',
        onclick:()=>{ubExpanded=!ubExpanded;detailRow2.style.display=ubExpanded?'':'none';chevron.textContent=ubExpanded?'▲':'▼';},
        ondragover:e=>{if(!_draggingBudgetId){e.preventDefault();mainRow.style.background='rgba(180,120,0,.12)';}},
        ondragleave:()=>{mainRow.style.background='rgba(180,120,0,.05)';},
        ondrop:async e=>{e.preventDefault();mainRow.style.background='rgba(180,120,0,.05)';mainRow.style.outline='';
          const gid=e.dataTransfer.getData('glId');if(!gid)return;
          const g=S.gl.find(x=>x.id===gid||String(x.id)===gid);if(!g)return;
          if(!g.linkedProjectId)return; // already unassigned, nothing to do
          g.linkedProjectId=null;await linkGl(g,'Returned to pool ✓');}});
      mainRow.append(
        el('td',{style:'padding:7px 12px;font-size:11px;color:var(--amber);font-family:var(--mono)'},grp.key),
        el('td',{style:'padding:7px 12px;font-size:12px;color:var(--ink-2)'},
          el('div',{style:'display:flex;align-items:center;gap:6px'},
            el('span',{style:'font-size:13px;font-weight:600'},grp.label.replace(/^SP\s*/i,'').slice(0,40)),
            chevron),
          el('div',{style:'font-size:10.5px;color:var(--ink-3);margin-top:2px'},grp.lines.length+' line'+(grp.lines.length===1?'':'s')+' · no budget set')),
        el('td',{style:'padding:7px 16px;text-align:right;color:var(--ink-3)'},'—'),
        el('td',{style:'padding:7px 16px;text-align:right;font-family:var(--mono);font-size:12px'},fmt(grp.total,false)),
        el('td',{style:'padding:7px 16px;text-align:right;color:var(--ink-3)'},'—'),
        el('td',{style:'padding:7px 16px;text-align:right;font-family:var(--mono);font-weight:700;color:var(--rust)'},'+'+fmt(grp.total,false)));
      const detailRow2=el('tr',{style:'display:none;background:rgba(180,120,0,.03);border-bottom:2px solid rgba(180,120,0,.15)'});
      const detailCell2=el('td',{colspan:'6',style:'padding:10px 16px'});
      function redrawUnbgd(){
        detailCell2.innerHTML='';
        const layout2=el('div',{style:'display:grid;grid-template-columns:1fr 280px;gap:14px;align-items:start'});
        const lCol=el('div'); const rCol=el('div',{style:'border-left:1px solid var(--line-2);padding-left:14px'});
        const linesHere=allGls.filter(g=>Number(g.amount)>0&&!g.ignored&&!budgetItems.some(bi=>bi.id===g.linkedProjectId)&&(g.account||g.category||'Other')===grp.key);
        if(linesHere.length){
          lCol.append(el('div',{style:'font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-3);font-weight:700;margin-bottom:8px'},
            'GL Charges · '+linesHere.length+' line'+(linesHere.length===1?'':'s')+' · '+fmt(grp.total,false)));
          const cw=el('div',{style:'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px'});
          linesHere.forEach(g=>{
            const gs2=String(g.id);
            const chip2=el('div',{draggable:'true',title:'Drag to assign to a budget item',
              style:'display:flex;flex-direction:column;background:rgba(180,120,0,.08);border:1px solid rgba(180,120,0,.3);border-radius:8px;padding:6px 10px;font-size:12px;min-width:160px;max-width:260px;gap:2px;cursor:grab',
              ondragstart:e=>{e.dataTransfer.setData('glId',gs2);e.dataTransfer.effectAllowed='link';chip2.style.opacity='.4';_showRetBar();},
              ondragend:()=>{chip2.style.opacity='1';_hideRetBar();}});
            const tr2=el('div',{style:'display:flex;align-items:center;gap:6px;flex-wrap:wrap'});
            tr2.append(el('span',{style:'color:var(--ink-3);font-size:10px'},'⠿'),
              el('span',{class:'mono',style:'font-weight:700;color:var(--amber);font-size:13px'},fmt(g.amount,false)),
              el('span',{style:'color:var(--ink-1);font-weight:500'},g.vendor?g.vendor.slice(0,22):''));
            if(g.date)tr2.append(el('span',{style:'color:var(--ink-3);font-size:11px;margin-left:auto'},g.date));
            chip2.append(tr2);
            if(g.remarks)chip2.append(el('div',{style:'font-size:11px;color:var(--ink-2);font-style:italic;border-top:1px solid rgba(180,120,0,.15);padding-top:4px;margin-top:2px'},'"'+g.remarks.slice(0,65)+(g.remarks.length>65?'…':'')+'"'));
            const actRow2=el('div',{style:'display:flex;gap:5px;margin-top:4px;padding-top:4px;border-top:1px solid rgba(180,120,0,.15)'});
            actRow2.append(el('button',{class:'btn ghost sm',style:'font-size:11px',onclick:e=>{e.stopPropagation();showMoveMenu(g,chip2,null,()=>afterWrite('GL assigned ✓'),code);}},'→ Assign to…'));
            chip2.append(actRow2);
            cw.append(chip2);
          });
          lCol.append(cw);
        }
        /* ubDz removed — use green Return to Pool bar at top of budget table */
        lCol.append(el('button',{class:'btn sm',style:'font-size:11px;margin-top:4px',
          onclick:async e=>{e.stopPropagation();
            const nm=prompt('Name for this budget item:',grp.label.replace(/^SP\s*/i,'').slice(0,60));
            if(!nm||!nm.trim())return;
            const catStr=grp.key+(grp.label&&grp.label!==grp.key?' - '+grp.label.replace(/^SP\s*/i,'').slice(0,30):'');
            const ni={id:uid('P'),property:code,category:catStr,name:nm.trim(),description:'',anticipatedCost:0,
              steps:{},notes:localStorage.getItem(notesKey)||'',onHold:false,pinned:false,inHouse:false,isBudgetItem:true,dateAdded:today()};
            await API.send('POST','/projects',ni);
            for(const g of linesHere.filter(g=>!g.linkedProjectId)){g.linkedProjectId=ni.id;await linkGl(g,'Promoted · '+ni.name);}
            await afterWrite('Added to budget: '+ni.name);
          }},'+ Add to Budget'));
        rCol.append(el('div',{style:'font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-3);font-weight:700;margin-bottom:6px'},'📝 Notes'));
        const nta=el('textarea',{style:'width:100%;min-height:80px;padding:8px 10px;border:1px solid var(--line);border-radius:6px;font-size:12px;background:var(--panel);resize:vertical;box-sizing:border-box;line-height:1.5;color:var(--ink-1)',
          placeholder:'Status, comments, follow-up…',
          onblur:()=>localStorage.setItem(notesKey,nta.value)});
        nta.value=localStorage.getItem(notesKey)||'';
        rCol.append(nta);
        layout2.append(lCol,rCol); detailCell2.append(layout2);
      }
      redrawUnbgd();
      detailRow2.append(detailCell2);
      tbody.append(mainRow,detailRow2);
    });
  }

  /* totals footer */
  const tfoot=el('tfoot',{});
  if(unbudgetedGlSpend){
    tfoot.append(el('tr',{style:'background:var(--canvas);border-top:1px solid var(--line-2);font-style:italic;color:var(--amber)'},
      el('td',{colspan:'2',style:'padding:7px 16px;font-size:12px'},'⚠ Unbudgeted GL spend'),
      el('td',{style:'padding:7px 16px;text-align:right;font-family:var(--mono);font-size:12px',colspan:'2'},'+'+fmt(unbudgetedGlSpend,false)),
      el('td',{style:'padding:7px 16px;text-align:right;font-family:var(--mono);font-size:12px;color:var(--amber)'},'+'+fmt(unbudgetedGlSpend,false)+' to variance')));
  }
  tfoot.append(el('tr',{style:'background:var(--panel-2);border-top:2px solid var(--line);font-weight:700'},
    el('td',{colspan:'2',style:'padding:10px 16px;font-size:13px'},'Total'),
    el('td',{style:'padding:10px 16px;text-align:right;font-family:var(--mono)'},fmt(totalBudget)),
    el('td',{style:'padding:10px 16px;text-align:right;font-family:var(--mono)'},totalSpent?fmt(totalSpent):'—'),
    el('td',{style:'padding:10px 16px;text-align:right;font-family:var(--mono);color:var(--wheat)'},totalContracted?fmt(totalContracted):'—'),
    el('td',{style:`padding:10px 16px;text-align:right;font-family:var(--mono);color:${varColor}`},(netVar>=0?'+':'')+fmt(netVar,false))));
  tbl.append(tbody,tfoot); bp.append(tbl);
  /* ── SECTION 3: GL lines (draggable, sidebar) ──────── */
  const gp=el('div',{class:'panel',style:'overflow:hidden;display:flex;flex-direction:column'});
  const unassigned=allGls.filter(g=>!g.linkedProjectId&&Number(g.amount)>0&&!g.ignored);
  /* Auto-match unassigned GL lines to budget items by category */
  /* Match a GL line to a budget item: prefer account# match, fall back to category text match */
  const matchBudgetItem=g=>{
    // 1. exact account number match (e.g. g.account="7322" vs bi.category="7322 - SP BUILDING REPAIRS")
    if(g.account){
      const hit=budgetItems.find(p2=>biAcct(p2)===String(g.account).trim());
      if(hit)return hit;
    }
    // 2. category text contains account number from GL line
    if(g.category){
      const hit=budgetItems.find(p2=>g.category&&p2.category&&
        p2.category.trim().toLowerCase()===g.category.trim().toLowerCase());
      if(hit)return hit;
      // 3. partial: budget item category starts with what the GL category says
      const glCat=g.category.trim().toLowerCase();
      const hit2=budgetItems.find(p2=>p2.category&&p2.category.trim().toLowerCase().includes(glCat));
      if(hit2)return hit2;
    }
    return null;
  };
  async function autoMatchGL(){
    const candidates=allGls.filter(g=>!g.linkedProjectId&&Number(g.amount)>0);
    if(!candidates.length){toast('No unassigned GL lines to match');return;}
    let matched=0;
    for(const g of candidates){
      const pr=matchBudgetItem(g);
      if(pr){g.linkedProjectId=pr.id;await linkGl(g,'Auto-matched');matched++;}
    }
    if(!matched) toast('No GL lines matched — check account codes on the budget items');
    else toast(`Matched ${matched} GL line${matched===1?'':'s'}`);
  }
  let glShowUnassignedOnly=false;
  let glCollapsed=false;
  let glShowContra=false;
  let glShowIgnored=false;
  let glShowDeleted=false;
  let glShowAll=false;
  let glShowNew=false;
  const contraLines=allGls.filter(g=>Number(g.amount)<0&&!g.linkedProjectId&&!g.ignored);
  const positiveGls=allGls.filter(g=>Number(g.amount)>=0&&!g.ignored);
  const ignoredGls=allGls.filter(g=>g.ignored);
  const deletedGls=S.gl.filter(g=>g.property===code&&g.deleted);
  const newGls=allGls.filter(g=>g.isNew&&!g.ignored);
  const glChecked=new Set(); // GL line IDs checked for batch match
  const glHeader=()=>{
    const checkedCount=glChecked.size;
    const h=el('div',{class:'ph'});
    const _hItems=[
      el('h3',{style:'cursor:pointer;user-select:none',title:glCollapsed?'Expand GL section':'Collapse GL section',onclick:()=>{glCollapsed=!glCollapsed;rebuildGLTable();}},
        (glCollapsed?'▶':'▼')+' General Ledger'),
      el('div',{class:'sp'}),
      el('span',{class:'chip',style:'cursor:default'},positiveGls.length+' lines'+(contraLines.length?' · '+contraLines.length+' contra':'')),
      el('span',{class:'chip',style:'cursor:default'},fmt(glSpent)),
      unassigned.length
        ?el('button',{class:'btn'+(glShowUnassignedOnly?' accent':' ghost')+' sm',style:'font-size:12px',
            title:glShowUnassignedOnly?'Show all GL lines':'Show only unassigned GL lines',
            onclick:()=>{glShowUnassignedOnly=!glShowUnassignedOnly;rebuildGLTable();}},
            unassigned.length+' unassigned')
        :el('span',{class:'chip done'},'all assigned'),
      newGls.length?el('button',{class:'btn'+(glShowNew?' accent':' ghost')+' sm',style:'font-size:11px;color:var(--green)',
          title:glShowNew?'Back to full view':'Show only new lines from latest upload',
          onclick:()=>{glShowNew=!glShowNew;glShowUnassignedOnly=false;glShowContra=false;glShowIgnored=false;glShowDeleted=false;glShowAll=false;rebuildGLTable();}},
          newGls.length+' new ✨')
        :undefined,
      contraLines.length?el('button',{class:'btn'+(glShowContra?' accent':' ghost')+' sm',style:'font-size:11px',
          title:glShowContra?'Back to normal view':'Show '+contraLines.length+' unassigned contra/credit entries',
          onclick:()=>{glShowContra=!glShowContra;glShowUnassignedOnly=false;glShowIgnored=false;glShowDeleted=false;glShowAll=false;glShowNew=false;rebuildGLTable();}},
          contraLines.length+' contra')
        :undefined,
      ignoredGls.length?el('button',{class:'btn'+(glShowIgnored?' accent':' ghost')+' sm',style:'font-size:11px;color:var(--ink-3)',
          title:glShowIgnored?'Hide ignored lines':'Show '+ignoredGls.length+' ignored lines',
          onclick:()=>{glShowIgnored=!glShowIgnored;glShowContra=false;glShowUnassignedOnly=false;glShowDeleted=false;glShowAll=false;rebuildGLTable();}},
          ignoredGls.length+' ignored')
        :undefined,
      deletedGls.length?el('button',{class:'btn'+(glShowDeleted?' accent':' ghost')+' sm',style:'font-size:11px;color:var(--rust)',
          title:glShowDeleted?'Hide deleted lines':'Show '+deletedGls.length+' deleted (undo)',
          onclick:()=>{glShowDeleted=!glShowDeleted;glShowContra=false;glShowUnassignedOnly=false;glShowIgnored=false;glShowAll=false;rebuildGLTable();}},
          deletedGls.length+' deleted')
        :undefined,
      el('button',{class:'btn'+(glShowAll?' accent':' ghost')+' sm',style:'font-size:11px',
          title:glShowAll?'Back to normal view':'Show all GL lines including negatives and sweeps',
          onclick:()=>{glShowAll=!glShowAll;glShowContra=false;glShowUnassignedOnly=false;glShowIgnored=false;glShowDeleted=false;rebuildGLTable();}},
          'View all'),
      checkedCount
        ?el('button',{class:'btn accent sm',style:'margin-left:6px',
            onclick:async()=>{
              let n=0;
              for(const gid of glChecked){
                const g=allGls.find(x=>String(x.id)===gid);
                if(g&&!g.linkedProjectId){const pr2=matchBudgetItem(g);if(pr2){g.linkedProjectId=pr2.id;await linkGl(g,'Auto-matched');n++;}}
              }
              glChecked.clear();
              toast(n?`Matched ${n} line${n===1?'':'s'}`:'No matches found');
            }},`⚡ Match ${checkedCount} selected`)
        :el('button',{class:'btn sm',style:'margin-left:6px',title:'Auto-match all unassigned GL lines',onclick:autoMatchGL},'⚡ Match all'),
    ];
    h.append(..._hItems.filter(x=>x!=null));
    return h;
  };
  const glHeaderEl=glHeader();
  gp.append(glHeaderEl);
  /* prominent auto-match action bar */
  /* autoBar removed — ⚡ Auto-match is in the GL section below */
  let _glTableEl=null;
  function rebuildGLTable(){
    if(_glTableEl)_glTableEl.remove();
    /* rebuild header chip state */
    const newH=glHeader(); glHeaderEl.replaceWith(newH);
    if(glCollapsed){_glTableEl=el('div');gp.append(_glTableEl);return;}
    if(allGls.length){
    const hint=el('div',{id:'_glHint',style:'padding:6px 16px;font-size:11.5px;color:var(--ink-3);border-bottom:1px solid var(--line-2);background:var(--panel-2)'},'⠿  Drag rows onto a budget item or drop on a row in the SP Budget table');
    const t=el('table',{class:'tbl'});
    /* "select all unassigned" checkbox in header */
    const allCb=el('input',{type:'checkbox',title:'Select all unassigned',style:'cursor:pointer'});
    allCb.onchange=()=>{
      const baseGls2=glShowNew?newGls:glShowDeleted?deletedGls:glShowAll?allGls.filter(g=>!g.ignored).sort((a,b)=>(b.date||'').localeCompare(a.date||'')):glShowIgnored?ignoredGls:glShowContra?contraLines:(glShowUnassignedOnly?unassigned:positiveGls);
      const displayGls2=baseGls2;
      displayGls2.filter(g=>!g.linkedProjectId).forEach(g=>{
        if(allCb.checked)glChecked.add(String(g.id)); else glChecked.delete(String(g.id));
      });
      rebuildGLTable();
    };
    t.append(el('thead',{},tr(el('th',{style:'width:32px;padding:6px 8px'},allCb),th('Vendor / description'),th('Amount','r'),th('Assigned to'))));
    const tbb=el('tbody');
    const baseGls=glShowNew?newGls:glShowDeleted?deletedGls:glShowAll?allGls.filter(g=>!g.ignored).sort((a,b)=>(b.date||'').localeCompare(a.date||'')):glShowIgnored?ignoredGls:glShowContra?contraLines:(glShowUnassignedOnly?unassigned:positiveGls);
    const displayGls=baseGls;
    displayGls.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    displayGls.forEach(g=>{
      const linked=g.linkedProjectId?S.projects.find(x=>x.id===g.linkedProjectId):null;
      const gidStr=String(g.id);
      const cb=el('input',{type:'checkbox',style:'cursor:pointer',title:linked?'Assigned (unlink first to re-match)':'Select for batch auto-match'});
      if(linked){cb.disabled=true;cb.title='Already assigned';}
      else{cb.checked=glChecked.has(gidStr);cb.onchange=()=>{if(cb.checked)glChecked.add(gidStr);else glChecked.delete(gidStr);/* refresh header */const oldH=gp.querySelector('.ph');if(oldH)oldH.replaceWith(glHeader());};}
      const glRow=el('tr',{
        draggable:'true',
        style:'cursor:grab'+(linked?';opacity:.6':'')+(g.isNew?';border-left:3px solid var(--green)':''),
        ondragstart:e=>{e.dataTransfer.setData('glId',gidStr);e.dataTransfer.effectAllowed='link';glRow.style.opacity='.35';_showRetBar();},
        ondragend:()=>{glRow.style.opacity=linked?'.6':'1';_hideRetBar();}
      });
      glRow.append(
        el('td',{style:'padding:4px 8px;width:32px'},cb),
        td(el('div',{style:'font-size:12px;max-width:220px'},
          el('div',{style:'display:flex;align-items:center;gap:5px'},
            el('span',{style:'font-weight:500'},g.vendor||g.category||'—'),
            g.isNew?el('span',{style:'font-size:9px;font-weight:700;color:var(--green);background:var(--green-soft);border:1px solid rgba(46,125,87,.3);border-radius:3px;padding:0 4px;letter-spacing:.04em'},'NEW'):null),
          el('div',{style:'color:var(--ink-3);font-size:11px'},(g.date||'')+(g.category?' · '+g.category.slice(0,20):'')),
          g.remarks?el('div',{style:'font-size:11px;color:var(--ink-2);font-style:italic;border-left:2px solid var(--line);padding-left:5px;margin-top:3px'},'"'+g.remarks.slice(0,55)+(g.remarks.length>55?'…':'')+'"'):null)),
        tdn(g.amount,1),
        td(g.deleted
          ?el('span',{style:'font-size:11px;color:var(--rust);display:flex;gap:4px;align-items:center;font-style:italic'},'deleted',
              el('button',{class:'btn ghost sm',style:'font-size:10px;padding:0 4px;color:var(--green)',title:'Restore this GL line',onclick:async e=>{e.stopPropagation();g.deleted=false;await API.send('PATCH','/gl/'+g.id+'/delete',{deleted:false});rebuildGLTable();}},'↩ Undo'))
          :linked
          ?el('span',{style:'font-size:11px;color:var(--green);display:flex;gap:3px;align-items:center'},
              '🔗 '+linked.name.slice(0,16),
              el('button',{class:'btn ghost sm',style:'font-size:10px;padding:0 4px',title:'Return to pool',onclick:async()=>{g.linkedProjectId=null;await linkGl(g,'GL returned to pool');}},'↩'),
              el('button',{class:'btn ghost sm',style:'font-size:10px;padding:0 4px;color:var(--rust)',title:'Delete — permanently hidden, survives re-imports',onclick:async e=>{e.stopPropagation();if(!confirm('Delete this GL line?'))return;await API.send('PATCH','/gl/'+g.id+'/delete',{deleted:true});g.deleted=true;rebuildGLTable();}},'✕'))
          :g.ignored
            ?el('span',{style:'font-size:11px;color:var(--ink-3);display:flex;gap:4px;align-items:center;font-style:italic'},'ignored',
                el('button',{class:'btn ghost sm',style:'font-size:10px;padding:0 4px',title:'Restore',onclick:async()=>{g.ignored=false;await API.send('PATCH','/gl/'+g.id+'/ignore',{ignored:false});rebuildGLTable();}},'↩'),
                el('button',{class:'btn ghost sm',style:'font-size:10px;padding:0 4px;color:var(--rust)',title:'Delete permanently',onclick:async e=>{e.stopPropagation();if(!confirm('Delete this GL line?'))return;await API.send('PATCH','/gl/'+g.id+'/delete',{deleted:true});g.deleted=true;rebuildGLTable();}},'✕'))
            :el('div',{style:'display:flex;gap:4px;align-items:center'},
                el('span',{style:'font-size:11px;color:var(--amber);font-style:italic'},'unassigned'),
                el('button',{class:'btn ghost sm',style:'font-size:10px;padding:1px 5px;color:var(--ink-3)',title:'Ignore — mark as reclassification, exclude from all calculations',
                  onclick:async e=>{e.stopPropagation();g.ignored=true;await API.send('PATCH','/gl/'+g.id+'/ignore',{ignored:true});rebuildGLTable();}},'Ignore'),
                el('button',{class:'btn ghost sm',style:'font-size:10px;padding:1px 5px;color:var(--rust)',title:'Delete — permanently hidden, survives re-imports',
                  onclick:async e=>{e.stopPropagation();if(!confirm('Delete this GL line? It will be excluded on all future imports too.'))return;await API.send('PATCH','/gl/'+g.id+'/delete',{deleted:true});g.deleted=true;rebuildGLTable();}},'✕'))));
      tbb.append(glRow);
    });
    t.append(tbb);
    const wrap=el('div',{style:'overflow-x:auto'});wrap.append(t);
    _glTableEl=el('div'); _glTableEl.append(hint,wrap);
    gp.append(_glTableEl);
    } else { _glTableEl=el('div',{class:'empty'},'No GL lines. Upload a general ledger on the Data tab.'); gp.append(_glTableEl); }
  }
  rebuildGLTable();
  body.append(pj, bp, gp);
  return {bar,body};
}

/* small floating "Move to…" menu
   currentPr: the budget item the chip currently belongs to (null if unbudgeted)
   propCode:  property code (required when currentPr is null)               */
function showMoveMenu(g, anchor, currentPr, onDone, propCode){
  const existing=document.getElementById('_moveMenu'); if(existing)existing.remove();
  const _mProp=(currentPr&&currentPr.property)||propCode||'WVMO';
  const _mIds=_BUDGET_IDS[_mProp]||new Set();
  // Show all budget items; exclude current if chip is already assigned
  const items=projForProp(_mProp).filter(p2=>(p2.isBudgetItem||_mIds.has(p2.id))&&(currentPr?p2.id!==currentPr.id:true));
  const hasItems=items.length>0;
  const isAssigned=!!(currentPr);
  if(!hasItems&&!isAssigned){toast('No budget items found for this property');return;}
  const rect=anchor.getBoundingClientRect();
  // Flip up if near bottom of viewport
  const spaceBelow=window.innerHeight-rect.bottom;
  const topPos=spaceBelow<280?Math.max(8,rect.top-280):(rect.bottom+4);
  const menu=el('div',{id:'_moveMenu',style:`position:fixed;z-index:9999;background:var(--panel);border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);min-width:220px;max-width:320px;top:${topPos}px;left:${Math.min(rect.left,window.innerWidth-330)}px;overflow:hidden`});
  const close=()=>menu.remove();
  menu.append(el('div',{style:'padding:7px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-3);font-weight:600;border-bottom:1px solid var(--line-2)'},isAssigned?'Move to…':'Assign to…'));
  const scrollList=el('div',{style:'max-height:240px;overflow-y:auto'});
  items.sort((a,b)=>(a.name||'').localeCompare(b.name||'')).forEach(pr=>{
    scrollList.append(el('button',{class:'btn ghost',style:'width:100%;text-align:left;border-radius:0;border:0;border-bottom:1px solid var(--line-2);padding:8px 14px;font-size:13px',
      onclick:async()=>{close();g.linkedProjectId=pr.id;await linkGl(g,'GL moved → '+pr.name);onDone&&onDone();}
    },pr.name));
  });
  menu.append(scrollList);
  // "Return to pool" option only for chips that are currently assigned
  if(isAssigned){
    menu.append(el('button',{class:'btn ghost',style:'width:100%;text-align:left;border-radius:0;border:0;padding:8px 14px;font-size:13px;color:var(--rust);font-style:italic',
      onclick:async()=>{close();g.linkedProjectId=null;await linkGl(g,'Returned to pool ✓');onDone&&onDone();}
    },'↩ Return to pool (unassign)'));
  }
  document.body.append(menu);
  const dismiss=e=>{if(!menu.contains(e.target)){close();document.removeEventListener('click',dismiss);}};
  setTimeout(()=>document.addEventListener('click',dismiss),0);
}


/* GL link cell: shows the linked project or a Match button with a best-guess hint. */

function glLinkCell(g,code){
  const cell=el('div',{class:'gl-link'});
  if(g.linkedProjectId){
    const pr=S.projects.find(x=>x.id===g.linkedProjectId);
    cell.append(el('button',{class:'gl-linked',title:pr?('Re-match · '+pr.name):'',onclick:()=>openGLMatch(g,code)}, '🔗 '+(pr?pr.name.slice(0,20):'(missing)')));
    if(g.partial)cell.append(el('span',{class:'chip',style:'background:var(--amber-soft);color:var(--amber)'},'partial'));
    cell.append(el('button',{class:'btn ghost sm',title:'Unlink',onclick:()=>{g.linkedProjectId=null;g.partial=false;linkGl(g,'Unlinked');}},'✕'));
  } else {
    const cands=projForProp(code).map(pr=>({pr,...glMatchScore(g,pr)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
    cell.append(el('button',{class:'btn sm accent',onclick:()=>openGLMatch(g,code)},'Match…'));
    if(cands[0])cell.append(el('button',{class:'gl-hint',title:'Suggested: '+cands[0].pr.name,onclick:()=>openGLMatch(g,code)},'≈ '+cands[0].pr.name.slice(0,16)));
  }
  return cell;
}
/* Matcher modal: ranked rough matches + tie-out options (update total / partial / link). */
function openGLMatch(g,code){
  const scrim=el('div',{class:'scrim modal-center',onclick:e=>{if(e.target===scrim)scrim.remove();}});
  const sheet=el('div',{class:'sheet'});
  const head=el('div',{class:'sh'}, el('h2',{style:'font-size:16px;flex:1'},'Match ledger line to a project'),
    el('button',{class:'btn ghost',onclick:()=>scrim.remove()},'Close'));
  const b=el('div',{class:'sb'});
  b.append(el('div',{class:'panel pad'},
    el('div',{style:'display:flex;gap:10px;align-items:center;flex-wrap:wrap'},
      el('strong',{class:'mono',style:'font-size:16px'},fmt(g.amount)), el('span',{class:'chip'},g.category||'—'),
      el('span',{style:'color:var(--ink-3);font-size:12px'},g.date||'')),
    el('div',{style:'margin-top:5px;font-size:13px'},g.vendor||''),
    g.remarks?el('div',{style:'font-size:11.5px;color:var(--ink-3);margin-top:2px'},g.remarks):null));
  let q='';
  const listWrap=el('div',{class:'panel',style:'margin-top:14px;overflow:hidden'});
  const search=el('input',{type:'search',placeholder:'Search this property’s projects…',style:'width:100%;padding:10px 12px;border:0;border-bottom:1px solid var(--line-2);background:var(--panel-2)',oninput:e=>{q=e.target.value.toLowerCase();draw();}});
  const rows=el('div',{style:'max-height:52vh;overflow:auto'});
  listWrap.append(search,rows); b.append(listWrap);
  function commitLink(pr,mode){
    g.linkedProjectId=pr.id;
    const amt=Math.abs(Number(g.amount)||0);
    if(mode==='update'){
      if(pr.inHouse){ pr.totalToComplete=amt; pr.amountCompleted=amt; }
      else { pr.actualCost=amt; pr.anticipatedCost=pr.anticipatedCost!=null?pr.anticipatedCost:amt; pr.steps.workCompleted=true; pr.steps.paid=true; }
      g.partial=false;
    } else if(mode==='partial'){
      g.partial=true;
      if(pr.inHouse){ pr.amountCompleted=Math.min(ihTotal(pr)||amt,(Number(pr.amountCompleted)||0)+amt); }
      else { pr.steps.workStarted=true; }   // partial payment — work underway, not fully paid
    } else {
      if(!pr.inHouse){ pr.steps.workCompleted=true; pr.steps.paid=true; }
      g.partial=false;
    }
    scrim.remove(); saveMatch(g,pr,'Ledger line matched');
  }
  function draw(){
    rows.innerHTML='';
    let cands=projForProp(code).map(pr=>({pr,...glMatchScore(g,pr)}));
    if(q)cands=cands.filter(x=>(x.pr.name+' '+x.pr.category+' '+(x.pr.contractor||'')).toLowerCase().includes(q));
    cands.sort((a,b)=>b.score-a.score || (b.pr.dateAdded||'').localeCompare(a.pr.dateAdded||''));
    if(!cands.length){rows.append(el('div',{class:'empty'},'No matching projects.'));return;}
    cands.slice(0,40).forEach(({pr,score,reasons})=>{
      const total=pr.inHouse?ihTotal(pr):projOutflow(pr);
      const row=el('div',{class:'gm-row'});
      const rh=el('div',{class:'gm-head'},
        el('div',{style:'flex:1;min-width:0'},
          el('div',{class:'gm-name'},pr.name, pr.inHouse?el('span',{class:'chip ih',style:'margin-left:6px'},'In-house'):null),
          el('div',{class:'gm-sub'}, pr.category+(total?(' · total '+fmt(total,false)):' · no total'))),
        score>0?el('span',{class:'gm-score'},score+'%'):null);
      const rwrap=el('div',{class:'gm-reasons'}); reasons.forEach(rs=>rwrap.append(el('span',{class:'gm-tag'},rs)));
      row.append(rh); if(reasons.length)row.append(rwrap);
      const diff = total>0 && Math.abs(Math.abs(g.amount)-total)/Math.max(Math.abs(g.amount),total) > 0.01;
      const actions=el('div',{class:'gm-actions'});
      if(diff){
        actions.append(el('div',{class:'gm-note'},`Ledger ${fmt(g.amount)} vs project total ${fmt(total)} — how should this tie out?`),
          el('div',{style:'display:flex;gap:7px;flex-wrap:wrap'},
            el('button',{class:'btn sm accent',onclick:()=>commitLink(pr,'update')},`Set total to ${fmt(g.amount,false)}`),
            el('button',{class:'btn sm',onclick:()=>commitLink(pr,'partial')},'Partial payment'),
            el('button',{class:'btn sm ghost',onclick:()=>commitLink(pr,'link')},'Link, keep total')));
      } else {
        actions.append(el('button',{class:'btn sm accent',onclick:()=>commitLink(pr,'update')},'Tie out & link'));
      }
      row.append(actions); rows.append(row);
    });
  }
  draw();
  sheet.append(head,b); scrim.append(sheet); document.body.append(scrim);
}

/* =========================================================
   CASH & LOANS
========================================================= */
function viewCash(){
  const bar=topbar('Money','Cash & Loans',
    el('button',{class:'btn accent',onclick:openAdjust},'+ Cash adjustment'));
  const body=el('div',{class:'grid'});

  // snapshot table
  const sp=el('div',{class:'panel',style:'overflow:auto'});
  sp.append(el('div',{class:'ph'}, el('h3',{},'Cash snapshot & loan terms'), el('div',{class:'sp'}), el('span',{class:'chip'},`cushion as of ${S.meta.cashAsOf||'—'}`)));
  const tbl=el('table',{class:'tbl'});
  tbl.append(el('thead',{},tr(th('Property'),th('Snapshot cash','r'),th('Adjustments','r'),th('Cash today','r'),
    th('Outstanding','r'),th('Projected cash','r'),
    th('SP remaining','r'),th('Loan amount','r'),th('Rate','r'),th('LTV','r'),th('Matures','r'),th('DCR','r'))));
  const tb=el('tbody');
  [...new Set(S.properties.map(p=>p.region))].forEach(reg=>{
    tb.append(el('tr',{class:'grp'}, el('td',{colspan:12},reg)));
    S.properties.filter(p=>p.region===reg).forEach(p=>{
      const c=S.cash[p.code]||{}; const adj=cashAdjFor(p.code); const cmm=cashModel(p.code);
      tb.append(el('tr',{class:'clickrow',onclick:()=>{VIEW.tab='property';VIEW.prop=p.code;render();}},
        td(el('strong',{},p.code)),
        tdn(c.cash,1), td(el('span',{class:adj<0?'mono neg':'mono'},adj?fmt(adj):'—'),'r'),
        td(el('span',{class:'mono',style:'font-weight:600'},fmt(effectiveCash(p.code))),'r'),
        td(el('span',{class:'mono'+(cmm.outstandingTotal?' neg':'')},cmm.outstandingTotal?fmt(-cmm.outstandingTotal):'—'),'r'),
        td(el('span',{class:'mono',style:'font-weight:600'},fmt(cmm.projectedCash)),'r'),
        tdn(c.spRemaining,1), tdn(c.loanAmount,1),
        td(el('span',{class:'mono'},c.loanRate!=null?pct(c.loanRate):'—'),'r'),
        td(el('span',{class:'mono'},c.ltv!=null?pct(c.ltv):'—'),'r'),
        td(el('span',{class:'mono',style:'font-size:12px'},c.loanDue||'—'),'r'),
        td(el('span',{class:'mono'},c.dcr!=null?Number(c.dcr).toFixed(2)+'x':'—'),'r')));
    });
  });
  tbl.append(tb); sp.append(tbl); body.append(sp);

  // adjustments ledger
  const ap=el('div',{class:'panel'});
  ap.append(el('div',{class:'ph'}, el('h3',{},'Mid-month cash adjustments'), el('div',{class:'sp'}),
    el('button',{class:'btn sm accent',onclick:openAdjust},'+ Add')));
  const ab=el('div',{});
  if(!S.cashAdjustments.length)ab.append(el('div',{class:'empty'},el('div',{class:'big'},'No adjustments yet'),'Record cash moves between monthly cushion reports — they layer on top of the snapshot.'));
  else{
    const t=el('table',{class:'tbl'});
    t.append(el('thead',{},tr(th('Date'),th('Property'),th('Note'),th('Amount','r'),th(''))));
    const tbb=el('tbody');
    S.cashAdjustments.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).forEach(a=>{
      tbb.append(tr(td(el('span',{class:'mono',style:'font-size:12px'},a.date)),
        td(propChip(a.property)),
        td(a.note||'—'),
        td(el('span',{class:a.amount<0?'mono neg':'mono'},fmt(a.amount)),'r'),
        td(el('button',{class:'btn ghost sm',onclick:()=>{delAdj(a.id);}},'✕'))));
    });
    t.append(tbb); ab.append(t);
  }
  ap.append(ab); body.append(ap);

  ap.append(ab); body.append(ap);
  return {bar,body};
}
function openAdjust(){
  const a={id:uid('A'),property:VIEW.prop||S.properties[0].code,date:today(),amount:null,note:''};
  const scrim=el('div',{class:'scrim modal-center',onclick:e=>{if(e.target===scrim)scrim.remove();}});
  const sheet=el('div',{class:'sheet'});
  const propSel=el('select',{onchange:e=>a.property=e.target.value});
  S.properties.forEach(pr=>propSel.append(el('option',{value:pr.code,...(a.property===pr.code?{selected:true}:{})},`${pr.code} — ${pr.name}`)));
  const head=el('div',{class:'sh'}, el('h2',{style:'font-size:16px;flex:1'},'Cash adjustment'),
    el('button',{class:'btn ghost',onclick:()=>scrim.remove()},'Cancel'));
  const b=el('div',{class:'sb'});
  const f=(l,n)=>el('div',{class:'field'},el('label',{},l),n);
  b.append(f('Property',propSel));
  b.append(el('div',{class:'frow'},
    f('Date',el('input',{type:'date',value:a.date,oninput:e=>a.date=e.target.value})),
    f('Amount (+ in / − out)',el('input',{type:'number',placeholder:'0',oninput:e=>a.amount=e.target.value===''?null:+e.target.value}))));
  b.append(f('Note',el('input',{placeholder:'e.g. distribution, large invoice, transfer',oninput:e=>a.note=e.target.value})));
  b.append(el('div',{style:'display:flex;gap:8px;margin-top:8px'}, el('div',{style:'flex:1'}),
    el('button',{class:'btn accent',onclick:()=>{if(a.amount==null){toast('Enter an amount.');return;}scrim.remove();addAdj(a);}},'Save adjustment')));
  sheet.append(head,b); scrim.append(sheet); document.body.append(scrim);
}

/* =========================================================
   DATA / UPLOAD
========================================================= */
function viewData(){
  const bar=topbar('Data','Upload & Data');
  const body=el('div',{class:'grid',style:'grid-template-columns:1fr 1fr'});

  body.append(uploadPanel('General ledger','GL', 'Pulls SP account spend by property & category. Confirms work completed and vendors paid.',
    'gl', S.meta.glPeriod?`Loaded · ${S.meta.glPeriod} · ${S.gl.length} lines`:'No GL loaded'));
  body.append(uploadPanel('Cash cushion report','Cushion','Updates each property’s cash position, SP budget/spend and loan terms.',
    'cushion', S.meta.cashAsOf?`Loaded · as of ${S.meta.cashAsOf}`:'No cushion loaded'));

  // backup panel
  const bk=el('div',{class:'panel',style:'grid-column:1/-1'});
  bk.append(el('div',{class:'ph'}, el('h3',{},'Backup & restore')));
  const bb=el('div',{class:'pad'});
  bb.append(el('p',{style:'color:var(--ink-3);margin-top:0;font-size:13px'},
    'Data is saved to the shared database for everyone on the team. Export a JSON backup to keep a safe copy or move data between environments; importing a backup replaces ALL current data.'));
  const rowb=el('div',{style:'display:flex;gap:10px;flex-wrap:wrap'});
  rowb.append(
    el('button',{class:'btn pri',onclick:exportBackup},'⬇ Export backup (.json)'),
    (()=>{const lbl=el('label',{class:'btn'},'⬆ Import backup');const inp=el('input',{type:'file',accept:'.json',style:'display:none',onchange:e=>importBackup(e.target.files[0])});lbl.append(inp);return lbl;})(),
    el('button',{class:'btn',onclick:exportCSV},'⬇ Export projects (.csv)'),
    el('div',{style:'flex:1'}),
    el('button',{class:'btn danger',onclick:()=>{if(confirm('Reset everything to the seeded starter data? This affects ALL users and cannot be undone.')){resetSeed();}}},'Reset to starter data'));
  bb.append(rowb);
  bk.append(bb); body.append(bk);

  // counts
  const stats=el('div',{class:'panel',style:'grid-column:1/-1'});
  stats.append(el('div',{class:'ph'}, el('h3',{},'What’s loaded')));
  const sg=el('div',{class:'pad',style:'display:grid;grid-template-columns:repeat(4,1fr);gap:14px'});
  const stat=(l,v)=>el('div',{}, el('div',{class:'kpi'}, el('div',{class:'lab'},l), el('div',{class:'val'},v)));
  sg.append(stat('Properties',S.properties.length),stat('Projects',S.projects.length),
    stat('GL lines',S.gl.length),stat('Cash adjustments',S.cashAdjustments.length));
  stats.append(sg); body.append(stats);
  return {bar,body};
}
function uploadPanel(title,tag,desc,kind,status){
  const p=el('div',{class:'panel'});
  p.append(el('div',{class:'ph'}, el('h3',{},title), el('div',{class:'sp'}), el('span',{class:'chip'},status)));
  const pad=el('div',{class:'pad'});
  pad.append(el('p',{style:'margin-top:0;color:var(--ink-3);font-size:13px'},desc));
  const drop=el('div',{class:'drop'});
  drop.append(el('div',{style:'font-size:26px'},'⇪'), el('div',{class:'big'},`Drop the ${tag} .xlsx here`),
    el('div',{style:'color:var(--ink-3);font-size:12.5px'},'or click to choose a file'));
  const inp=el('input',{type:'file',accept:'.xlsx,.xls',style:'display:none',onchange:e=>{if(e.target.files[0])uploadImport(e.target.files[0],kind);}});
  drop.append(inp);
  drop.addEventListener('click',()=>inp.click());
  drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('hot');});
  drop.addEventListener('dragleave',()=>drop.classList.remove('hot'));
  drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('hot');const f=e.dataTransfer.files[0];if(f)uploadImport(f,kind);});
  pad.append(drop); p.append(pad); return p;
}
async function uploadImport(file,kind){
  if(!file)return;
  const fd=new FormData(); fd.append('file',file);
  toast('Uploading…');
  try{
    const r=await fetch('/api/import/'+kind,{method:'POST',body:fd});
    if(!r.ok){ let msg; try{msg=(await r.json()).error;}catch(e){ msg='Could not read that file.'; } toast(msg||'Could not read that file.'); return; }
    const data=await r.json();
    if(kind==='gl') glPreview(data); else cushionPreview(data);
  }catch(e){ toast('Upload failed: '+e.message); }
}

/* ---- GL parser ---- */
function glPreview(data){
  const {token,count,period,byProperty}=data;
  const scrim=el('div',{class:'scrim modal-center',onclick:e=>{if(e.target===scrim)scrim.remove();}});
  const sheet=el('div',{class:'sheet'});
  const head=el('div',{class:'sh'}, el('h2',{style:'font-size:16px;flex:1'},'Confirm general ledger import'),
    el('button',{class:'btn ghost',onclick:()=>scrim.remove()},'Cancel'),
    el('button',{class:'btn accent',onclick:async()=>{ try{ await API.send('POST','/import/gl/confirm',{token}); scrim.remove(); await afterWrite(`Imported ${count} ledger lines`); }catch(e){ toast('Import failed: '+e.message); } }},`Import ${count} lines`));
  const b=el('div',{class:'sb'});
  b.append(el('p',{style:'margin-top:0;color:var(--ink-3)'},`Found ${count} SP ledger lines${period?` for ${period}`:''}. This replaces the current ledger. Spend by property:`));
  const t=el('table',{class:'tbl'});t.append(el('thead',{},tr(th('Property'),th('Net spend','r'))));
  const tbb=el('tbody');Object.keys(byProperty).sort().forEach(k=>tbb.append(tr(td(k),tdn(byProperty[k],1))));
  t.append(tbb);b.append(el('div',{class:'panel',style:'overflow:auto'},t));
  sheet.append(head,b);scrim.append(sheet);document.body.append(scrim);
}
function cushionPreview(data){
  const {token,count,asOf,found}=data;
  const scrim=el('div',{class:'scrim modal-center',onclick:e=>{if(e.target===scrim)scrim.remove();}});
  const sheet=el('div',{class:'sheet'});
  const head=el('div',{class:'sh'}, el('h2',{style:'font-size:16px;flex:1'},'Confirm cash cushion import'),
    el('button',{class:'btn ghost',onclick:()=>scrim.remove()},'Cancel'),
    el('button',{class:'btn accent',onclick:async()=>{ try{ await API.send('POST','/import/cushion/confirm',{token}); scrim.remove(); await afterWrite('Cash cushion updated'); }catch(e){ toast('Import failed: '+e.message); } }},'Apply update'));
  const b=el('div',{class:'sb'});
  b.append(el('p',{style:'margin-top:0;color:var(--ink-3)'},`Matched ${count} properties · as of ${asOf}. Mid-month adjustments are preserved and continue to layer on top.`));
  const t=el('table',{class:'tbl'});t.append(el('thead',{},tr(th('Property'),th('Cash','r'),th('SP budget','r'),th('SP spent','r'),th('Loan','r'),th('Matures','r'))));
  const tbb=el('tbody');Object.keys(found).sort().forEach(k=>{const c=found[k];tbb.append(tr(td(k),tdn(c.cash,1),tdn(c.spBudget,1),tdn(c.spSpent,1),tdn(c.loanAmount,1),td(c.loanDue||'—','r')));});
  t.append(tbb);b.append(el('div',{class:'panel',style:'overflow:auto'},t));
  sheet.append(head,b);scrim.append(sheet);document.body.append(scrim);
}

/* ---- backup ---- */
function exportBackup(){ const a=el('a',{href:'/api/export/backup.json'}); document.body.append(a); a.click(); a.remove(); toast('Backup downloading…'); }
function importBackup(file){ if(!file)return; const fr=new FileReader(); fr.onload=async e=>{ try{ const d=JSON.parse(e.target.result); if(!d.properties||!d.projects)throw 0; await restoreBackup(d); }catch(err){ toast('That file is not a valid backup.'); } }; fr.readAsText(file); }
function exportCSV(){ const a=el('a',{href:'/api/export/projects.csv'}); document.body.append(a); a.click(); a.remove(); toast('Projects CSV downloading…'); }

/* ---------- tiny table builders ---------- */
function tr(...kids){return el('tr',{},...kids);}
function th(t,cls){return el('th',{class:cls==='r'?'r':''},t);}
function td(c,cls){return el('td',{class:cls==='r'?'r':''},c&&c.nodeType?c:document.createTextNode(c==null?'':c));}
function tdn(n,money){return el('td',{class:'num r'},money?fmt(n):(n==null?'—':String(n)));}

/* ---------- toast ---------- */
let _toastT;function toast(msg){let t=$('.toast');if(t)t.remove();t=el('div',{class:'toast'},msg);document.body.append(t);clearTimeout(_toastT);_toastT=setTimeout(()=>t.remove(),2400);}
function toastUndo(msg,undoFn){let t=$('.toast');if(t)t.remove();const u=el('button',{class:'btn ghost sm',style:'margin-left:10px;color:inherit;text-decoration:underline;background:none;border:none;cursor:pointer;padding:0',onclick:()=>{undoFn();t.remove();}
},'Undo');t=el('div',{class:'toast',style:'display:flex;align-items:center;gap:6px'},msg,u);document.body.append(t);clearTimeout(_toastT);_toastT=setTimeout(()=>t.remove(),5000);}

const _pendingDeletes=new Map();
async function deleteContract(id){
  const c=S.contracts.find(x=>x.id===id); if(!c) return;
  const saved=JSON.parse(JSON.stringify(c));
  S.contracts=S.contracts.filter(x=>x.id!==id); render();
  const timer=setTimeout(async()=>{ _pendingDeletes.delete(id); try{ await API.send('DELETE','/contracts/'+id); }catch(e){ console.warn('contract delete failed:',e); } },5000);
  _pendingDeletes.set(id,{record:saved,timer});
  toastUndo('Contract deleted',()=>{ const pd=_pendingDeletes.get(id); if(!pd) return; clearTimeout(pd.timer); _pendingDeletes.delete(id); S.contracts.push(pd.record); S.contracts.sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||''))); render(); });
}

start();
