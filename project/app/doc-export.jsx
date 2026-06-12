// Glyph — document export: print/PDF, styled Word (.doc) with cover + captions, Markdown
(function () {
  const { useState, useEffect } = React;
  const { PALETTES } = window.GlyphDraw;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function svgToPng(svg, scale) {
    scale = scale || 2;
    return new Promise((res, rej) => {
      const vb = svg.viewBox.baseVal;
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = vb.width * scale;
        c.height = vb.height * scale;
        const x = c.getContext('2d');
        x.fillStyle = '#ffffff';
        x.fillRect(0, 0, c.width, c.height);
        x.drawImage(img, 0, 0, c.width, c.height);
        res({ url: c.toDataURL('image/png'), w: vb.width, h: vb.height });
      };
      img.onerror = rej;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(window.GlyphExport.svgString(svg));
    });
  }
  window.GlyphDocExport = window.GlyphDocExport || {};
  window.GlyphDocExport.svgToPng = svgToPng;

  // ---------- real .docx (Office Open XML) ----------
  const EMU_PER_PX = 9525;          // 96 dpi
  const CONTENT_W_EMU = 6 * 914400; // 6in usable image width

  function cssColorToHex(css) {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      const x = c.getContext('2d');
      x.fillStyle = '#000';
      x.fillStyle = css;
      x.fillRect(0, 0, 1, 1);
      const d = x.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    } catch (e) { return '3F4BC4'; }
  }
  function dataUrlToU8(durl) {
    const bin = atob(durl.split(',')[1]);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  function run(text, o) {
    o = o || {};
    const rpr = [];
    if (o.bold) rpr.push('<w:b/>');
    if (o.italic) rpr.push('<w:i/>');
    if (o.color) rpr.push(`<w:color w:val="${o.color}"/>`);
    if (o.size) rpr.push(`<w:sz w:val="${o.size}"/>`);
    if (o.caps) rpr.push('<w:caps/>');
    if (o.ls != null) rpr.push(`<w:spacing w:val="${o.ls}"/>`);
    if (o.shade) rpr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>`);
    const r = rpr.length ? `<w:rPr>${rpr.join('')}</w:rPr>` : '';
    return `<w:r>${r}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
  }
  function para(runs, o) {
    o = o || {};
    const ppr = [];
    const sp = [];
    if (o.before != null) sp.push(`w:before="${o.before}"`);
    if (o.after != null) sp.push(`w:after="${o.after}"`);
    if (o.line != null) { sp.push(`w:line="${o.line}"`); sp.push('w:lineRule="auto"'); }
    if (sp.length) ppr.push(`<w:spacing ${sp.join(' ')}/>`);
    if (o.align) ppr.push(`<w:jc w:val="${o.align}"/>`);
    if (o.border) ppr.push(`<w:pBdr><w:bottom w:val="single" w:sz="${o.border}" w:space="6" w:color="${o.borderColor || 'auto'}"/></w:pBdr>`);
    const p = ppr.length ? `<w:pPr>${ppr.join('')}</w:pPr>` : '';
    return `<w:p>${p}${runs}</w:p>`;
  }
  // convert an inline-html fragment into runs, preserving bold + highlight
  function htmlToRuns(html, base) {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    const out = [];
    (function walk(node, bold, mark) {
      node.childNodes.forEach((ch) => {
        if (ch.nodeType === 3) {
          if (ch.textContent) out.push(run(ch.textContent, Object.assign({}, base, { bold: bold || base.bold, shade: mark ? 'FCEFB4' : base.shade })));
        } else if (ch.nodeType === 1) {
          const tag = ch.tagName.toLowerCase();
          const isMark = tag === 'mark' || /background/i.test(ch.getAttribute('style') || '');
          walk(ch, bold || tag === 'b' || tag === 'strong', mark || isMark);
        }
      });
    })(div, false, false);
    if (!out.length) out.push(run('', base));
    return out.join('');
  }
  function imgPara(rId, id, wEmu, hEmu, name) {
    return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="240" w:after="40"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${wEmu}" cy="${hEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="${esc(name)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${esc(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${wEmu}" cy="${hEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  }

  async function buildDocx(docTitle, blocks) {
    if (typeof JSZip === 'undefined') throw new Error('JSZip unavailable');
    const accent = cssColorToHex((PALETTES[0] && PALETTES[0].p) || '#3F4BC4');
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const hasH1 = blocks.some((b) => b.kind === 'text' && b.tag === 'h1');
    const media = []; // { name, u8 }
    const rels = [];  // { id, target }
    let body = '';
    let figN = 0, picId = 1;

    // cover
    body += para(run('DOCUMENT', { bold: true, color: accent, size: 18, caps: true, ls: 40 }), { after: 60 });
    if (!hasH1) body += para(run(docTitle || 'Untitled document', { bold: true, size: 52, color: '211F1C' }), { after: 80, line: 240 });
    body += para(run(today + '   ·   Made with Glyph', { color: '6F6A61', size: 20 }), { after: 60 });
    body += para('', { border: 18, borderColor: accent, after: 280 });

    for (const b of blocks) {
      if (b.kind === 'text') {
        if (b.tag === 'h1') body += para(htmlToRuns(b.html, { bold: true, size: 52, color: '211F1C' }), { after: 160, line: 240 });
        else if (b.tag === 'h2') body += para(htmlToRuns(b.html, { bold: true, size: 29, color: '211F1C' }), { before: 360, after: 120 });
        else body += para(htmlToRuns(b.html, { size: 22, color: '33302B' }), { after: 160, line: 300 });
      } else {
        const svg = document.querySelector(`figure[data-block-id="${b.id}"] svg`);
        if (!svg) continue;
        try {
          const png = await svgToPng(svg, 2);
          const wEmu = CONTENT_W_EMU;
          const hEmu = Math.round(CONTENT_W_EMU * (png.h / png.w));
          const name = 'image' + picId + '.png';
          media.push({ name, u8: dataUrlToU8(png.url) });
          const rId = 'rId' + (100 + picId);
          rels.push({ id: rId, target: 'media/' + name });
          body += imgPara(rId, picId, wEmu, hEmu, name);
          figN++;
          body += para(run('Figure ' + figN, { bold: true, color: accent, size: 18 }) + run('  —  ' + (b.visual.spec.title || ''), { color: '6F6A61', size: 18 }), { align: 'center', after: 280 });
          picId++;
        } catch (e) { /* skip visual */ }
      }
    }

    const sect = `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}${sect}</w:body></w:document>`;

    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Helvetica Neue" w:hAnsi="Helvetica Neue" w:cs="Helvetica Neue"/><w:color w:val="211F1C"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;

    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

    const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${rels.map((r) => `<Relationship Id="${r.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${r.target}"/>`).join('')}</Relationships>`;

    const zip = new JSZip();
    zip.file('[Content_Types].xml', contentTypes);
    zip.folder('_rels').file('.rels', rootRels);
    const word = zip.folder('word');
    word.file('document.xml', documentXml);
    word.file('styles.xml', stylesXml);
    word.folder('_rels').file('document.xml.rels', docRels);
    const mediaFolder = word.folder('media');
    media.forEach((m) => mediaFolder.file(m.name, m.u8));
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  window.GlyphDocExport.buildDocx = buildDocx;

  async function buildDocHtml(docTitle, blocks) {
    const accent = (PALETTES[0] && PALETTES[0].p) || '#4f46c8';
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    let body = '';
    let figN = 0;
    const hasH1 = blocks.some((b) => b.kind === 'text' && b.tag === 'h1');
    // cover block
    body += `<div style="margin:0 0 36pt">
<p style="font-size:9pt;letter-spacing:2pt;text-transform:uppercase;color:${accent};font-weight:bold;margin:0 0 6pt">Document</p>
${hasH1 ? '' : `<h1 style="margin:0 0 10pt">${esc(docTitle)}</h1>`}
<p style="font-size:10pt;color:#6f6a61;margin:0">${today} &nbsp;·&nbsp; Made with Glyph</p>
<p style="border-bottom:2.25pt solid ${accent};margin:14pt 0 0;font-size:1pt">&nbsp;</p>
</div>`;
    for (const b of blocks) {
      if (b.kind === 'text') {
        if (b.tag === 'h1') body += `<h1 style="margin:0 0 10pt">${b.html}</h1>`;
        else if (b.tag === 'h2') body += `<h2>${b.html}</h2>`;
        else body += `<p>${b.html}</p>`;
      } else {
        const svg = document.querySelector(`figure[data-block-id="${b.id}"] svg`);
        if (svg) {
          try {
            const png = await svgToPng(svg, 2);
            figN++;
            body += `<div style="text-align:center;margin:16pt 0 4pt"><img src="${png.url}" width="600" style="max-width:100%"/></div>
<p style="text-align:center;font-size:9pt;color:#6f6a61;margin:0 0 14pt"><b style="color:${accent}">Figure ${figN}</b> &nbsp;—&nbsp; ${esc(b.visual.spec.title)}</p>`;
          } catch (e) { /* skip visual */ }
        }
      }
    }
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(docTitle)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  @page Section1 { size: 8.5in 11.0in; margin: 1.0in 1.0in 1.0in 1.0in; }
  div.Section1 { page: Section1; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #211f1c; line-height: 1.62; }
  h1 { font-size: 26pt; letter-spacing: -0.5pt; line-height: 1.15; color: #211f1c; }
  h2 { font-size: 14.5pt; margin: 24pt 0 8pt; color: #211f1c; border-bottom: 1pt solid #e4e1da; padding-bottom: 4pt; }
  p { font-size: 11pt; margin: 0 0 10pt; }
  mark, span[style*="background"] { background: #fcefb4; }
</style></head>
<body><div class="Section1">${body}</div></body></html>`;
  }

  function DocExportModal({ docTitle, blocks, onClose, toast }) {
    const [busy, setBusy] = useState(false);
    useEffect(() => {
      const k = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', k);
      return () => window.removeEventListener('keydown', k);
    }, [onClose]);

    const doPrint = () => {
      onClose();
      setTimeout(() => window.print(), 180);
    };
    const doDocx = async () => {
      setBusy('docx');
      try {
        const blob = await window.GlyphDocExport.buildDocx(docTitle, blocks);
        const name = (docTitle || 'document').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'document';
        window.GlyphExport.dl(name + '.docx', blob);
        toast('Word (.docx) downloading…');
      } catch (e) {
        toast('Export failed — try again');
      }
      setBusy(false);
    };
    const doWord = async () => {
      setBusy('doc');
      try {
        const html = await buildDocHtml(docTitle, blocks);
        const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
        const name = (docTitle || 'document').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'document';
        window.GlyphExport.dl(name + '.doc', blob);
        toast('Word (.doc) downloading…');
      } catch (e) {
        toast('Export failed — try again');
      }
      setBusy(false);
    };
    const doMarkdown = () => {
      let md = '';
      for (const b of blocks) {
        if (b.kind === 'text') {
          const div = document.createElement('div');
          div.innerHTML = b.html;
          const txt = div.textContent.trim();
          md += (b.tag === 'h1' ? '# ' : b.tag === 'h2' ? '## ' : '') + txt + '\n\n';
        } else {
          const s = b.visual.spec;
          md += `> **${s.title}** (${b.visual.type})\n`;
          s.items.forEach((it, i) => {
            md += `> ${i + 1}. ${it.label}${it.detail ? ' — ' + it.detail : ''}${it.value ? ' (' + it.value + ')' : ''}\n`;
          });
          md += '\n';
        }
      }
      const name = (docTitle || 'document').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'document';
      window.GlyphExport.dl(name + '.md', new Blob([md], { type: 'text/markdown' }));
      toast('Markdown downloading…');
    };

    return (
      <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="modal share-modal" data-screen-label="Export document">
          <div className="picker-head">
            <div>
              <div className="modal-title">Export document</div>
              <div className="modal-sub">“{docTitle}” — including all visuals.</div>
            </div>
            <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div className="docx-actions">
            <button className="docx-opt" onClick={doPrint}>
              <span className="docx-ico">⎙</span>
              <span><b>PDF</b><small>Opens the print dialog — choose “Save as PDF”.</small></span>
            </button>
            <button className="docx-opt" onClick={doDocx} disabled={!!busy}>
              <span className="docx-ico">W</span>
              <span><b>{busy === 'docx' ? 'Preparing…' : 'Word (.docx)'}</b><small>True Office format — editable text, headings &amp; embedded visuals.</small></span>
            </button>
            <button className="docx-opt" onClick={doWord} disabled={!!busy}>
              <span className="docx-ico">W</span>
              <span><b>{busy === 'doc' ? 'Preparing…' : 'Word (.doc)'}</b><small>Legacy format — broadest compatibility with older Word.</small></span>
            </button>
            <button className="docx-opt" onClick={doMarkdown}>
              <span className="docx-ico">↓</span>
              <span><b>Markdown (.md)</b><small>Plain text; visuals included as structured lists.</small></span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  window.GlyphDocExport.DocExportModal = DocExportModal;
})();
