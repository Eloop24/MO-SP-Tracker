import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import AdmZip from 'adm-zip';
import { CONTRACT_CONFIG } from '../shared/domain.js';

/* =============================================================================
   Independent Contractor Agreement — LARGE CONTRACT PDF generator
   For contracts ≥ $50,000. Based on the expanded Monarch DOCX template:
   - Higher insurance limits (CGL $1M/$5M + $5M umbrella)
   - Subcontractors' insurance sub-section
   - Surety Bonds section
   - Force Majeure section
   - Ownership of Drawings section
   - Owner's Representatives (AM + Analyst) with emails
   - Exhibit E: Change Order
   ============================================================================= */

export interface LargeContractVars {
  effectiveDate: string;      // MM/DD/YYYY
  termEndDate: string;        // MM/DD/YYYY
  ownerEntity: string;
  contractorName: string;
  propertyName: string;
  propertyAddr: string;
  ownerNoticeAddr: string;
  contractorAddr: string;
  contractTotal: string;      // e.g. "$75,000.00"
  contractType: 'bid' | 'tm'; // bid contract or time & materials
  dailyReduction?: string;
  workDays?: string;
  workHours?: string;
  paymentTerms?: string;
  amName: string;             // always "Ben Hoglund"
  amEmail: string;            // always "bhoglund@monarchinvestment.com"
  analystName: string;        // "Ethan Loop" or "Avery Barnes"
  analystEmail: string;       // corresponding @monarchinvestment.com email
}

export interface BidAttachmentL { buffer: Buffer; name: string; }

const PAGE_W = 612, PAGE_H = 792;
const MARGIN = 72;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const BODY_SIZE = 11, LEADING = 16;
const TOP = PAGE_H - MARGIN;
const BOTTOM = 72;

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

export async function buildLargeContract(vars: LargeContractVars, attachments: BidAttachmentL[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const roman = await doc.embedFont(StandardFonts.TimesRoman);
  const bold  = await doc.embedFont(StandardFonts.TimesRomanBold);
  const fontFor = (b: boolean) => (b ? bold : roman);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = TOP;

  const newPage = () => { page = doc.addPage([PAGE_W, PAGE_H]); y = TOP; };
  const space = (h: number) => { if (y - h < BOTTOM) newPage(); };

  function paragraph(text: string, opts: { size?: number; leading?: number; gap?: number; align?: 'left' | 'center'; justify?: boolean; indent?: number } = {}) {
    const size    = opts.size    ?? BODY_SIZE;
    const lead    = opts.leading ?? LEADING;
    const indent  = opts.indent  ?? 0;
    const width   = CONTENT_W - indent;
    const words   = tokenize(text);
    const wW      = (w: Word) => fontFor(w.bold).widthOfTextAtSize(w.text, size);
    const spaceW  = (b: boolean) => fontFor(b).widthOfTextAtSize(' ', size);
    if (!words.length) { y -= lead + (opts.gap ?? 6); return; }

    const lines: Word[][] = [];
    let line: Word[] = [], lineW = 0;
    for (const w of words) {
      const add = (line.length ? spaceW(w.bold) : 0) + wW(w);
      if (lineW + add > width && line.length) { lines.push(line); line = []; lineW = 0; }
      lineW += (line.length ? spaceW(w.bold) : 0) + w[(w);
      line.push(w);
    }
    if (line.length) lines.push(line);

    lines.forEach((ln, li) => {
      space(lead);
      const isLast  = li === lines.length - 1;
      const natural = ln.reduce((a, w, i) => a + wW(w) + (i ? spaceW(w.bold) : 0), 0);
      let x = MARGIN + indent;
      let extra = 0;
      if (opts.align === 'center') x = MARGIN + (CONTENT_W - natural) / 2;
      else if (opts.justify && !isLast && ln.length > 1) extra = (width - natural) / (ln.length - 1);
      ln.forEach((w, i) => {
        if (i) x += spaceW(w.bold) + (opts.align === 'center' ? 0 : extra);
        page.drawText(w.text, { x, y, size, font: fontFor(w.bold), color: rgb(0, 0, 0) });
        x += w[(w);
      });
      y -= lead;
    });
    y -= (opts.gap ?? 6);
  }

  // Numbered main section: "N. **Title.**  body"
  function section(n: number, title: string, paras: string[]) {
    if (paras[0] === '') {
      paragraph(`${n}. **${title}.**`, { gap: 4 });
      for (let i = 1; i < paras.length; i++) paragraph(paras[i], { gap: 8 });
    } else {
      paragraph(`${n}. **${title}.** ${paras[0]}`, { gap: paras.length > 1 ? 4 : 8 });
      for (let i = 1; i < paras.length; i++) paragraph(paras[i], { gap: 6 });
    }
  }

  // Sub-section: "  a. **Title.**  body"
  function subSection(letter: string, title: string, body: string) {
    paragraph(`     ${letter}. **${title}.**  ${body}`, { indent: 18, gap: 6 });
  }

  // ---------- Title ----------
  paragraph('**INDEPENDENT CONTRACTOR AGREEMENT**', { size: 13, leading: 22, align: 'center', gap: 16 });

  // ---------- Preamble ----------
  for (const para of largePreamble(vars)) paragraph(para, { gap: 10 });

  // ---------- General Terms box ----------
  space(90);
  paragraph('**General Terms.**', { gap: 4 });
  paragraph(`Type of contract:  ${vars.contractType === 'bid' ? 'Bid contract' : 'Time and materials contract'}`, { indent: 18, gap: 4 });
  paragraph(`"Owner's Representatives": means ${vars.amName} and ${vars.analystName}.`, { indent: 18, gap: 4 });
  paragraph(`Work Completion Date: ${vars.termEndDate}.`, { indent: 18, gap: 4 });
  if (vars.contractType === 'bid') {
    paragraph(`"Contract Sum": ${vars.contractTotal}`, { indent: 18, gap: 10 });
  } else {
    paragraph('"Contract Sum": Time and materials contract — see Section 4.a below.', { indent: 18, gap: 10 });
  }

  // ---------- Numbered sections ----------
  buildLargeSections(vars).forEach((s, i) => {
    if (s.subSections) {
      // Section with lettered sub-sections
      paragraph(`${i + 1}. **${s.title}.**`, { gap: 4 });
      if (s.intro) paragraph(s.intro, { gap: 4 });
      s.subSections.forEach(ss => subSection(ss.letter, ss.title, ss.body));
      y -= 4;
    } else {
      section(i + 1, s.title, s.paras!);
    }
  });

  // ---------- Signature block ----------
  space(180);
  paragraph('IN WITNESS WHEREOF, the parties hereto have executed this Agreement as of the Effective Date.', { gap: 18 });
  signatureLarge(page, y, roman, bold, vars);
  y -= 150;

  // ---------- Exhibit A & B ----------
  await exhibitABL(doc, vars, attachments, roman, bold);

  // ---------- Exhibit C ----------
  exhibitTextL(doc, roman, bold, exhibitCL(vars), 'EXHIBIT C', 'FORM OF CONDITIONAL WAIVER OF LIEN AND RELEASE');

  // ---------- Exhibit D ----------
  exhibitTextL(doc, roman, bold, exhibitDL(vars), 'EXHIBIT D', 'FORM OF FINAL WAIVER OF LIEN AND RELEASE');

  // ---------- Exhibit E ----------
  exhibitTextL(doc, roman, bold, exhibitEL(vars), 'EXHIBIT E', 'FORM OF CHANGE ORDER');

  // ---------- Page numbers ----------
  doc.getPages().forEach((p, i) => {
    const label = String(i + 1);
    const w = roman.widthOfTextAtSize(label, 9);
    const pw = p.getSize().width;
    p.drawText(label, { x: (pw - w) / 2, y: 24, size: 9, font: roman, color: rgb(0, 0, 0) });
  });

  return doc.save();
}

/* ---------- Signature ---------- */
function signatureLarge(page: PDFPage, top: number, roman: PDFFont, bold: PDFFont, v: LargeContractVars) {
  const colL = MARGIN, colR = MARGIN + CONTENT_W / 2 + 10;
  const line = (x: number, yy: number, label: string, f = roman) =>
    page.drawText(label, { x, y: yy, size: 10, font: f, color: rgb(0, 0, 0) });
  let yy = top;
  line(colL, yy, `Owner: ${v.ownerEntity}`, bold);
  line(colR, yy, `Contractor: ${v.contractorName}`, bold); yy -= 26;
  line(colL, yy, 'By:');
  line(colR, yy, 'By: __________________'); yy -= 14;
  line(colL, yy, 'as Agent for and on behalf of Owner'); yy -= 22;
  const ownerName  = CONTRACT_CONFIG.ownerName  || '________________';
  const ownerTitle = CONTRACT_CONFIG.ownerTitle || '_________________';
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const ownerDate = `${mm}/${dd}/${today.getFullYear()}`;
  line(colL, yy, `Name: ${ownerName}`);  line(colR, yy, 'Name: ________________'); yy -= 22;
  line(colL, yy, `Title: ${ownerTitle}`); line(colR, yy, 'Title: _________________'); yy -= 22;
  line(colL, yy, `Date: ${ownerDate}`);   line(colR, yy, 'Date: _________________');
}

/* ---------- Exhibit A&B ---------- */
function detectKindL(buf: Buffer): 'pdf' | 'jpg' | 'png' | 'zip' | 'unknown' {
  if (buf.length < 4) return 'unknown';
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0x50 && buf[1] === 0x4b) return 'zip';
  return 'unknown';
}

function expandL(atts: BidAttachmentL[]): BidAttachmentL[] {
  const out: BidAttachmentL[] = [];
  for (const att of atts) {
    if (detectKindL(att.buffer) === 'zip') {
      const zip = new AdmZip(att.buffer);
      const entries = zip.getEntries()
        .filter(e => !e.isDirectory && /\.(pdf|jpe?g|png)$/i.test(e.entryName))
        .sort((a, b) => a.entryName.localeCompare(b.entryName));
      const pdfs = entries.filter(e => /\.pdf$/i.test(e.entryName));
      const imgs = entries.filter(e => /\.(jpe?g|png)$/i.test(e.entryName));
      for (const e of [...pdfs, ...imgs]) out.push({ buffer: e.getData(), name: e.entryName });
    } else {
      out.push(att);
    }
  }
  return out;
}

function fitBoxL(w: number, h: number, maxW: number, maxH: number) {
  const s = Math.min(maxW / w, maxH / h, 1);
  return { w: w * s, h: h * s };
}

async function exhibitABL(doc: PDFDocument, vars: LargeContractVars, atts: BidAttachmentL[], roman: PDFFont, bold: PDFFont) {
  const header = doc.addPage([PAGE_W, PAGE_H]);
  let yy = TOP;
  const center = (txt: string, size: number, f: PDFFont) => {
    const w = f.widthOfTextAtSize(txt, size);
    header.drawText(txt, { x: (PAGE_W - w) / 2, y: yy, size, font: f, color: rgb(0, 0, 0) });
    yy -= size + 8;
  };
  center('EXHIBIT A & B', 13, bold);
  center('CONTRACT PRICE & SCOPE', 11, bold);
  center(`CONTRACT TOTAL: ${vars.contractTotal}`, 12, bold);
  const ptLabel = vars.paymentTerms?.trim() || 'Entirety Due on Completion';
  center(`Payment Terms: ${ptLabel}`, 10, roman);

  const expanded = expandL(atts);
  if (!expanded.length) { center('[ Bid document attached separately ]', 10, roman); return; }
  center('Bid documents follow.', 10, roman);

  for (const att of expanded) {
    const kind = detectKindL(att.buffer);
    try {
      if (kind === 'pdf') {
        const src = await PDFDocument.load(att.buffer, { ignoreEncryption: true });
        const pages = await doc.copyPages(src, src.getPageIndices());
        for (const pg of pages) doc.addPage(pg);
      } else if (kind === 'jpg' || kind === 'png') {
        const img = kind === 'jpg' ? await doc.embedJpg(att.buffer) : await doc.embedPng(att.buffer);
        const p = doc.addPage([PAGE_W, PAGE_H]);
        const f = fitBoxL(img.width, img.height, CONTENT_W, PAGE_H - 2 * MARGIN);
        p.drawImage(img, { x: (PAGE_W - f.w) / 2, y: (PAGE_H - f.h) / 2, width: f.w, height: f.h });
      }
    } catch { /* skip unreadable attachment */ }
  }
}

/* ---------- Exhibit text pages ---------- */
function exhibitTextL(doc: PDFDocument, roman: PDFFont, bold: PDFFont, body: string, head1: string, head2: string) {
  let pg = doc.addPage([PAGE_W, PAGE_H]);
  let y = TOP;
  const center = (txt: string, size: number, f: PDFFont) => {
    const w = f.widthOfTextAtSize(txt, size);
    pg.drawText(txt, { x: (PAGE_W - w) / 2, y, size, font: f, color: rgb(0, 0, 0) });
    y -= size + 8;
  };
  center(head1, 13, bold);
  center(head2, 11, bold);
  y -= 10;
  for (const para of body.split('\n')) {
    if (para.trim() === '') { y -= 10; continue; }
    const words = para.split(/\s+/);
    let line = '';
    const draw = (t: string) => { pg.drawText(t, { x: MARGIN, y, size: 11, font: roman, color: rgb(0, 0, 0) }); y -= LEADING; };
    for (const wd of words) {
      const test = line ? line + ' ' + wd : wd;
      if (roman.widthOfTextAtSize(test, 11) > CONTENT_W && line) {
        if (y < BOTTOM) { pg = doc.addPage([PAGE_W, PAGE_H]); y = TOP; }
        draw(line); line = wd;
      } else line = test;
    }
    if (line) { if (y < BOTTOM) { pg = doc.addPage([PAGE_W, PAGE_H]); y = TOP; } draw(line); }
    y -= 6;
  }
}

/* ---------- Text substitution ---------- */
function sub(v: LargeContractVars, s: string): string {
  return s
    .replaceAll('{EFFECTIVE_DATE}', v.effectiveDate)
    .replaceAll('{TERM_END_DATE}', v.termEndDate)
    .replaceAll('{OWNER_ENTITY}', v.ownerEntity)
    .replaceAll('{CONTRACTOR_NAME}', v.contractorName)
    .replaceAll('{PROPERTY_NAME}', v.propertyName)
    .replaceAll('{PROPERTY_ADDR}', v.propertyAddr)
    .replaceAll('{OWNER_NOTICE_ADDR}', v.ownerNoticeAddr)
    .replaceAll('{CONTRACTOR_ADDR}', v.contractorAddr)
    .replaceAll('{AM_NAME}', v.amName)
    .replaceAll('{AM_EMAIL}', v.amEmail)
    .replaceAll('{ANALYST_NAME}', v.analystName)
    .replaceAll('{ANALYST_EMAIL}', v.analystEmail);
}

/* ---------- Preamble ---------- */
function largePreamble(v: LargeContractVars): string[] {
  return [
    sub(v, 'This Independent Contractor Agreement ("Contract") is entered into and effective as of {EFFECTIVE_DATE} ("Effective Date") between {OWNER_ENTITY} ("Owner"), and {CONTRACTOR_NAME} ("Contractor"). The Agreement shall affect the real property known as the {PROPERTY_NAME}, {PROPERTY_ADDR} ("Property"). The term "Contractor", as used in this Contract, means, collectively, Contractor, its agents, employees, subcontractors, successors and assigns.'),
    sub(v, 'Owner desires to engage Contractor for certain services or improvements to be completed at the Property in accordance with the plans and specifications attached hereto as Exhibit A and the terms and conditions set forth in this Contract. Owner and Contractor, for good and valuable consideration as defined in Exhibit B, the receipt and sufficiency of which are acknowledged hereby agree as follows:'),
  ];
}

/* ---------- Section definitions ---------- */
type SectionDef =
  | { title: string; paras: string[]; subSections?: never; intro?: never }
  | { title: string; intro?: string; subSections: { letter: string; title: string; body: string }[]; paras?: never };

function buildLargeSections(v: LargeContractVars): SectionDef[] {
  const S = (s: string) => sub(v, s);
  const daily = v.dailyReduction || '$[DAILY REDUCTION AMOUNT]';
  const days  = v.workDays  || '_____________ [list days]';
  const hours = v.workHours || '_________ [list hours]';

  const contractSumBody = v.contractType === 'bid'
    ? S('**Bid Contract.** Owner will pay Contractor the amount agreed to on Exhibit B for the satisfactory performance of the Work (the "Contract Sum"). The term "Contract Sum" includes all of Contractor\'s overhead, profits, general conditions (for example, insurance and licenses) and all applicable state and local sales and use taxes incurred by Contractor in the performance of the Work and its other obligations under this Contract. The term "Contract Sum," as used in this Contract, means the total amount Owner owes to the Contractor.')
    : S('**Time and Materials Contract.** Owner will pay Contractor for the actual cost of materials, labor, and equipment used in the performance of the Work, plus a fee as specified in Exhibit B (the "Contract Sum"). Contractor shall maintain detailed records of all costs and provide itemized invoices. The total Contract Sum shall not exceed the amount stated in Exhibit B without prior written approval from Owner.');

  return [
    {
      title: 'Services and Scope of Work',
      paras: [S('Contractor shall perform all work and/or services described in the Exhibits (as defined below) and change orders of such work; furnish all labor, materials, equipment, tools, supervision, machinery, and supplies necessary to perform all work described in the Exhibits; and obtain all insurance, permits, licenses, and any other items necessary for the completion of all work described in the Exhibits (collectively, the "Work"). Exhibits A and B are incorporated herein and made part of this Contract (collectively, the "Exhibits").')],
    },
    {
      title: 'Notification by Contractor; Change Orders',
      paras: [S('All drawings and/or specifications attached to this Contract are the final drawings and specifications of the Work (some details are not provided at time of signing). Contractor will notify Owner if any problems, questions, or complications arise that will alter the scope of Work. All changes and/or deviations in the Work must be presented by Contractor to Owner and agreed upon in writing by both parties in advance of the change using a form substantially similar to Exhibit E (each, a "Change Order"). Owner has no obligation to pay for any changes to the Work that are not set forth in a written Change Order signed by Owner.')],
    },
    {
      title: 'Term',
      paras: [S(CONTRACT_CONFIG.section3Term)],
    },
    {
      title: 'Payment for Services and Contract Sum',
      subSections: [
        {
          letter: 'a',
          title: 'Contract Sum',
          body: contractSumBody,
        },
        {
          letter: 'b',
          title: 'Progress Invoices and Payments',
          body: S('All invoices under this Contract must (i) be ' + (v.contractType === 'tm' ? 'itemized and ' : '') + 'for Work actually completed (and for no other work) and (ii) must include executed lien waivers from all subcontractors and materialmen who performed Work or supplied materials during the invoice period. **Owner will have no obligation to pay any invoice that is not in accordance with this Section 4.b.** Provided that the Work performed is acceptable to Owner and subject to Section 6 below, payment of each invoice is due within thirty (30) days of the Owner\'s receipt of a written invoice in accordance with this Section 4.b.'),
        },
      ],
    },
    {
      title: 'Time of Performance and Completion; Schedule',
      paras: [S(`Contractor shall perform the Work promptly and diligently and complete the Work (with the exception of any punch-list items) by {TERM_END_DATE}. TIME IS OF THE ESSENCE. In the event the Contractor fails to complete the Work by {TERM_END_DATE}, the Contract Sum will be reduced ${daily} for each day after {TERM_END_DATE} that the Work is not complete (exclusive of punch-list items). The Parties agree that ${daily}/day for such delay is a fair and reasonable amount to be retained by Owner as agreed and liquidated damages. Contractor shall coordinate the schedule of Work with Owner so as to minimize the inconvenience to residents at the Property. Work shall be provided only on ${days}, between the hours of ${hours}. Contractor shall not perform any Work on weekends or holidays unless mutually agreed upon by Owner and Contractor in advance. Prior to beginning the Work, Contractor shall provide an estimated work schedule to be approved by Owner.`)],
    },
    {
      title: 'Contractor Representations, Warranties and Compliance',
      paras: [S('Contractor represents that it has the right, ability (including all necessary licenses) and authorization to enter into this Contract and to fully perform all of the obligations in this Contract. Contractor shall comply, and take reasonable steps to ensure any and all subcontractors\' compliance, with all applicable federal, state, and local laws and regulations, including, without limitation, all state and local licensing and registration requirements for the Work. All materials used in performing and/or constructing the Work shall be in compliance with all applicable laws and codes. Contractor represents that it and its subcontractors (if any) have the required skill, experience, and qualifications to perform the Work and shall perform the Work in a professional, good and workmanlike manner in accordance with generally recognized industry standards for similar work.')],
    },
    {
      title: 'Warranty',
      paras: [S('Contractor warrants all materials and other personal property furnished by Contractor under this Contract to be free from all defects for a period of one (1) calendar year from the date the Work is finally accepted by Owner. During the warranty period, Contractor shall promptly, upon Owner\'s request, furnish all labor, materials, equipment, and other items necessary to correct or replace any defective work, materials, equipment or other personal property installed or furnished under this Contract, at no additional cost to Owner.')],
    },
    {
      title: 'Subcontractors and Employees of Contractor',
      paras: [S('Contractor is solely responsible for the supervision and direction of work by its employees and any approved subcontractors, suppliers, and materialmen. Neither Owner\'s approval of any subcontractor, suppliers, or materialmen, nor the failure of performance by such parties, shall relieve, release, or affect in any manner any of Contractor\'s duties, liabilities, or obligations under this Contract. **Notwithstanding anything else to the contrary in this Contract, in the event Owner receives notice or knowledge that there are outstanding amounts owed to any subcontractor, supplier or materialman, Owner may withhold or set off any payment or amounts otherwise owed to Contractor for work performed or materials or supplies provided under this Contract until Contractor submits evidence satisfactory to Owner that all amounts due to such persons in connection with this Contract have been paid and all applicable liens or claims for liens have been waived and released.**')],
    },
    {
      title: 'Relationship of the Parties',
      paras: [S('This Contract shall not be construed to create an employer-employee relationship between Owner and Contractor or between Owner and any of Contractor\'s employees or any subcontractors, suppliers or materialmen. It is expressly understood that Contractor shall have the status of an independent contractor. Contractor has no authority to bind Owner, and Contractor shall not make any agreements or representations on Owner\'s behalf without Owner\'s prior written consent.')],
    },
    {
      title: 'Indemnification',
      paras: [S('Contractor shall protect, defend, indemnify, and hold harmless Owner and its respective affiliates, managers, employees, agents, partners, officers, directors, attorneys, members, successors, and assigns against and from any and all claims, damages, liabilities, losses, causes of action, and costs and expenses of any kind and nature (including all out-of-pocket litigation costs and reasonable attorneys\' fees) directly or indirectly arising out of injury (including personal injury to or death of any person) and loss or damage to any property occurring in connection with or in any way incidental to the performance of the Work under this Contract, resulting in whole or in part from the Contractor\'s breach of this Contract or acts, errors, omissions or negligence of Contractor or its employees, agents, subcontractors, suppliers or materialmen under this Contract. The provisions of this paragraph shall survive the expiration or termination of this Contract.')],
    },
    {
      title: 'Insurance',
      subSections: [
        {
          letter: 'a',
          title: 'Contractor\'s Insurance',
          body: S('Contractor represents and warrants that it is adequately insured for injury to its employees and others incurring loss or injury as a result of the acts of the Contractor or its employees, subcontractors, suppliers or materialmen. Prior to commencing any Work, Contractor shall provide certificates of adequate and current insurance coverage for (a) commercial general liability insurance with a combined single limit of not less than $1,000,000 per occurrence and a $5,000,000 aggregate liability limit; (b) worker\'s compensation insurance with not less than $1,000,000 per accident, $1,000,000 disease policy limit and $1,000,000 disease limit for each employee; (c) excess umbrella liability insurance in the amount of $5,000,000; and (d) automobile insurance that satisfies applicable state automobile insurance coverage requirements. Owner, Owner\'s mortgage lender(s), and Monarch Investment & Management Group, LLC shall be listed as additional insureds under all insurance policies required under this Section 10.a. Contractor shall maintain the insurance policies required under this Section 10.a in effect throughout the term of this Contract and shall provide certificates of adequate and current insurance coverage upon Owner\'s request. Contractor acknowledges that it is solely responsible for obtaining and maintaining the insurance coverages required under this Section 10.a.'),
        },
        {
          letter: 'b',
          title: 'Subcontractors\' Insurance',
          body: S('Contractor shall ensure that each subcontractor performing Work is adequately insured for injury to its employees and others incurring loss or injury as a result of the acts of the subcontractor or its employees. Prior to commencing work on the Property, each subcontractor must provide Owner with certificates of adequate and current insurance coverage for (a) commercial general liability insurance with a combined single limit of not less than $1,000,000 per occurrence and a $2,000,000 aggregate liability limit and (b) automobile insurance that satisfies applicable state automobile insurance coverage requirements. Owner, Owner\'s lender(s), and Monarch Investment & Management Group, LLC shall be listed as additional insureds under all insurance policies required under this Section 10.b. All subcontractors performing Work shall maintain the insurance policies required under this Section 10.b in effect throughout the term of this Contract.'),
        },
        {
          letter: 'c',
          title: 'General Requirements',
          body: 'The policies required under Section 10 shall be with companies rated A- X or better by A.M. Best. Insurers shall be licensed to do business in the state in which the Property is located and domiciled in the USA. Any deductible amounts under any insurance policies required hereunder shall not exceed $5,000.',
        },
        {
          letter: 'd',
          title: 'Waiver of Subrogation',
          body: 'The parties hereby mutually waive their respective rights of recovery against each other for any loss of, or damage to, either party\'s property, to the extent that such loss or damage is insured by an insurance policy in effect at the time of such loss or damage. Each party shall obtain any special endorsements, if required by its insurer whereby the insurer waives its rights of subrogation against the other party.',
        },
      ],
    },
    {
      title: 'Termination',
      paras: [S('Owner may terminate this Contract at any time without cause upon written notice to Contractor. In the event of such termination, Owner will pay Contractor for all work properly performed hereunder and acceptable to Owner up to the date of termination. Owner will have no further obligation or liability to Contractor. Contractor may terminate this Contract for cause only after providing Owner with written notice indicating the area of default under this Contract and allowing for fourteen (14) days for Owner to cure the alleged default and respond in writing.')],
    },
    {
      title: 'Force Majeure',
      paras: [S('Notwithstanding the foregoing to the contrary, any delay or failure in the performance by Owner or Contractor shall be excused if and to the extent caused by the occurrence of a force majeure. For purposes of this Contract, force majeure means an event that is not reasonably foreseeable or otherwise caused by or under the control of the party claiming force majeure, including acts of God, governmental acts, injunctions, labor strikes, wars, and other like events that are beyond the reasonable anticipation and control of the party, despite the party\'s reasonable efforts to prevent, delay, or mitigate the effect of such events.')],
    },
    {
      title: 'Access to Work',
      paras: [S('The Owner, the Owner\'s representatives, and public authorities shall at all times have access to the Work.')],
    },
    {
      title: 'No Implied Waiver',
      paras: [S('The failure of either party to insist on strict performance of any covenant or obligation under this Contract, regardless of the length of time for which such failure continues, shall not be deemed a waiver of such party\'s right to demand strict compliance in the future. No consent or Waiver, express or implied, to or of any breach or default in the performance of any obligation under this Contract shall constitute a consent or waiver to or of any other breach or default in the performance of the same or any other obligation.')],
    },
    {
      title: 'Ownership of Drawings and Materials and Storage',
      paras: [S('All drawings, reports, designs, sketches, working drawings, shop drawings, documents, certificates, plans, specifications, estimates, memoranda, analyses, calculations, models and other tangible evidence of the Contractor\'s work product prepared in connection with the Work shall become and remain the sole property of Owner. Contractor may retain copies of its work product for its records. Any materials that are unfixed and required to perform the Work and that are delivered to the Property shall remain the property of the Contractor until they have been both attached to the Property and paid for by Owner. The Contractor shall be solely responsible for repairing, at Contractor\'s sole cost and expense, any damage to materials that occur prior to installation. The Contractor shall either store materials at the Property or in a bonded, insured site that is available to Owner and its lender for inspection upon reasonable notice.')],
    },
    {
      title: 'Surety Bonds',
      paras: [S('Contractor shall, prior to the commencement of any Work, cause an insurance company or bank listed in the current list of "Companies Holding Certificates of Authority as Acceptable Sureties on Federal Bonds and as Acceptable Reinsuring Companies" as published in Circular 570 (as amended) by the Audit Staff Bureau of Accounts, U.S. Treasury Department, to furnish to both Owner and Monarch Investment & Management Group, LLC, as dual obligees, payment and performance bonds, each in the amount of the Contract Sum; such bonds shall remain in effect for six (6) months following the date Owner makes the final payment for the Work to Contractor. The Contractor\'s liability under this Contract will not be limited to the amount of the bonds required under this Section 16.')],
    },
    {
      title: 'Clean Up',
      paras: [S('Contractor shall keep the Property clean of all rubbish and debris generated by the Work and remove all such rubbish and debris upon the completion of the Work.')],
    },
    {
      title: 'Notices',
      paras: [
        S('All notices required or permitted hereunder must be in writing and shall be deemed to have been given when mailed, postage prepaid, by U.S. registered or certified mail (with return receipt requested), by email (with proof of transmission) or by recognized overnight air courier service (with proof of delivery) to the notice addresses set forth below.'),
        S('Owner: {OWNER_ENTITY}'),
        S('       {OWNER_NOTICE_ADDR}'),
        '',
        S('Contractor: {CONTRACTOR_NAME}'),
        S('            {CONTRACTOR_ADDR}'),
      ],
    },
    {
      title: 'Owner\'s Representatives',
      paras: [S('Copies of all notices and other communications under this Contract to the Owner or Owner\'s Representatives must be sent by email to {AM_NAME} at {AM_EMAIL} and {ANALYST_NAME} at {ANALYST_EMAIL}.')],
    },
    {
      title: 'Governing Law and Disputes',
      paras: [S('This Contract shall be interpreted under the laws of the state in which the Property is located. Any disputes arising from or related to this Contract shall be submitted to non-binding mediation prior to the commencement of any litigation. Any mediation will take place in the state in which the Property is located.')],
    },
    {
      title: 'Attorney\'s Fees',
      paras: [S('In the event of any legal action to enforce the terms of this Contract, the prevailing party will be entitled to reasonable attorneys\' fees, costs, and expenses in addition to any other legal or legal relief to which the prevailing party may be entitled.')],
    },
    {
      title: 'Assignment',
      paras: [S('Contractor shall not assign this Contract or any rights hereunder without Owner\'s prior written consent.')],
    },
    {
      title: 'Merger',
      paras: [S('This Contract, together with all exhibits, constitutes the sole and entire agreement of Owner and Contractor with respect to the subject matter contained in this Contract, and supersedes all prior and contemporaneous written and oral understandings and agreements.')],
    },
    {
      title: 'Modification',
      paras: [S('The provisions of this Contract may not be amended, modified, or supplemented except by an agreement in writing and signed by Owner and Contractor.')],
    },
    {
      title: 'Exhibits; Conflict',
      paras: [S('The exhibits attached to this Contract are a part of and incorporated into this Contract; provided, however, that if any provision of this Contract conflicts with the provision of any exhibit, this Contract shall control and govern to the extent of the conflict. Any termination or expiration of this Contract will automatically and simultaneously terminate all exhibits.')],
    },
    {
      title: 'Severability',
      paras: [S('If any provision of this Contract is invalid or held unenforceable, the provision shall be deemed void. All remaining provisions shall remain in full force and effect.')],
    },
  ];
}

/* ---------- Exhibit C — Conditional Lien Waiver ---------- */
function exhibitCL(v: LargeContractVars): string {
  return `TO:       ${v.ownerEntity}
          ${v.ownerNoticeAddr}

FROM:     ${v.contractorName}
          ${v.contractorAddr}

In return for payment of ${v.contractTotal} received from ${v.ownerEntity} to ${v.contractorName} in exchange for labor at and/or materials or equipment furnished to ${v.propertyName}, ${v.propertyAddr} through this date, ${v.contractorName} waives its right to assert, record and foreclose a labor, mechanic's or materialman's lien under any and all applicable state and local laws for labor performed and materials and equipment furnished at the above job site up to and including the date of ${v.effectiveDate}. The undersigned represents and warrants that he/she is authorized to execute this Conditional Waiver of Lien. This waiver is only effective and is conditional upon the undersigned actually being promptly paid the above amount.

${v.contractorName}

Date    ___________________________________
By:     ___________________________________
Name:   ___________________________________
Title:  ___________________________________`;
}

/* ---------- Exhibit D — Final Lien Waiver ---------- */
function exhibitDL(v: LargeContractVars): string {
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

/* ---------- Exhibit E — Change Order ---------- */
function exhibitEL(v: LargeContractVars): string {
  return `PROJECT:    ${v.propertyName}
ADDRESS:    ${v.propertyAddr}
CONTRACTOR: ${v.contractorName}
CONTRACT DATE: ${v.effectiveDate}

CHANGE ORDER NUMBER: ______

Description of Change:
___________________________________________________________________________
___________________________________________________________________________
___________________________________________________________________________
___________________________________________________________________________

Impact on Contract Sum:
  Original Contract Sum:                        ${v.contractTotal}
  Net change by prior Change Orders:            $_______________
  Contract Sum prior to this Change Order:      $_______________
  Amount of this Change Order:                  $_______________
  New Contract Sum including this Change Order: $_______________

Impact on Contract Time:
  Original Work Completion Date:                ${v.termEndDate}
  Net change by prior Change Orders:            _______ days
  Work Completion Date prior to this Order:     _______________
  Change in days by this Change Order:          _______ days
  New Work Completion Date:                     _______________

The above changes are agreed to and accepted:

Owner: ${v.ownerEntity}              Contractor: ${v.contractorName}

By: __________________               By: __________________
Name: ________________               Name: ________________
Title: _________________             Title: _________________
Date: _________________              Date: _________________`;
}
