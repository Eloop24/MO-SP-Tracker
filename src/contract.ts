import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import AdmZip from 'adm-zip';
import { CONTRACT_CONFIG } from '../shared/domain.js';

/* =============================================================================
   Independent Contractor Agreement — PDF generator (pdf-lib, pure Node)
   Reproduces the document structure from Contract_Generation_Workflow_Instructions:
   agreement body (Sections 1-25) + signature block, Exhibit A&B (bid embedded),
   Exhibit C (Conditional Lien Waiver), Exhibit D (Final Lien Waiver).
   ============================================================================= */

export interface ContractVars {
  effectiveDate: string;    // MM/DD/YYYY
  termEndDate: string;      // MM/DD/YYYY
  ownerEntity: string;
  contractorName: string;
  propertyName: string;
  propertyAddr: string;
  ownerNoticeAddr: string;
  contractorAddr: string;
  contractTotal: string;    // e.g. "$30,700.00"
  dailyReduction?: string;  // e.g. "$500"
  workDays?: string;        // e.g. "Mon - Fri"
  workHours?: string;       // e.g. "8:00 AM - 5:00 PM"
}
export interface BidAttachment { buffer: Buffer; name: string; }

const PAGE_W = 612, PAGE_H = 792;       // US Letter
const MARGIN = 72;                       // 1"
const CONTENT_W = PAGE_W - 2 * MARGIN;   // 468
const BODY_SIZE = 11, LEADING = 16;
const TOP = PAGE_H - MARGIN;             // first baseline area
const BOTTOM = 72;                       // stop wrapping here (page number sits below)

/* ---------- rich text (supports **bold** runs) ---------- */
interface Word { text: string; bold: boolean; }
function tokenize(s: string): Word[] {
  const words: Word[] = [];
  const parts = s.split(/(\*\*)/);
  let bold = false;
  for (const part of parts) {
    if (part === '**') { bold = !bold; continue; }
    if (!part) continue;
    for (const w of part.split(/(\s+)/)) {
      if (w === '') continue;
      words.push({ text: w, bold });
    }
  }
  return words;
}

export async function buildContract(vars: ContractVars, attachments: BidAttachment[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const roman = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const fontFor = (b: boolean) => (b ? bold : roman);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = TOP;

  const newPage = () => { page = doc.addPage([PAGE_W, PAGE_H]); y = TOP; };
  const space = (h: number) => { if (y - h < BOTTOM) newPage(); };

  // Draw a paragraph of rich text, wrapping to CONTENT_W. Supports justify + indent.
  function paragraph(text: string, opts: { size?: number; leading?: number; gap?: number; align?: 'left' | 'center'; justify?: boolean; indent?: number } = {}) {
    const size = opts.size ?? BODY_SIZE;
    const lead = opts.leading ?? LEADING;
    const align = opts.align ?? 'left';
    const indent = opts.indent ?? 0;
    const width = CONTENT_W - indent;
    const words = tokenize(text);
    const wW = (w: Word) => fontFor(w.bold).widthOfTextAtSize(w.text, size);
    const spaceW = (b: boolean) => fontFor(b).widthOfTextAtSize(' ', size);
    if (!words.length) { y -= lead + (opts.gap ?? 6); return; }
    // build lines
    const lines: Word[][] = [];
    let line: Word[] = [], lineW = 0;
    for (const w of words) {
      const add = (line.length ? spaceW(w.bold) : 0) + wW(w);
      if (lineW + add > width && line.length) { lines.push(line); line = []; lineW = 0; }
      lineW += (line.length ? spaceW(w.bold) : 0) + wW(w);
      line.push(w);
    }
    if (line.length) lines.push(line);
    lines.forEach((ln, li) => {
      space(lead);
      const isLast = li === lines.length - 1;
      const natural = ln.reduce((a, w, i) => a + wW(w) + (i ? spaceW(w.bold) : 0), 0);
      let x = MARGIN + indent;
      let extra = 0;
      if (align === 'center') x = MARGIN + (CONTENT_W - natural) / 2;
      else if (opts.justify && !isLast && ln.length > 1) extra = (width - natural) / (ln.length - 1);
      ln.forEach((w, i) => {
        if (i) x += spaceW(w.bold) + (align === 'center' ? 0 : extra);
        page.drawText(w.text, { x, y, size, font: fontFor(w.bold), color: rgb(0, 0, 0) });
        x += wW(w);
      });
      y -= lead;
    });
    y -= (opts.gap ?? 6);
  }

  // A numbered section: "N. **Title**. body" (number not bold), justified. Extra
  // paragraphs render below (used by section 4 sub-clauses and section 13 addresses).
  function section(n: number, title: string, paras: string[]) {
    if (paras[0] === '') {
      paragraph(`${n}. **${title}.**`, { gap: 4 });
      for (let i = 1; i < paras.length; i++) paragraph(paras[i], { gap: 8 });
    } else {
      paragraph(`${n}. **${title}.** ${paras[0]}`, { gap: paras.length > 1 ? 4 : 8 });
      for (let i = 1; i < paras.length; i++) paragraph(paras[i], { gap: 6 });
    }
  }

  // ---------- Title ----------
  paragraph('**INDEPENDENT CONTRACTOR AGREEMENT**', { size: 13, leading: 22, align: 'center', gap: 16 });

  // ---------- Preamble ----------
  for (const para of preambleParas(vars)) paragraph(para, { gap: 10 });

  // ---------- Numbered sections 1–25 ----------
  buildSections(vars).forEach((s, i) => section(i + 1, s.title, s.paras));

  // ---------- Signature block ----------
  space(180);
  paragraph('IN WITNESS WHEREOF, the parties hereto have executed this Agreement as of the Effective Date.', { gap: 18 });
  signatureBlock(page, y, roman, bold, vars);
  y -= 150;

  // ---------- Exhibit A & B (bid embedded) ----------
  await exhibitAB(doc, vars, attachments, roman, bold);

  // ---------- Exhibit C ----------
  exhibitText(doc, roman, bold, exhibitC(vars), 'EXHIBIT C', 'FORM OF CONDITIONAL WAIVER OF LIEN AND RELEASE');

  // ---------- Exhibit D ----------
  exhibitText(doc, roman, bold, exhibitD(vars), 'EXHIBIT D', 'FORM OF FINAL WAIVER OF LIEN AND RELEASE');

  // ---------- Page numbers (every page, centered, 9pt) ----------
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = String(i + 1);
    const w = roman.widthOfTextAtSize(label, 9);
    const pw = p.getSize().width;
    p.drawText(label, { x: (pw - w) / 2, y: 24, size: 9, font: roman, color: rgb(0, 0, 0) });
  });

  return doc.save();
}

/* ---------- signature two-column table ---------- */
function signatureBlock(page: PDFPage, top: number, roman: PDFFont, bold: PDFFont, v: ContractVars) {
  const colL = MARGIN, colR = MARGIN + CONTENT_W / 2 + 10;
  const line = (x: number, yy: number, label: string, f = roman) => page.drawText(label, { x, y: yy, size: 10, font: f, color: rgb(0, 0, 0) });
  let yy = top;
  line(colL, yy, `Owner: ${v.ownerEntity}`, bold); line(colR, yy, `Contractor: ${v.contractorName}`, bold); yy -= 26;
  line(colL, yy, 'By:'); line(colR, yy, 'By: __________________'); yy -= 14;
  line(colL, yy, 'as Agent for and on behalf of Owner'); yy -= 22;
  const ownerName = CONTRACT_CONFIG.ownerName || '________________';
  const ownerTitle = CONTRACT_CONFIG.ownerTitle || '_________________';
  const today = new Date(); const mm = String(today.getMonth()+1).padStart(2,'0'); const dd = String(today.getDate()).padStart(2,'0'); const yyyy = today.getFullYear(); const ownerDate = `${mm}/${dd}/${yyyy}`;
  line(colL, yy, `Name: ${ownerName}`); line(colR, yy, 'Name: ________________'); yy -= 22;
  line(colL, yy, `Title: ${ownerTitle}`); line(colR, yy, 'Title: _________________'); yy -= 22;
  line(colL, yy, `Date: ${ownerDate}`); line(colR, yy, 'Date: _________________');
}

/* ---------- Exhibit A&B: header page + bid documents ---------- */
function detectKind(buf: Buffer): 'pdf' | 'jpg' | 'png' | 'zip' | 'unknown' {
  if (buf.length < 4) return 'unknown';
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'pdf'; // %PDF
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0x50 && buf[1] === 0x4b) return 'zip'; // PK
  return 'unknown';
}

// Expand any ZIPs into their contained PDFs/images; bid-like files first, photos after.
function expandAttachments(attachments: BidAttachment[]): BidAttachment[] {
  const out: BidAttachment[] = [];
  for (const att of attachments) {
    if (detectKind(att.buffer) === 'zip') {
      const zip = new AdmZip(att.buffer);
      const entries = zip.getEntries()
        .filter((e) => !e.isDirectory && /\.(pdf|jpe?g|png)$/i.test(e.entryName))
        .sort((a, b) => a.entryName.localeCompare(b.entryName));
      // bids (pdf) first, then images
      const pdfs = entries.filter((e) => /\.pdf$/i.test(e.entryName));
      const imgs = entries.filter((e) => /\.(jpe?g|png)$/i.test(e.entryName));
      for (const e of [...pdfs, ...imgs]) out.push({ buffer: e.getData(), name: e.entryName });
    } else {
      out.push(att);
    }
  }
  return out;
}

function fitBox(w: number, h: number, maxW: number, maxH: number) {
  const s = Math.min(maxW / w, maxH / h, 1);
  return { w: w * s, h: h * s };
}

async function exhibitAB(doc: PDFDocument, vars: ContractVars, attachments: BidAttachment[], roman: PDFFont, bold: PDFFont) {
  const header = doc.addPage([PAGE_W, PAGE_H]);
  const center = (txt: string, yy: number, size: number, f: PDFFont) => {
    const w = f.widthOfTextAtSize(txt, size);
    header.drawText(txt, { x: (PAGE_W - w) / 2, y: yy, size, font: f, color: rgb(0, 0, 0) });
  };
  let yy = TOP;
  center('EXHIBIT A & B', yy, 13, bold); yy -= 20;
  center('CONTRACT PRICE & SCOPE', yy, 11, bold); yy -= 18;
  center(`CONTRACT TOTAL: ${vars.contractTotal}`, yy, 12, bold); yy -= 28;

  const atts = expandAttachments(attachments);
  if (!atts.length) { center('[ Bid document attached separately ]', yy, 10, roman); return; }
  center('Bid documents follow.', yy, 10, roman);

  // Bid PDFs are copied page-for-page (preserving native size + rotation, so they're
  // never sideways); image bids are placed one per page.
  for (const att of atts) {
    const kind = detectKind(att.buffer);
    try {
      if (kind === 'pdf') {
        const src = await PDFDocument.load(att.buffer, { ignoreEncryption: true });
        const pages = await doc.copyPages(src, src.getPageIndices());
        for (const pg of pages) doc.addPage(pg);
      } else if (kind === 'jpg' || kind === 'png') {
        const img = kind === 'jpg' ? await doc.embedJpg(att.buffer) : await doc.embedPng(att.buffer);
        const p = doc.addPage([PAGE_W, PAGE_H]);
        const f = fitBox(img.width, img.height, CONTENT_W, PAGE_H - 2 * MARGIN);
        p.drawImage(img, { x: (PAGE_W - f.w) / 2, y: (PAGE_H - f.h) / 2, width: f.w, height: f.h });
      }
    } catch { /* skip unreadable attachment */ }
  }
}

/* ---------- Exhibit C/D plain-text pages ---------- */
function exhibitText(doc: PDFDocument, roman: PDFFont, bold: PDFFont, body: string, head1: string, head2: string) {
  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = TOP;
  const center = (txt: string, size: number, f: PDFFont) => {
    const w = f.widthOfTextAtSize(txt, size);
    page.drawText(txt, { x: (PAGE_W - w) / 2, y, size, font: f, color: rgb(0, 0, 0) });
    y -= size + 8;
  };
  center(head1, 13, bold);
  center(head2, 11, bold);
  y -= 10;
  // wrap body paragraphs
  for (const para of body.split('\n')) {
    if (para.trim() === '') { y -= 10; continue; }
    const words = para.split(/\s+/);
    let line = '';
    const draw = (t: string) => { page.drawText(t, { x: MARGIN, y, size: 11, font: roman, color: rgb(0, 0, 0) }); y -= LEADING; };
    for (const wd of words) {
      const test = line ? line + ' ' + wd : wd;
      if (roman.widthOfTextAtSize(test, 11) > CONTENT_W && line) {
        if (y < BOTTOM) { page = doc.addPage([PAGE_W, PAGE_H]); y = TOP; }
        draw(line); line = wd;
      } else line = test;
    }
    if (line) { if (y < BOTTOM) { page = doc.addPage([PAGE_W, PAGE_H]); y = TOP; } draw(line); }
    y -= 6;
  }
}

/* ---------- Text content (matches the Monarch DOCX template) ---------- */
function subst(v: ContractVars, s: string): string {
  return s
    .replaceAll('{EFFECTIVE_DATE}', v.effectiveDate)
    .replaceAll('{TERM_END_DATE}', v.termEndDate)
    .replaceAll('{OWNER_ENTITY}', v.ownerEntity)
    .replaceAll('{CONTRACTOR_NAME}', v.contractorName)
    .replaceAll('{PROPERTY_NAME}', v.propertyName)
    .replaceAll('{PROPERTY_ADDR}', v.propertyAddr)
    .replaceAll('{OWNER_NOTICE_ADDR}', v.ownerNoticeAddr)
    .replaceAll('{CONTRACTOR_ADDR}', v.contractorAddr);
}

function preambleParas(v: ContractVars): string[] {
  return [
    subst(v, 'This Independent Contractor Agreement ("Agreement") is entered into and effective as of {EFFECTIVE_DATE} (the "Effective Date") between {OWNER_ENTITY} ("Owner"), and {CONTRACTOR_NAME} ("Contractor"). The Agreement shall affect the real property known as the {PROPERTY_NAME}, {PROPERTY_ADDR} ("Property"). The term "Contractor", as used in this Agreement, means, collectively, Contractor, its agents, employees, subcontractors, successors and assigns.'),
    subst(v, 'Owner desires to engage Contractor for certain services or improvements to be completed at the Property in accordance with the plans and specifications attached hereto as Exhibit A and the terms and conditions set forth in this Agreement. Owner and Contractor, for good and valuable consideration as defined in Exhibit B, the receipt and sufficiency of which are acknowledged hereby agree as follows:'),
  ];
}

function buildSections(v: ContractVars): { title: string; paras: string[] }[] {
  const S = (s: string) => subst(v, s);
  return [
    { title: 'Services and Scope of Work', paras: [S('Contractor shall perform all work and/or services described in the Exhibit A; furnish all labor, materials, equipment, tools, supervision, machinery, and supplies necessary to perform all work described in Exhibit A; and obtain all insurance, permits, licenses, and any other items necessary for the completion of all work described in Exhibit A (collectively, the "Work"). Exhibits A and B are incorporated herein and made part of this Agreement (collectively, the "Exhibits").')] },
    { title: 'Notification by Contractor', paras: [S('Contractor will notify Owner if any problems, questions, or complications arise that will alter the scope of Work. All changes and/or deviations in the Work must be presented by Contractor to Owner and agreed upon in writing in accordance with this Agreement.')] },
    { title: 'Term', paras: [subst(v, CONTRACT_CONFIG.section3Term)] },
    { title: 'Payment for Services and Contract Price', paras: [
      '',
      S('Contract Price. Owner will pay Contractor the amount agreed to on Exhibit A or B for the satisfactory performance of the Work (the "Contract Price"). The term "Contract Price" includes all of Contractor\'s overhead, profits, general conditions (for example, insurance and licenses) and all applicable state and local sales and use taxes incurred by Contractor in the performance of the Work and its other obligations under this Agreement. The term "Contract Price," as used in this Agreement, means the total amount Owner owes to the Contractor.'),
      S('Progress Invoices and Payments. **All invoices under this Agreement must be itemized and for Work actually completed.** Provided that the Work performed is acceptable to Owner and subject to Section 6 below, payment of each invoice is due within thirty (30) days of the Owner\'s receipt of a written invoice in accordance with this Section 4(b). **Owner will have no obligation to pay any invoice that is not in accordance with this Section 4(b).**'),
    ] },
    { title: 'Time of Performance and Completion', paras: [
      subst(v, 'Contractor shall perform the Work promptly and diligently and complete the Work (with the exception of any punch-list items) by {TERM_END_DATE}. TIME IS OF THE ESSENCE. In the event the Contractor fails to complete the Work by {TERM_END_DATE}, the Contract Sum will be reduced ' + (v.dailyReduction || '$[DAILY REDUCTION AMOUNT]') + ' for each day after {TERM_END_DATE} that the Work is not complete (exclusive of punch-list items). The Parties agree that ' + (v.dailyReduction || '$[DAILY REDUCTION AMOUNT]') + '/day for such delay is a fair and reasonable amount to be retained by Owner as agreed and liquidated damages in light of the adverse impact any delay in completion of the Work will have on Owner\'s business and other losses and costs incurred by Owner as a result of such delay and will not constitute a penalty or a forfeiture. Contractor shall coordinate the schedule of Work with Owner so as to minimize the inconvenience to residents at the Property. Unnecessary delay in completion of the Work caused by the Contractor may result in the termination of this Contract by Owner, at Owner\'s sole discretion. Work shall be provided only on ' + (v.workDays || '_____________ [list days of the week]') + ', between the hours of ' + (v.workHours || '_________ [list hours]') + '. Contractor shall not perform any Work on weekends or holidays unless mutually agreed upon by Owner and Contractor in advance. Prior to beginning the Work, Contractor shall provide an estimated work schedule to be approved by Owner. Contractor shall follow the approved schedule as closely as possible.'),
    ] },
    { title: 'Contractor Representations, Warranties and Compliance', paras: [S('Contractor represents that it has the right, ability (including all necessary licenses) and authorization to enter into this Agreement and to fully perform all of the obligations in this Agreement. Contractor shall comply, and take reasonable steps to ensure any and all subcontractors\' compliance, with all applicable federal, state, and local laws and regulations, including, without limitation, all state and local licensing and registration requirements for the Work. The Work shall be performed by individuals duly licensed and authorized by law to perform said work, to the extent required by law. All materials used in performing and/or constructing the Work shall be in compliance with all applicable laws and codes. Contractor represents that it and its subcontractors (if any) have the required skill, experience, and qualifications to perform the Work and shall perform, and ensure all performance by subcontractors of, the Work in a professional, good and workmanlike manner in accordance with generally recognized industry standards for similar work.')] },
    { title: 'Guarantee', paras: [subst(v, 'All work performed and all materials, equipment, or other personal property furnished by Contractor under this Agreement, if applicable, are hereby guaranteed by Contractor to be free from all defects ' + CONTRACT_CONFIG.section7GuaranteePrefix + ' one (1) calendar year from the date on which the work under this Agreement is finally accepted by Owner. During the guarantee period, Contractor shall promptly, upon Owner\'s request, furnish all labor, materials, equipment, and other items necessary to correct or replace any defective work, materials, equipment or other personal property installed or furnished under this Agreement, at no additional cost to Owner.')] },
    { title: 'Subcontractors and Employees of Contractor', paras: [S('Contractor is solely responsible for the supervision and direction of work by its employees and any approved subcontractors, suppliers, and materialmen. Neither Owner\'s approval of any subcontractor, suppliers, or materialmen, nor the failure of performance by such parties, shall relieve, release, or affect in any manner any of Contractor\'s duties, liabilities, or obligations under this Agreement. Contractor agrees that Contractor\'s employees and any subcontractors, suppliers, or materialmen shall be properly qualified and shall use reasonable care in the performance of their duties. If, however, Owner determines, for any reason, that a particular employee, subcontractor, supplier, or materialman is unsatisfactory, upon written notice from Owner to Contractor, Contractor shall remove such person and shall provide a qualified substitute. Contractor shall timely pay all amounts owed to subcontractors, employees, suppliers and materialmen in connection with this Agreement. **Notwithstanding anything else to the contrary in this Agreement, in the event Owner receives notice or knowledge that there are outstanding amounts owed to any subcontractor, supplier or materialman, Owner may withhold or set off any payment or amounts otherwise owed to Contractor for work performed or materials or supplies provided under this Agreement until Contractor submits evidence satisfactory to Owner that all amounts due to such persons in connection with this Agreement have been paid and all applicable liens or claims for liens have been waived and released.**')] },
    { title: 'Relationship of the Parties', paras: [S('This Agreement shall not be construed to create an employer-employee relationship between Owner and Contractor or between Owner and any of Contractor\'s employees or any subcontractors, suppliers or materialmen. It is expressly understood that Contractor shall have the status of an independent contractor. Contractor has no authority to bind Owner, and Contractor shall not make any agreements or representations on Owner\'s behalf without Owner\'s prior written consent.')] },
    { title: 'Indemnification', paras: [S('Contractor shall protect, defend, indemnify, and hold harmless Owner and its respective affiliates, managers, employees, agents, partners, officers, directors, attorneys, members, successors, and assigns against and from any and all claims, damages, liabilities, losses, causes of action, and costs and expenses of any kind and nature (including all out-of-pocket litigation costs and reasonable attorneys\' fees) directly or indirectly arising out of injury (including personal injury to or death of any person) and loss or damage to any property occurring in connection with or in any way incidental to the performance of the Work under this Agreement, resulting in whole or in part from the Contractor\'s breach of this Agreement or acts, errors, omissions or negligence of Contractor or its employees, agents, subcontractors, suppliers or materialmen under this Agreement. Contractor shall further be responsible for and bear the cost of all losses sustained and damage to property of Owner and the other indemnified parties caused by Contractor\'s acts, or those of its employees, agents, or subcontractors, or subcontractors\' employees. Further, Contractor shall protect, defend, indemnify, and hold harmless Owner and its respective affiliates, managers, employees, agents, partners, officers, directors, attorneys, members, successors, and assigns against and from any claims with respect to, including (but not limited to) general liability insurance, workers\' compensation or tax withholding respecting Contractor\'s employees, subcontractors, suppliers and materialmen. The provisions of this paragraph shall survive the expiration or termination of this Agreement.')] },
    { title: 'Insurance', paras: [S('Contractor represents and warrants that it is adequately insured for injury to its employees and others incurring loss or injury as a result of the acts of the Contractor or its employees, subcontractors, suppliers or materialmen. Contractor shall provide certificates of adequate and current insurance coverage for general liability and worker\'s compensation insurance with policy limits sufficient to protect and indemnify Owner from any losses resulting from Contractor\'s acts, conduct, negligence or omissions including general liability coverage with policy limits of at least $1,000,000 for each occurrence and $2,000,000 aggregate liability limits as well as worker\'s compensation liability limits of at least $1,000,000. Owner shall be listed as an additional insured under such general liability insurance policies, and Contractor shall provide proof of such insurance policies prior to the commencement of any work. Contractor shall maintain such insurance policies in effect throughout the term of this Agreement. Contractor acknowledges that it is solely responsible for obtaining and maintaining the insurance coverage required under this paragraph.')] },
    { title: 'Termination', paras: [S('Owner may terminate this Agreement at any time, with or without cause, upon written notice to Contractor. In the event of such termination, Owner will pay Contractor for all work properly performed hereunder up to the date of termination. Owner will have no further obligation or liability to Contractor. Contractor may terminate this Agreement for cause only after providing Owner with written notice indicating the area of default under this agreement and allowing for seven (7) days for Owner to cure the alleged default and respond in writing.')] },
    { title: 'Notices', paras: [
      S('Owner and Contractor shall send all notices relating to or arising out of this Agreement to the other party at the address listed below.'),
      S('Owner: {OWNER_NOTICE_ADDR}'),
      S('Contractor: {CONTRACTOR_ADDR}'),
    ] },
    { title: 'Governing Law and Disputes', paras: [S('This Agreement shall be interpreted under the laws of the state in which the Property is located. Any disputes arising from or related to the Agreement shall be submitted to non-binding mediation prior to the commencement of any litigation. Any mediation will take place in the state in which the Property is located.')] },
    { title: 'Disputes', paras: [S('In any dispute arising out of this Agreement, the parties will submit to mediation before filing suit using a mutually agreed upon, neutral mediator located in the county in which the Property is located. The mediation may not last longer than eight (8) hours unless both parties consent, in writing. The parties to this Agreement will each pay half the cost of mediation. Any party may initiate mediation by sending a written demand to the other.')] },
    { title: 'Attorney\'s Fees', paras: [S('In the event of any legal action to enforce the terms of this Agreement, the prevailing party will be entitled to reasonable attorneys\' fees, costs, and expenses in addition to any other relief to which the prevailing party may be entitled.')] },
    { title: 'Waiver of Jury Trial', paras: [S('Contractor and Owner hereby waive the right to a jury trial to resolve any and all disputes related to this Agreement or the Work.')] },
    { title: 'Assignment', paras: [S('Contractor shall not assign this Agreement or any rights hereunder without Owner\'s prior written consent.')] },
    { title: 'Merger', paras: [S('This Agreement, together with all exhibits, constitutes the sole and entire Agreement of Owner and Contractor with respect to the subject matter contained in this Agreement, and supersedes all prior or contemporaneous written and oral understandings and agreements.')] },
    { title: 'Modification', paras: [S('The provisions of this Agreement may not be amended, modified, or supplemented except by an agreement in writing and signed by Owner and Contractor.')] },
    { title: 'Waiver', paras: [S('The failure of either party to insist on strict performance of any covenant or obligation under this Agreement, regardless of the length of time for which such failure continues, shall not be deemed a waiver of such party\'s right to demand strict compliance in the future. No consent or waiver, express or implied, to or of any breach or default in the performance of any obligation under this Agreement shall constitute a consent or waiver to or of any other breach or default in the performance of the same or any other obligation.')] },
    { title: 'Conflict', paras: [S('If any provision of this Agreement conflicts with any exhibit, this Agreement shall govern. Any termination or expiration of this Agreement will automatically and simultaneously terminate all exhibits.')] },
    { title: 'Severability', paras: [S('If any provision of this Agreement is invalid or held unenforceable, the provision shall be deemed void. All remaining provisions shall remain in full force and effect.')] },
    { title: 'Access to Work', paras: [S('The Owner, the Owner\'s representatives, and public authorities shall at all times have access to the Work.')] },
    { title: 'Clean Up', paras: [S('Contractor shall keep the Property clean of all rubbish and debris generated by the Work and remove all such rubbish and debris upon the completion of the Work.')] },
  ];
}

function exhibitC(v: ContractVars): string {
  return `TO:       ${v.ownerEntity}
          ${v.ownerNoticeAddr}

FROM:     ${v.contractorName}
          ${v.contractorAddr}

In return for payment of ${v.contractTotal} received from ${v.ownerEntity} to ${v.contractorName} in exchange for labor at and/or materials or equipment furnished to ${v.propertyName}, ${v.propertyAddr} through this date, ${v.contractorName} waives its right to assert, record and foreclose a labor, mechanic's or materialman's lien under any and all applicable state and local laws for labor performed and materials and equipment furnished at the above job site up to and including the date of ${v.effectiveDate}. The undersigned represents warrants that he/she is authorized to execute this Conditional Waiver of Lien. This waiver is only effective and is conditional upon the undersigned actually being promptly paid the above amount.

${v.contractorName}

Date    ___________________________________
By:     ___________________________________
Name:   ___________________________________
Title:  ___________________________________`;
}

function exhibitD(v: ContractVars): string {
  return `State of:
County of:

I, the undersigned, am a general contractor, subcontractor, materialman, or other person furnishing services, labor, or material in the construction, repair, and/or replacement of improvements to parcels of real property to ${v.ownerEntity}, ${v.ownerNoticeAddr}.

IN CONSIDERATION of the full and final payment of any and all sums of money due and owing the undersigned, the sufficiency and receipt of which is hereby acknowledged, and/or other benefits accruing to me, I do hereby, waive, release, and quitclaim in favor of the owner or owners of said real estate and any and all lenders or their assigns with any interest in said real property, all right that I may now have, for the services, labor, and material furnished through the date hereof, to a lien upon any and all lands and improvements as to which such services, labor, or materials have been furnished; and, I do warrant that I have not and will not assign any claim for payment nor any right to perfect a lien against said property, and that I have the right to execute this waiver and release of liens. I further warrant that no chattel mortgage, conditional sale contract, retention of title agreement, or mechanic's or materialman's lien, has been given or executed by the undersigned, for or in connection with any material appliances or machinery placed upon said premises or installed by me or any other person, whether permanently affixed to the property or not, which has been released, and agree that this document may be filed of record and shall act as a Release of any such lien claim I might otherwise have concerning work performed for ${v.ownerEntity}.

Signature: _______________
Name:      __________________
Company:   _______________
Title:     ___________________
Date:      ___________________`;
}
