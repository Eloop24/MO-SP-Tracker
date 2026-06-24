import AdmZip from 'adm-zip';
const path = process.argv[2];
const zip = new AdmZip(path);
const xml = zip.getEntry('word/document.xml').getData().toString('utf8');

// Split into paragraphs
const paras = xml.split(/<w:p[ >]/).slice(1);
const out = [];
for (const p of paras) {
  const body = p.slice(0, p.indexOf('</w:p>') >= 0 ? p.indexOf('</w:p>') : p.length);
  // alignment
  const align = (body.match(/<w:jc w:val="(\w+)"/) || [])[1] || '';
  // runs
  let text = '';
  const runs = body.split(/<w:r[ >]/).slice(1);
  for (const r of runs) {
    const rpr = (r.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/) || [])[1] || '';
    const bold = /<w:b\/>|<w:b w:val="(?:true|1)"\/>|<w:b>/.test(rpr);
    let t = '';
    // text nodes and breaks
    const segs = r.match(/<w:t[^>]*>[\s\S]*?<\/w:t>|<w:br\/>|<w:tab\/>/g) || [];
    for (const s of segs) {
      if (s === '<w:br/>') t += '\n';
      else if (s === '<w:tab/>') t += '\t';
      else t += s.replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, '');
    }
    t = t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    if (t) text += bold ? `**${t}**` : t;
  }
  const tag = align ? `[${align}] ` : '';
  out.push(tag + text);
}
console.log(out.join('\n'));
