// Glyph — document export: print/PDF, styled Word (.doc) with cover + captions, Markdown
(function () {
  const { useState, useEffect } = React;
  const { PALETTES } = window.GlyphDraw;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // visible text of a block's HTML, trimmed — used to skip empty paragraphs on export
  function textOf(html) {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return (d.textContent || '').trim();
  }

  function svgToPng(svg, scale, opts) {
    scale = scale || 2;
    const transparent = !!(opts && opts.transparent);
    return new Promise((res, rej) => {
      const vb = svg.viewBox.baseVal;
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = vb.width * scale;
        c.height = vb.height * scale;
        const x = c.getContext('2d');
        if (!transparent) { x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height); } // default: white (e.g. Word)
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
  // child elements are emitted in OOXML schema order (Word rejects out-of-order rPr/pPr)
  function run(text, o) {
    o = o || {};
    const rpr = [];
    if (o.mono) rpr.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>');
    if (o.bold) rpr.push('<w:b/>');
    if (o.italic) rpr.push('<w:i/>');
    if (o.caps) rpr.push('<w:caps/>');
    if (o.strike) rpr.push('<w:strike/>');
    if (o.color) rpr.push(`<w:color w:val="${o.color}"/>`);
    if (o.ls != null) rpr.push(`<w:spacing w:val="${o.ls}"/>`);
    if (o.size) rpr.push(`<w:sz w:val="${o.size}"/>`);
    if (o.under) rpr.push('<w:u w:val="single"/>');
    if (o.shade) rpr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>`);
    const r = rpr.length ? `<w:rPr>${rpr.join('')}</w:rPr>` : '';
    return `<w:r>${r}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
  }
  function para(runs, o) {
    o = o || {};
    const ppr = [];
    if (o.leftBorder) ppr.push(`<w:pBdr><w:left w:val="single" w:sz="${o.leftBorder}" w:space="8" w:color="${o.leftBorderColor || 'auto'}"/></w:pBdr>`);
    else if (o.border) ppr.push(`<w:pBdr><w:bottom w:val="single" w:sz="${o.border}" w:space="6" w:color="${o.borderColor || 'auto'}"/></w:pBdr>`);
    if (o.shade) ppr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>`);
    const sp = [];
    if (o.before != null) sp.push(`w:before="${o.before}"`);
    if (o.after != null) sp.push(`w:after="${o.after}"`);
    if (o.line != null) { sp.push(`w:line="${o.line}"`); sp.push('w:lineRule="auto"'); }
    if (sp.length) ppr.push(`<w:spacing ${sp.join(' ')}/>`);
    if (o.ind) ppr.push(`<w:ind w:left="${o.ind.left || 0}"${o.ind.hanging ? ` w:hanging="${o.ind.hanging}"` : ''}/>`);
    if (o.align) ppr.push(`<w:jc w:val="${o.align}"/>`);
    const p = ppr.length ? `<w:pPr>${ppr.join('')}</w:pPr>` : '';
    return `<w:p>${p}${runs}</w:p>`;
  }

  // ---------- rich text → Word ----------
  // inline html fragment → runs, preserving bold / italic / underline / strike /
  // inline-code / highlight, and external hyperlinks (registered via ctx)
  function runsFromHtml(html, base, ctx) {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    const out = [];
    (function walk(node, st) {
      node.childNodes.forEach((ch) => {
        if (ch.nodeType === 3) {
          if (ch.textContent) out.push(run(ch.textContent, Object.assign({}, base, {
            bold: st.bold || base.bold, italic: st.italic, under: st.under, strike: st.strike, mono: st.code,
            shade: st.mark ? 'FCEFB4' : (st.code ? 'F1EFEA' : base.shade),
            color: st.link ? '2F5BD0' : (st.code ? '8A3B2F' : base.color),
          })));
        } else if (ch.nodeType === 1) {
          const tag = ch.tagName.toLowerCase();
          const ns = Object.assign({}, st);
          if (tag === 'b' || tag === 'strong') ns.bold = true;
          if (tag === 'i' || tag === 'em') ns.italic = true;
          if (tag === 'u') ns.under = true;
          if (tag === 's' || tag === 'strike' || tag === 'del') ns.strike = true;
          if (tag === 'code') ns.code = true;
          if (tag === 'mark' || /background/i.test(ch.getAttribute('style') || '')) ns.mark = true;
          if (tag === 'br') { out.push('<w:r><w:br/></w:r>'); return; }
          if (tag === 'a' && ctx && ch.getAttribute('href')) {
            const rId = ctx.addHyperlink(ch.getAttribute('href'));
            const at = out.length;
            ns.link = true; ns.under = true;
            walk(ch, ns);
            const inner = out.splice(at).join('');
            out.push(`<w:hyperlink r:id="${rId}">${inner}</w:hyperlink>`);
            return;
          }
          walk(ch, ns);
        }
      });
    })(div, {});
    if (!out.length) out.push(run('', base));
    return out.join('');
  }

  // <ul>/<ol> → one Word paragraph per <li> with a bullet/number + hanging indent
  function listParas(listEl, ordered, base, ctx, level) {
    let out = '', n = 1;
    [...listEl.children].forEach((li) => {
      if (li.tagName.toLowerCase() !== 'li') return;
      const nested = [];
      const inlineFrag = document.createElement('span');
      [...li.childNodes].forEach((ch) => {
        const t = ch.nodeType === 1 ? ch.tagName.toLowerCase() : '';
        if (t === 'ul' || t === 'ol') nested.push(ch); else inlineFrag.appendChild(ch.cloneNode(true));
      });
      const marker = ordered ? n + '.' : '•';
      const runs = run(marker + '  ', { color: base.color, size: base.size }) + runsFromHtml(inlineFrag.innerHTML, base, ctx);
      out += para(runs, { after: 40, line: base.line, ind: { left: 360 * (level + 1) + 360, hanging: 360 } });
      n++;
      nested.forEach((nl) => { out += listParas(nl, nl.tagName.toLowerCase() === 'ol', base, ctx, level + 1); });
    });
    return out;
  }
  function quotePara(el, base, ctx) {
    const runs = runsFromHtml(el.innerHTML, Object.assign({}, base, { italic: true, color: '6F6A61' }), ctx);
    return para(runs, { before: 120, after: 120, line: base.line, ind: { left: 360 }, leftBorder: 18, leftBorderColor: 'C9C4BB' });
  }
  function codeBlockPara(el) {
    const lines = (el.textContent || '').replace(/\n+$/, '').split('\n');
    const runs = lines.map((ln, i) => run(ln || ' ', { mono: true, size: 19, color: '33302B' }) + (i < lines.length - 1 ? '<w:r><w:br/></w:r>' : '')).join('');
    return para(runs, { before: 120, after: 120, ind: { left: 120 }, shade: 'F1EFEA' });
  }
  // styled Word table from rows of { cells:[runStr], head:bool }. Header rows get
  // a dark fill (text must already be white); zebra striping on body rows.
  function wTable(rows) {
    const cols = Math.max(1, ...rows.map((r) => r.cells.length));
    const cw = Math.floor(9360 / cols);
    const grid = `<w:tblGrid>${Array(cols).fill(`<w:gridCol w:w="${cw}"/>`).join('')}</w:tblGrid>`;
    const borders = `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="D8D3C8"/>`).join('')}</w:tblBorders>`;
    const tblPr = `<w:tblPr><w:tblW w:w="9360" w:type="dxa"/>${borders}<w:tblCellMar><w:top w:w="70" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar><w:tblLook w:firstRow="1"/></w:tblPr>`;
    let bodyN = 0;
    const trs = rows.map((row) => {
      const head = !!row.head;
      const fill = head ? '2B2925' : (bodyN++ % 2 ? 'F7F5F1' : null);
      const shd = fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '';
      const tcs = row.cells.map((cellRuns) => `<w:tc><w:tcPr><w:tcW w:w="${cw}" w:type="dxa"/>${shd}<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20"/></w:pPr>${cellRuns}</w:p></w:tc>`).join('');
      return `<w:tr>${head ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${tcs}</w:tr>`;
    }).join('');
    return `<w:tbl>${tblPr}${grid}${trs}</w:tbl>`;
  }
  // a content <table> (e.g. a pasted markdown table) → a styled Word table, reusing
  // the table-diagram look: dark header w/ white text, bold first column, borders
  function wTableFromHtml(tableEl, base, ctx, accent) {
    const trs = [...tableEl.querySelectorAll('tr')];
    if (!trs.length) return '';
    const rows = trs.map((tr) => {
      const cellEls = [...tr.children].filter((c) => /^(td|th)$/i.test(c.tagName));
      const head = tr.closest('thead') != null || (cellEls.length > 0 && cellEls.every((c) => c.tagName.toLowerCase() === 'th'));
      const cells = cellEls.map((cell, ci) => {
        const cbase = head
          ? Object.assign({}, base, { bold: true, color: 'FFFFFF', size: 19 })
          : Object.assign({}, base, { bold: ci === 0, color: ci === 0 ? '211F1C' : (base.color || '33302B'), size: 20 });
        return runsFromHtml(cell.innerHTML, cbase, ctx);
      });
      return { cells, head };
    }).filter((r) => r.cells.length);
    return rows.length ? wTable(rows) + '<w:p/>' : '';
  }
  // a whole text block → block-level Word XML (paragraphs, lists, quotes, code, tables)
  function emitTextBlock(b, ctx) {
    const base = b.tag === 'h1' ? { bold: true, size: 52, color: '211F1C', line: 240, after: 160 }
      : b.tag === 'h2' ? { bold: true, size: 29, color: '211F1C', before: 360, after: 120, line: 280 }
        : { size: 22, color: '33302B', after: 160, line: 300 };
    const div = document.createElement('div');
    div.innerHTML = b.html || '';
    let out = '';
    let inlineBuf = [];
    const flush = () => {
      if (!inlineBuf.length) return;
      const span = document.createElement('span');
      inlineBuf.forEach((n) => span.appendChild(n.cloneNode(true)));
      inlineBuf = [];
      if (!(span.textContent || '').trim()) return;
      out += para(runsFromHtml(span.innerHTML, base, ctx), { before: base.before, after: base.after, line: base.line });
    };
    [...div.childNodes].forEach((ch) => {
      const tag = ch.nodeType === 1 ? ch.tagName.toLowerCase() : '';
      if (tag === 'ul' || tag === 'ol') { flush(); out += listParas(ch, tag === 'ol', { size: base.size, color: base.color, line: base.line }, ctx, 0); }
      else if (tag === 'blockquote') { flush(); out += quotePara(ch, base, ctx); }
      else if (tag === 'pre') { flush(); out += codeBlockPara(ch); }
      else if (tag === 'table') { flush(); out += wTableFromHtml(ch, { size: base.size, color: base.color }, ctx); }
      else if (tag === 'div' || tag === 'p') { flush(); if ((ch.textContent || '').trim()) out += para(runsFromHtml(ch.innerHTML, base, ctx), { after: base.after, line: base.line }); }
      else inlineBuf.push(ch);
    });
    flush();
    return out;
  }
  function imgPara(rId, id, wEmu, hEmu, name) {
    return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="240" w:after="40"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${wEmu}" cy="${hEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="${esc(name)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${esc(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${wEmu}" cy="${hEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  }

  // ---------- rich text → Markdown ----------
  function inlineMd(node) {
    let s = '';
    node.childNodes.forEach((ch) => {
      if (ch.nodeType === 3) { s += ch.textContent; return; }
      if (ch.nodeType !== 1) return;
      const tag = ch.tagName.toLowerCase();
      const inner = inlineMd(ch);
      if (tag === 'b' || tag === 'strong') s += '**' + inner + '**';
      else if (tag === 'i' || tag === 'em') s += '*' + inner + '*';
      else if (tag === 's' || tag === 'strike' || tag === 'del') s += '~~' + inner + '~~';
      else if (tag === 'code') s += '`' + inner + '`';
      else if (tag === 'a') s += '[' + inner + '](' + (ch.getAttribute('href') || '') + ')';
      else if (tag === 'br') s += '  \n';
      else s += inner;
    });
    return s;
  }
  function blockMd(html) {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    let out = '';
    const emitList = (listEl, ordered, depth) => {
      let n = 1;
      [...listEl.children].forEach((li) => {
        if (li.tagName.toLowerCase() !== 'li') return;
        const nested = []; const frag = document.createElement('span');
        [...li.childNodes].forEach((ch) => { const t = ch.nodeType === 1 ? ch.tagName.toLowerCase() : ''; if (t === 'ul' || t === 'ol') nested.push(ch); else frag.appendChild(ch.cloneNode(true)); });
        out += '  '.repeat(depth) + (ordered ? n + '. ' : '- ') + inlineMd(frag).trim() + '\n';
        n++;
        nested.forEach((nl) => emitList(nl, nl.tagName.toLowerCase() === 'ol', depth + 1));
      });
    };
    const emitTable = (tableEl) => {
      const trs = [...tableEl.querySelectorAll('tr')];
      if (!trs.length) return;
      const rows = trs.map((tr) => [...tr.children].filter((c) => /^(td|th)$/i.test(c.tagName)).map((c) => inlineMd(c).trim().replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ')));
      const cols = Math.max(...rows.map((r) => r.length));
      const norm = rows.map((r) => { const c = r.slice(); while (c.length < cols) c.push(''); return c; });
      out += '\n| ' + norm[0].join(' | ') + ' |\n| ' + norm[0].map(() => '---').join(' | ') + ' |\n';
      norm.slice(1).forEach((r) => { out += '| ' + r.join(' | ') + ' |\n'; });
      out += '\n';
    };
    let buf = [];
    const flush = () => { if (!buf.length) return; const span = document.createElement('span'); buf.forEach((n) => span.appendChild(n.cloneNode(true))); buf = []; const t = inlineMd(span).trim(); if (t) out += t + '\n\n'; };
    [...div.childNodes].forEach((ch) => {
      const tag = ch.nodeType === 1 ? ch.tagName.toLowerCase() : '';
      if (tag === 'ul' || tag === 'ol') { flush(); emitList(ch, tag === 'ol', 0); out += '\n'; }
      else if (tag === 'table') { flush(); emitTable(ch); }
      else if (tag === 'blockquote') { flush(); out += '> ' + inlineMd(ch).trim().replace(/\n/g, '\n> ') + '\n\n'; }
      else if (tag === 'pre') { flush(); out += '```\n' + (ch.textContent || '').replace(/\n+$/, '') + '\n```\n\n'; }
      else if (tag === 'div' || tag === 'p') { flush(); const t = inlineMd(ch).trim(); if (t) out += t + '\n\n'; }
      else buf.push(ch);
    });
    flush();
    return out;
  }
  window.GlyphDocExport.inlineMd = inlineMd;
  window.GlyphDocExport.blockMd = blockMd;

  async function buildDocx(docTitle, blocks) {
    if (typeof JSZip === 'undefined') throw new Error('JSZip unavailable');
    const accent = cssColorToHex((PALETTES[0] && PALETTES[0].p) || '#3F4BC4');
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const hasH1 = blocks.some((b) => b.kind === 'text' && b.tag === 'h1');
    const media = []; // { name, u8 }
    const rels = [];  // { id, target, type }
    let body = '';
    let figN = 0, picId = 1, hlId = 1;
    const ctx = { addHyperlink(url) { const id = 'rIdH' + (hlId++); rels.push({ id, target: url, type: 'hyperlink' }); return id; } };

    // cover
    body += para(run('DOCUMENT', { bold: true, color: accent, size: 18, caps: true, ls: 40 }), { after: 60 });
    if (!hasH1) body += para(run(docTitle || 'Untitled document', { bold: true, size: 52, color: '211F1C' }), { after: 80, line: 240 });
    body += para(run(today + '   ·   Made with Markwise', { color: '6F6A61', size: 20 }), { after: 60 });
    body += para('', { border: 18, borderColor: accent, after: 280 });

    for (const b of blocks) {
      if (b.kind === 'text') {
        if (!textOf(b.html)) continue; // skip empty paragraphs — no blank lines in the export
        body += emitTextBlock(b, ctx);
      } else {
        // every visual (including table/rowtable diagrams) exports as its rendered figure
        const svg = document.querySelector(`figure[data-block-id="${b.id}"] .dg-wrap svg`);
        if (!svg) continue;
        try {
          const png = await svgToPng(svg, 2);
          const wEmu = CONTENT_W_EMU;
          const hEmu = Math.round(CONTENT_W_EMU * (png.h / png.w));
          const name = 'image' + picId + '.png';
          media.push({ name, u8: dataUrlToU8(png.url) });
          const rId = 'rId' + (100 + picId);
          rels.push({ id: rId, target: 'media/' + name, type: 'image' });
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
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${rels.map((r) => r.type === 'hyperlink'
      ? `<Relationship Id="${r.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(r.target)}" TargetMode="External"/>`
      : `<Relationship Id="${r.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${r.target}"/>`).join('')}</Relationships>`;

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
<p style="font-size:10pt;color:#6f6a61;margin:0">${today} &nbsp;·&nbsp; Made with Markwise</p>
<p style="border-bottom:2.25pt solid ${accent};margin:14pt 0 0;font-size:1pt">&nbsp;</p>
</div>`;
    for (const b of blocks) {
      if (b.kind === 'text') {
        if (!textOf(b.html)) continue; // skip empty paragraphs
        // a <div> (not <p>) so lists / blockquotes / code blocks / tables render natively in Word
        if (b.tag === 'h1') body += `<h1 style="margin:0 0 10pt">${b.html}</h1>`;
        else if (b.tag === 'h2') body += `<h2>${b.html}</h2>`;
        else body += `<div class="mwp">${b.html}</div>`;
      } else {
        const svg = document.querySelector(`figure[data-block-id="${b.id}"] .dg-wrap svg`);
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
  .mwp { font-size: 11pt; margin: 0 0 10pt; }
  ul, ol { font-size: 11pt; margin: 0 0 10pt; padding-left: 26pt; }
  li { margin: 0 0 4pt; }
  blockquote { margin: 8pt 0; padding: 2pt 0 2pt 12pt; border-left: 3pt solid #c9c4bb; color: #6f6a61; font-style: italic; }
  pre { font-family: Consolas, 'Courier New', monospace; font-size: 9.5pt; background: #f1efea; padding: 8pt 10pt; white-space: pre-wrap; margin: 8pt 0; }
  code { font-family: Consolas, 'Courier New', monospace; font-size: 9.5pt; background: #f1efea; color: #8a3b2f; padding: 0 2pt; }
  a { color: #2f5bd0; }
  .mwp table { border-collapse: collapse; width: 100%; font-size: 10.5pt; margin: 6pt 0 14pt; }
  .mwp table th { background: #2b2925; color: #fff; text-align: left; padding: 5pt 8pt; font-size: 9.5pt; border: 0.75pt solid #2b2925; }
  .mwp table td { border: 0.75pt solid #d8d3c8; padding: 5pt 8pt; vertical-align: top; }
  .mwp table td:first-child { font-weight: bold; color: #211f1c; }
  .mwp table tr:nth-child(even) td { background: #f7f5f1; }
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
          if (!textOf(b.html)) continue; // skip empty paragraphs
          if (b.tag === 'h1' || b.tag === 'h2') {
            const d = document.createElement('div'); d.innerHTML = b.html || '';
            md += (b.tag === 'h1' ? '# ' : '## ') + window.GlyphDocExport.inlineMd(d).trim() + '\n\n';
          } else {
            md += window.GlyphDocExport.blockMd(b.html); // lists, tables, quotes, code, inline
          }
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
