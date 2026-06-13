// Glyph — presentation mode: slide builder from document, 50 themes, present view, PPTX export
(function () {
  const { useState, useEffect, useMemo, useRef } = React;
  const { PALETTES } = window.GlyphDraw;

  const LOOKS = [
    { id: 'minimal', name: 'Minimal' },
    { id: 'editorial', name: 'Editorial' },
    { id: 'bold', name: 'Bold' },
    { id: 'dark', name: 'Dark' },
    { id: 'soft', name: 'Soft' },
  ];
  const THEMES = [];
  PALETTES.forEach((p, pi) => LOOKS.forEach((l) => THEMES.push({ id: p.name.toLowerCase() + '-' + l.id, name: p.name + ' ' + l.name, pal: pi, look: l.id })));

  const hexCache = {};
  function toHex(col) {
    if (!col) return '000000';
    if (hexCache[col]) return hexCache[col];
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const x = c.getContext('2d');
    x.fillStyle = col;
    x.fillRect(0, 0, 1, 1);
    const d = x.getImageData(0, 0, 1, 1).data;
    const h = [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    hexCache[col] = h;
    return h;
  }

  function themeVars(t) {
    const pal = PALETTES[t.pal];
    const v = {
      accent: pal.p, deep: pal.deep, soft: pal.soft, mid: pal.mid,
      bg: '#ffffff', fg: '#211f1c', sub: '#6f6a61',
      headFont: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      radius: 16, card: false, titleBg: null, look: t.look,
    };
    if (t.look === 'editorial') { v.bg = '#faf7f0'; v.headFont = "Georgia, 'Times New Roman', serif"; }
    if (t.look === 'bold') { v.radius = 0; v.titleBg = pal.p; }
    if (t.look === 'dark') { v.bg = '#1b1916'; v.fg = '#f2f0ec'; v.sub = '#b3aea4'; v.card = true; }
    if (t.look === 'soft') { v.bg = pal.soft; v.card = true; v.radius = 22; }
    return v;
  }

  function plainText(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent.replace(/\s+/g, ' ').trim();
  }

  function buildSlides(docTitle, blocks) {
    const slides = [];
    let cur = null;
    blocks.forEach((b) => {
      if (b.kind === 'text' && b.tag === 'h1') {
        slides.push({ kind: 'title', title: plainText(b.html), sub: null });
        cur = null;
      } else if (b.kind === 'text' && b.tag === 'h2') {
        cur = { kind: 'content', title: plainText(b.html), paras: [], visual: null };
        slides.push(cur);
      } else if (b.kind === 'text') {
        const txt = plainText(b.html);
        if (!txt) return;
        if (!cur) {
          if (slides.length && slides[slides.length - 1].kind === 'title' && !slides[slides.length - 1].sub) {
            slides[slides.length - 1].sub = txt;
            return;
          }
          cur = { kind: 'content', title: 'Overview', paras: [], visual: null };
          slides.push(cur);
        }
        cur.paras.push(txt);
      } else if (b.kind === 'visual') {
        if (cur && !cur.visual) {
          cur.visual = b.visual;
        } else {
          cur = { kind: 'content', title: b.visual.spec.title, paras: [], visual: b.visual };
          slides.push(cur);
        }
      }
    });
    // drop blank slides — a heading with empty text (an h1/h2 with no words) would
    // otherwise become a titleless, contentless, visual-less slide
    const blank = (s) => !String(s.title || '').trim() && !(s.paras || []).some((p) => String(p).trim()) && !s.visual && !String(s.sub || '').trim();
    for (let i = slides.length - 1; i >= 0; i--) if (blank(slides[i])) slides.splice(i, 1);
    if (!slides.length || slides[0].kind !== 'title') {
      slides.unshift({ kind: 'title', title: docTitle, sub: null });
    }
    // fixed frame: intro → agenda → content… → thank you
    // (the agenda's entries are filled live from the content slide titles)
    const sections = slides.filter((s) => s.kind === 'content');
    if (sections.length > 1) slides.splice(1, 0, { kind: 'agenda', title: 'Agenda', paras: [], visual: null });
    slides.push({ kind: 'thanks', title: 'Thank you', sub: docTitle, visual: null });
    return slides;
  }

  // ---------- single slide, rendered at 1280×720 then scaled ----------
  // click-to-edit text used on the deck stage. Uncontrolled (sets text via ref) so
  // typing isn't fought by React; commits on blur / Enter (single-line).
  function EditableText({ value, onCommit, style, className, tag, multiline }) {
    const ref = useRef(null);
    useEffect(() => { if (ref.current && ref.current.textContent !== (value || '')) ref.current.textContent = value || ''; }, [value]);
    return React.createElement(tag || 'div', {
      ref, className: 'deck-edit ' + (className || ''), style,
      contentEditable: true, suppressContentEditableWarning: true, spellCheck: false,
      'data-ph': 'Type…',
      onBlur: (e) => { const t = e.currentTarget.textContent; if (t !== (value || '')) onCommit(t); },
      onKeyDown: (e) => {
        e.stopPropagation(); // don't let arrows/space drive the deck
        if (!multiline && e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Escape') { e.currentTarget.textContent = value || ''; e.currentTarget.blur(); }
      },
      onClick: (e) => e.stopPropagation(),
    });
  }

  // 8-handle resize/move frame drawn over a slide's visual on the deck stage.
  // handles are counter-scaled by 1/fw,1/fh so they stay ~constant size as the visual grows.
  const VIS_HANDLES = [
    ['nw', 0, 0, 'nwse-resize'], ['n', '50%', 0, 'ns-resize'], ['ne', '100%', 0, 'nesw-resize'],
    ['e', '100%', '50%', 'ew-resize'], ['se', '100%', '100%', 'nwse-resize'], ['s', '50%', '100%', 'ns-resize'],
    ['sw', 0, '100%', 'nesw-resize'], ['w', 0, '50%', 'ew-resize'],
  ];
  function VisFrame({ fw, fh, accent, onStart }) {
    return (
      <div className="vis-frame" style={{ borderColor: accent }}>
        <span className="vis-move" style={{ background: accent }} title="Drag to move the visual" onPointerDown={(e) => { e.stopPropagation(); onStart(e, 'move'); }}>✥ move</span>
        {VIS_HANDLES.map(([pos, l, t, cur]) => (
          <i key={pos} className="vrs" style={{ left: l, top: t, cursor: cur, background: accent, transform: `translate(-50%,-50%) scale(${(1 / fw).toFixed(3)},${(1 / fh).toFixed(3)})` }} onPointerDown={(e) => { e.stopPropagation(); onStart(e, pos); }} />
        ))}
      </div>
    );
  }

  // the agenda rendered as a designed numbered visual (big accent numerals, 1–2 columns),
  // with each line editable on the deck stage
  function renderAgenda(slide, paras, v, accent, editable, onEdit) {
    const items = editable ? (slide.paras || []) : paras;
    const clean = (p) => String(p).replace(/^\s*\d+[.)]\s*/, '').trim();
    const two = items.length > 5;
    const col = (list, off) => (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: two ? 14 : 20, justifyContent: 'center', minWidth: 0 }}>
        {list.map((p, k) => {
          const i = off + k;
          const tStyle = { fontSize: two ? 22 : 27, fontWeight: 600, lineHeight: 1.3, color: v.fg, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", flex: 1 };
          return (
            <div key={i} className="ag-item" style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
              <span style={{ fontSize: two ? 34 : 44, fontWeight: 800, color: accent, lineHeight: 1, minWidth: two ? 52 : 68, fontFamily: v.headFont, opacity: 0.92 }}>{String(i + 1).padStart(2, '0')}</span>
              {editable
                ? <EditableText value={clean(p)} style={tStyle} onCommit={(t) => { const np = (slide.paras || []).slice(); if (t.trim()) np[i] = t; else np.splice(i, 1); onEdit({ paras: np }); }} />
                : <span style={tStyle}>{clean(p)}</span>}
            </div>
          );
        })}
        {editable && off === 0 ? <button className="deck-add-bullet" onClick={(e) => { e.stopPropagation(); onEdit({ paras: [...(slide.paras || []), 'New item'] }); }}>+ item</button> : null}
      </div>
    );
    if (!two) return <div style={{ display: 'flex', marginTop: 30, height: 470 }}>{col(items, 0)}</div>;
    const half = Math.ceil(items.length / 2);
    return (
      <div style={{ display: 'flex', gap: 56, marginTop: 22, height: 480 }}>
        {col(items.slice(0, half), 0)}
        <div style={{ width: 1, background: 'rgba(0,0,0,0.08)' }}></div>
        {col(items.slice(half), half)}
      </div>
    );
  }

  function Slide({ slide, theme, w, flip, pageNo, total, docTitle, layout, editable, onEdit, visEdit, onVisEdit, onVisPatch }) {
    const v = themeVars(theme);
    const s = w / 1280;
    const isTitle = slide.kind === 'title' || slide.kind === 'thanks';
    const isAgenda = slide.kind === 'agenda';
    const L = layout && window.GlyphDeckLayouts ? window.GlyphDeckLayouts.byId[layout] : null;
    const inv = !!(L && L.conf.invert);
    const bg = isTitle && v.titleBg ? v.titleBg : inv ? v.accent : v.bg;
    const fg = isTitle && v.titleBg ? '#ffffff' : v.fg;
    const sub = isTitle && v.titleBg ? 'rgba(255,255,255,0.82)' : v.sub;
    const accent = isTitle && v.titleBg ? '#ffffff' : v.accent;
    const paras = (slide.paras || []).filter((p) => String(p).trim()).slice(0, isAgenda ? 12 : 6);
    const mode = !slide.visual ? 'text' : (slide._mode || 'split');
    const vis = { fw: (slide._vis && slide._vis.fw) || 1, fh: (slide._vis && slide._vis.fh) || 1, dx: (slide._vis && slide._vis.dx) || 0, dy: (slide._vis && slide._vis.dy) || 0 };
    const visMoved = vis.fw !== 1 || vis.fh !== 1 || vis.dx || vis.dy;
    const cols = [];
    if (mode !== 'visual') cols.push('text');
    if (slide.visual && mode !== 'text') cols.push('vis');
    if (flip && cols.length === 2) cols.reverse();
    const split = cols.length === 2;
    return (
      <div className="slide-scaler" style={{ width: w, height: (w * 720) / 1280 }}>
        <div className="slide" style={{ width: 1280, height: 720, transform: `scale(${s})`, background: bg, color: fg, fontFamily: v.headFont }}>
          {!L && (v.look === 'minimal' || v.look === 'dark') ? <div style={{ position: 'absolute', left: 90, top: isTitle ? 200 : 56, width: 56, height: 7, background: accent, borderRadius: 4 }}></div> : null}
          {!L && v.look === 'soft' ? <div style={{ position: 'absolute', right: -90, top: -90, width: 280, height: 280, borderRadius: '50%', background: v.accent, opacity: 0.12 }}></div> : null}
          {L ? (
            <window.GlyphDeckLayouts.LayoutSlide slide={slide} v={v} conf={L.conf} flip={flip} pageNo={pageNo} total={total} docTitle={docTitle}
              editable={editable} onEdit={onEdit} visEdit={visEdit} onVisEdit={onVisEdit} onVisPatch={onVisPatch} VisFrame={VisFrame} vis={vis} visMoved={visMoved} />
          ) : isTitle ? (
            <div style={{ position: 'absolute', left: 90, right: 110, top: 236 }}>
              {(() => {
                const tStyle = { fontSize: 66, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-1px', borderLeft: v.look === 'bold' ? '14px solid rgba(255,255,255,0.6)' : 'none', paddingLeft: v.look === 'bold' ? 28 : 0 };
                return editable ? <EditableText value={slide.title} onCommit={(t) => onEdit({ title: t })} style={tStyle} /> : <div style={tStyle}>{slide.title}</div>;
              })()}
              {v.look === 'editorial' ? <div style={{ width: 110, height: 2, background: accent, margin: '28px 0' }}></div> : null}
              {(() => {
                const sStyle = { fontSize: 24, lineHeight: 1.5, color: sub, marginTop: 26, maxWidth: 880, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" };
                if (editable && slide.kind === 'title') return <EditableText multiline value={slide.sub || ''} onCommit={(t) => onEdit({ sub: t })} style={sStyle} />;
                return slide.sub ? <div style={sStyle}>{slide.sub.length > 300 ? slide.sub.slice(0, 297) + '…' : slide.sub}</div> : null;
              })()}
            </div>
          ) : (
            <div style={{ position: 'absolute', inset: '52px 80px 56px' }}>
              {(() => {
                const tStyle = { fontSize: 40, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 8, paddingLeft: v.look === 'bold' ? 24 : 0, borderLeft: v.look === 'bold' ? `12px solid ${v.accent}` : 'none', marginTop: v.look === 'minimal' || v.look === 'dark' ? 22 : 0 };
                return editable ? <EditableText value={slide.title} onCommit={(t) => onEdit({ title: t })} style={tStyle} /> : <div style={tStyle}>{slide.title}</div>;
              })()}
              {v.look === 'editorial' ? <div style={{ width: 88, height: 2, background: accent, margin: '10px 0 4px' }}></div> : null}
              {isAgenda ? renderAgenda(slide, paras, v, accent, editable, onEdit) : (
              <div style={{ display: 'flex', gap: 44, marginTop: 26, height: 500 }}>
                {cols.map((kind) =>
                  kind === 'text' ? (
                    <div key="text" style={{ flex: split ? '0 0 38%' : 1, display: 'flex', flexDirection: 'column', gap: 22, justifyContent: 'center' }}>
                      {(editable ? (slide.paras || []) : paras).map((p, i) => {
                        const tStyle = { fontSize: slide.visual && split ? 19 : 23, lineHeight: 1.55, color: v.fg === '#211f1c' ? '#3a362f' : v.fg, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", flex: 1 };
                        return (
                          <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                            <span style={{ flex: '0 0 10px', width: 10, height: 10, borderRadius: v.look === 'bold' ? 0 : '50%', background: v.accent, marginTop: 11 }}></span>
                            {editable
                              ? <EditableText value={p} style={tStyle} onCommit={(t) => { const np = (slide.paras || []).slice(); if (t.trim()) np[i] = t; else np.splice(i, 1); onEdit({ paras: np }); }} />
                              : <span style={tStyle}>{p.length > 300 ? p.slice(0, 297) + '…' : p}</span>}
                          </div>
                        );
                      })}
                      {editable ? (
                        <button className="deck-add-bullet" onClick={(e) => { e.stopPropagation(); onEdit({ paras: [...(slide.paras || []), 'New point'] }); }}>+ bullet</button>
                      ) : null}
                    </div>
                  ) : (
                    <div key="vis" className="slide-vis" style={{ flex: split ? 1 : 'none', width: split ? undefined : '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                      <div className="slide-vis-box" style={{ position: 'relative', width: split ? '100%' : mode === 'visual' ? '88%' : '76%', transform: visMoved ? `translate(${vis.dx}px,${vis.dy}px) scale(${vis.fw},${vis.fh})` : undefined, transformOrigin: 'center', background: v.card ? '#ffffff' : 'transparent', borderRadius: v.radius, padding: v.card ? '18px 22px' : 0, boxShadow: v.card ? '0 10px 40px -12px rgba(20,18,14,0.25)' : 'none', maxHeight: (visEdit || visMoved) ? undefined : 490, overflow: (visEdit || visMoved) ? 'visible' : 'hidden' }}>
                        <window.Diagram visual={slide.visual} editable={visEdit} onPatch={visEdit ? onVisPatch : undefined} />
                        {visEdit ? <VisFrame fw={vis.fw} fh={vis.fh} accent={accent} onStart={onVisEdit} /> : null}
                      </div>
                    </div>
                  )
                )}
              </div>
              )}
              {pageNo ? (
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: -34, display: 'flex', justifyContent: 'space-between', fontSize: 14, color: sub, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
                  <span>{docTitle}</span>
                  <span>{pageNo}{total ? ' / ' + total : ''}</span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- pptx export ----------
  let pptxLoading = null;
  function loadPptx() {
    if (window.PptxGenJS) return Promise.resolve();
    if (pptxLoading) return pptxLoading;
    pptxLoading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
      s.onload = () => res();
      s.onerror = () => { pptxLoading = null; rej(new Error('load failed')); };
      document.head.appendChild(s);
    });
    return pptxLoading;
  }

  async function exportPptx(slides, theme, docTitle, railEl) {
    await loadPptx();
    const v = themeVars(theme);
    const P = new window.PptxGenJS();
    P.layout = 'LAYOUT_16x9';
    const W = 10, H = 5.625;
    let pageNo = 0;
    for (let i = 0; i < slides.length; i++) {
      const sl = slides[i];
      const s = P.addSlide();
      const isTitle = sl.kind === 'title' || sl.kind === 'thanks';
      const bg = isTitle && v.titleBg ? v.titleBg : v.bg;
      const fg = isTitle && v.titleBg ? 'FFFFFF' : toHex(v.fg);
      s.background = { color: toHex(bg) };
      const serif = v.look === 'editorial';
      if (isTitle) {
        s.addText(sl.title, { x: 0.7, y: 1.7, w: 8.6, h: 1.5, fontSize: 38, bold: true, color: fg, fontFace: serif ? 'Georgia' : 'Helvetica' });
        if (sl.sub) s.addText(sl.sub.length > 260 ? sl.sub.slice(0, 257) + '…' : sl.sub, { x: 0.7, y: 3.2, w: 8, h: 1.4, fontSize: 15, color: isTitle && v.titleBg ? 'E8E5DF' : toHex(v.sub), fontFace: 'Helvetica' });
        if (!v.titleBg) s.addShape('rect', { x: 0.7, y: 1.35, w: 0.55, h: 0.07, fill: { color: toHex(v.accent) } });
        if (v.look === 'bold') s.addShape('rect', { x: 0.7, y: 1.62, w: 0.12, h: 1.55, fill: { color: 'FFFFFF' } });
      } else {
        pageNo++;
        if (v.look === 'bold') s.addShape('rect', { x: 0, y: 0, w: 0.16, h: H, fill: { color: toHex(v.accent) } });
        if (v.look === 'minimal' || v.look === 'dark') s.addShape('rect', { x: 0.6, y: 0.32, w: 0.45, h: 0.06, fill: { color: toHex(v.accent) } });
        const titleY = v.look === 'minimal' || v.look === 'dark' ? 0.48 : 0.35;
        s.addText(sl.title, { x: 0.6, y: titleY, w: 8.8, h: 0.7, fontSize: 24, bold: true, color: fg, fontFace: serif ? 'Georgia' : 'Helvetica' });
        if (serif) s.addShape('rect', { x: 0.62, y: titleY + 0.78, w: 0.8, h: 0.025, fill: { color: toHex(v.accent) } });
        const mode = !sl.visual ? 'text' : (sl._mode || 'split');
        const paras = (sl.paras || []).filter((p) => String(p).trim()).slice(0, sl.kind === 'agenda' ? 10 : 6);
        const showText = mode !== 'visual';
        const hasVis = !!sl.visual && mode !== 'text';
        const flip = !!sl._flip && hasVis && showText && paras.length > 0;
        const textX = flip ? 5.8 : 0.6;
        if (showText && paras.length) {
          s.addText(paras.map((p) => ({ text: p.length > 280 ? p.slice(0, 277) + '…' : p, options: { bullet: { code: '2022' }, color: fg, breakLine: true } })), {
            x: textX, y: 1.3, w: hasVis ? 3.7 : 8.8, h: 3.7, fontSize: hasVis ? 11 : 14, color: fg, fontFace: 'Helvetica', valign: 'top', paraSpaceAfter: 8,
          });
        }
        // visual-only slides keep their bullets as speaker notes so nothing is lost on export
        if (mode === 'visual' && paras.length) { try { s.addNotes(paras.join('\n')); } catch (e2) {} }
        if (hasVis && railEl) {
          const svg = railEl.querySelector(`[data-slide-idx="${sl._si}"] svg`);
          if (svg) {
            const png = await window.GlyphDocExport.svgToPng(svg, 2);
            const aspect = png.h / png.w;
            const visOnly = !showText || !paras.length;
            let iw = visOnly ? 7.2 : 5.1;
            let ih = iw * aspect;
            const maxH = visOnly ? 4.0 : 3.7;
            if (ih > maxH) { ih = maxH; iw = ih / aspect; }
            const vo = sl._vis;
            if (vo) { iw *= vo.fw || 1; ih *= vo.fh || 1; }
            let ix = visOnly ? (W - iw) / 2 : (flip ? 0.55 + (5.1 - iw) / 2 : 4.55 + (5.1 - iw) / 2);
            let iy = 1.3 + (maxH - ih) / 2;
            if (vo) { ix += (vo.dx || 0) / 1280 * W; iy += (vo.dy || 0) / 720 * H; }
            s.addImage({ data: png.url, x: ix, y: iy, w: iw, h: ih });
          }
        }
        s.addText(docTitle, { x: 0.6, y: H - 0.42, w: 5, h: 0.3, fontSize: 9, color: toHex(v.sub), fontFace: 'Helvetica' });
        s.addText(String(pageNo), { x: W - 1.1, y: H - 0.42, w: 0.5, h: 0.3, fontSize: 9, align: 'right', color: toHex(v.sub), fontFace: 'Helvetica' });
      }
    }
    const name = (docTitle || 'deck').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'deck';
    await P.writeFile({ fileName: name + '.pptx' });
  }

  // ---------- AI condensing of slide text into bullets ----------
  const condenseCache = {}; // keyed by slide content — survives reopen within session
  const slideKey = (sl) => (sl.title || '') + '|' + (sl.paras || []).join('¶') + '|' + (sl.sub || '');

  // ---------- per-document deck cache ----------
  // The built deck (theme, order, edits, per-slide overrides, AI-condensed bullets) is saved
  // per document so reopening Present doesn't regenerate everything. Only slides whose source
  // content changed are re-condensed; an unchanged document jumps straight to the built deck.
  const SNAP_VER = 2;
  function loadSnap(docId) {
    if (!docId) return null;
    try { const s = JSON.parse(localStorage.getItem('glyph-deck:' + docId) || 'null'); return s && s.v === SNAP_VER ? s : null; } catch (_) { return null; }
  }
  // signature of the slides' *source* content — when this is unchanged and the deck was already
  // built, reopening Present restores the saved deck instead of regenerating it
  const sigOf = (bs) => { const s = bs.map(slideKey).join('§'); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

  // ---------- deck overlay ----------
  function DeckOverlay({ docTitle, blocks, onClose, toast, docId }) {
    const baseSlides = useMemo(() => buildSlides(docTitle, blocks), [docTitle, blocks]);
    // restore the saved deck for this document (once per mount)
    const storeKey = docId ? 'glyph-deck:' + docId : null;
    const snapRef = useRef(null);
    const xCounter = useRef(1);
    if (snapRef.current === null) {
      const s = loadSnap(docId);
      snapRef.current = s || false;
      if (s && s.extras && s.extras.length) {
        const mx = Math.max(0, ...s.extras.map((e) => parseInt(String(e.id).replace(/\D/g, ''), 10) || 0));
        xCounter.current = mx + 1;
      }
    }
    const snap0 = snapRef.current || null;
    const curSig = sigOf(baseSlides);
    // the deck was already built for this exact source content → restore it, don't regenerate
    const restoredUnchanged = !!(snap0 && snap0.built && snap0.sig === curSig);
    const restoredBuiltRef = useRef(!!(snap0 && snap0.built));
    const builtRef = useRef(restoredBuiltRef.current);
    const skipAutoGenRef = useRef(restoredUnchanged);
    const dirtyRef = useRef(false); // user changed something this session (guards cross-device overwrite)
    const forceGenRef = useRef(false); // "Regenerate" rebuilds every text slide, not just long ones

    const [order, setOrder] = useState(() => (snap0 && snap0.order) || null);
    const [ov, setOv] = useState(() => (snap0 && snap0.ov) || {});
    const [themeId, setThemeId] = useState(() => (snap0 && snap0.themeId) || localStorage.getItem('glyph-deck-theme') || 'indigo-minimal');
    const [idx, setIdx] = useState(() => {
      const n = parseInt(localStorage.getItem('glyph-deck-idx') || '0', 10);
      return isNaN(n) ? 0 : Math.max(0, n);
    });
    const [present, setPresent] = useState(false);
    const [aiOn, setAiOn] = useState(() => (snap0 ? snap0.aiOn !== false : localStorage.getItem('glyph-deck-ai') !== '0'));
    const [aiBusy, setAiBusy] = useState(false);
    const [distilled, setDistilled] = useState(() => (snap0 && snap0.distilled) || {});
    // build flow: generating → per-slide review (editable, remarks, regenerate) → deck.
    // a previously-built, unchanged deck skips straight to 'deck'.
    // a saved, unchanged deck opens to a quick resume prompt (continue vs review & regenerate)
    const [phase, setPhase] = useState(() => (restoredUnchanged ? 'resume' : 'gen'));
    // when this browser has no local deck, wait for the server lookup before auto-generating, so a
    // deck saved on another device restores instead of being regenerated
    const [serverChecked, setServerChecked] = useState(() => !!snap0 || !docId || !(window.MarkwiseAPI && window.MarkwiseAPI.getDeck));
    const [genNonce, setGenNonce] = useState(0); // bumped by "Regenerate" to re-run the whole generation
    const [revIdx, setRevIdx] = useState(0);
    const [edited, setEdited] = useState(() => (snap0 && snap0.edited) || {});   // oi → {title, paras, sub} user overrides
    const [remarks, setRemarks] = useState({}); // oi → free-text remarks fed to regeneration
    const [regenOi, setRegenOi] = useState(null);
    const [pickOpen, setPickOpen] = useState(false);
    const [layoutOpen, setLayoutOpen] = useState(false);
    const [layCat, setLayCat] = useState('essentials');
    const [applyAll, setApplyAll] = useState(false);
    const [busy, setBusy] = useState(false);
    const [printing, setPrinting] = useState(false);
    const [dragIdx, setDragIdx] = useState(null);
    const [overIdx, setOverIdx] = useState(null);
    const [themeForSlide, setThemeForSlide] = useState(false); // theme picker scope: this slide only
    const [stageW, setStageW] = useState(820);
    const stageRef = useRef(null);
    const railRef = useRef(null);
    const theme = THEMES.find((t) => t.id === themeId) || THEMES[0];

    // user-added slides (not from the document). Refs are strings ('x1'); base
    // slides are numeric indices. order holds refs of either kind.
    const [extras, setExtras] = useState(() => (snap0 && snap0.extras) || []);
    const srcOf = (ref) => (typeof ref === 'number' ? baseSlides[ref] : extras.find((e) => e.id === ref));
    const defaultRefs = baseSlides.map((_, i) => i).concat(extras.map((e) => e.id));
    const ordered = order || defaultRefs;
    // the agenda lists the content slides in their current order, with title edits applied
    const agendaParas = ordered
      .map((ref) => ({ ref, b: srcOf(ref) }))
      .filter((x) => x.b && x.b.kind === 'content')
      .map((x, n) => (n + 1) + '.  ' + ((edited[x.ref] || {}).title != null ? edited[x.ref].title : x.b.title));
    const slides = ordered.map((ref, si) => {
      const base = srcOf(ref) || { kind: 'content', title: '', paras: [], sub: null, visual: null };
      const d = aiOn && distilled[ref] && distilled[ref].key === slideKey(base) ? distilled[ref] : {};
      const e = edited[ref] || {};
      const o = ov[ref] || {};
      const paras = base.kind === 'agenda' ? (e.paras || agendaParas) : (e.paras || d.paras || base.paras);
      const visual = o.visual || base.visual;
      // effective content mode: explicit override, else auto (thin text → visual-only, else split)
      let mode = 'split';
      if (base.kind === 'content' && visual) {
        if (o.mode) mode = o.mode;
        else {
          const liveP = (paras || []).filter((p) => String(p).trim());
          mode = (!liveP.length || (liveP.length <= 2 && liveP.join(' ').length < 170)) ? 'visual' : 'split';
        }
      }
      return {
        ...base,
        visual,
        title: e.title != null ? e.title : base.title,
        paras,
        sub: e.sub != null ? e.sub : (d.sub || base.sub),
        _oi: ref, _si: si, _skip: !!o.skip, _flip: !!o.flip, _layout: o.layout || null, _theme: o.theme || null,
        _mode: mode, _vis: o.vis || null,
      };
    });
    const themeOf = (sl) => (sl._theme && THEMES.find((t) => t.id === sl._theme)) || theme;
    const live = slides.filter((s) => !s._skip);
    const pageOf = {};
    live.forEach((s, k) => { pageOf[s._si] = k + 1; });
    const cur = Math.min(idx, slides.length - 1);
    const curSlide = slides[cur];

    // reset the deck only when the document's slide count changes *while the deck is open*
    // (not on mount — that would wipe the restored cache)
    const mountedRef = useRef(false);
    useEffect(() => {
      if (!mountedRef.current) { mountedRef.current = true; return; }
      setOrder(null); setOv({}); setDistilled({}); setEdited({}); setRemarks({}); setRevIdx(0); setExtras([]);
    }, [baseSlides.length]);
    useEffect(() => { localStorage.setItem('glyph-deck-theme', themeId); }, [themeId]);
    useEffect(() => { localStorage.setItem('glyph-deck-ai', aiOn ? '1' : '0'); }, [aiOn]);
    // remember that this deck was built so future opens can skip the generate/review flow
    useEffect(() => { if (phase === 'deck') builtRef.current = true; }, [phase]);

    // restore the deck from the server (durable, cross-device). localStorage already gave an instant
    // paint above; only adopt the server copy when this browser has nothing local for the doc.
    const applySnap = (s) => {
      if (!s || s.v !== SNAP_VER) return;
      if (s.themeId) setThemeId(s.themeId);
      setAiOn(s.aiOn !== false);
      setOrder(s.order || null);
      setExtras(s.extras || []);
      // keep new-slide ids ('x<n>') from colliding with restored extras (mirrors the mount bump)
      if (s.extras && s.extras.length) xCounter.current = Math.max(xCounter.current, 1 + Math.max(0, ...s.extras.map((e) => parseInt(String(e.id).replace(/\D/g, ''), 10) || 0)));
      setOv(s.ov || {});
      setEdited(s.edited || {});
      setDistilled(s.distilled || {});
      if (s.built && s.sig === curSig) { restoredBuiltRef.current = true; builtRef.current = true; skipAutoGenRef.current = true; setPhase((p) => (p === 'gen' ? 'resume' : p)); }
    };
    useEffect(() => {
      if (!docId || !(window.MarkwiseAPI && window.MarkwiseAPI.getDeck)) return;
      let dead = false;
      window.MarkwiseAPI.getDeck(docId).then((r) => {
        if (dead) return;
        const srv = r && r.deck;
        const localTs = snap0 ? (snap0.ts || 0) : -1;
        if (srv && srv.v === SNAP_VER && (!snap0 || (!dirtyRef.current && (srv.ts || 0) > localTs))) applySnap(srv); // adopt newer/only server copy
      }).catch(() => {}).finally(() => { if (!dead) setServerChecked(true); });
      return () => { dead = true; };
    }, [docId]); // eslint-disable-line

    // persist the whole built deck per document — localStorage (instant) + DB (durable, debounced)
    const saveTimer = useRef(null);
    const pendingSnapRef = useRef(null);
    useEffect(() => {
      const built = builtRef.current || phase === 'deck';
      const snap = { v: SNAP_VER, ts: Date.now(), sig: curSig, themeId, aiOn, order, extras, ov, edited, distilled, built };
      if (storeKey) { try { localStorage.setItem(storeKey, JSON.stringify(snap)); } catch (_) {} }
      // only push to the DB once the cross-device lookup is done, so we never overwrite a newer
      // server copy with a stale local one before we've seen it
      if (docId && built && serverChecked && window.MarkwiseAPI && window.MarkwiseAPI.saveDeck) {
        pendingSnapRef.current = snap;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => { pendingSnapRef.current = null; window.MarkwiseAPI.saveDeck(docId, snap).catch(() => {}); }, 1200);
      }
      return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    }, [storeKey, docId, serverChecked, curSig, themeId, aiOn, order, extras, ov, edited, distilled, phase]);
    // flush any not-yet-saved deck to the DB on close, so a quick close after an edit isn't lost
    useEffect(() => () => {
      if (pendingSnapRef.current && docId && window.MarkwiseAPI && window.MarkwiseAPI.saveDeck) {
        window.MarkwiseAPI.saveDeck(docId, pendingSnapRef.current).catch(() => {});
      }
    }, []); // eslint-disable-line

    // Condense long / multi-sentence slide text into presentation bullets via AI, then advance
    // the build flow. Slides already condensed (cached & unchanged) are skipped, so only modified
    // slides regenerate. A previously-built deck advances straight to the deck (skips review).
    useEffect(() => {
      if (!serverChecked) return; // wait for the cross-device lookup before deciding to regenerate
      const target = restoredBuiltRef.current ? 'deck' : 'review';
      const advance = () => setPhase((p) => (p === 'gen' ? target : p));
      if (skipAutoGenRef.current) { advance(); return; } // already built for this exact content — no regen
      if (!aiOn || !window.GlyphAI) { advance(); return; }
      let dead = false;
      const need = [];
      baseSlides.forEach((sl, oi) => {
        const d = distilled[oi];
        const fresh = d && d.key === slideKey(sl);
        const hasText = (sl.paras || []).some((p) => String(p).trim());
        const wantParas = sl.kind === 'content' && hasText && (forceGenRef.current || window.GlyphAI.needsCondense(sl.paras));
        if (wantParas && !(fresh && d.paras)) need.push({ oi, type: 'paras' });
        if (sl.kind === 'title' && sl.sub && sl.sub.length > 200 && !(fresh && d.sub)) need.push({ oi, type: 'sub' });
      });
      if (!need.length) { advance(); return; }
      setAiBusy(true);
      Promise.all(need.map(async (n) => {
        const sl = baseSlides[n.oi];
        const key = n.type + '|' + slideKey(sl);
        if (!condenseCache[key]) {
          condenseCache[key] = n.type === 'paras'
            ? window.GlyphAI.condense(sl.title, sl.paras)
            : window.GlyphAI.condenseSub(sl.sub);
        }
        const val = await condenseCache[key];
        if (val && val._fallback) delete condenseCache[key]; // don't reuse fallbacks — retry on next open
        if (!dead) setDistilled((prev) => ({ ...prev, [n.oi]: { ...(prev[n.oi] || {}), key: slideKey(sl), [n.type]: val } }));
      })).finally(() => { if (!dead) { setAiBusy(false); advance(); } });
      return () => { dead = true; };
    }, [aiOn, baseSlides, serverChecked, genNonce]); // eslint-disable-line — distilled read intentionally from mount snapshot to avoid a regen loop
    useEffect(() => { localStorage.setItem('glyph-deck-idx', String(cur)); }, [cur]);

    const move = (si, dir) => {
      const o = [...ordered];
      const j = si + dir;
      if (j < 0 || j >= o.length) return;
      dirtyRef.current = true;
      [o[si], o[j]] = [o[j], o[si]];
      setOrder(o);
      setIdx(j);
    };
    const dropReorder = (from, to) => {
      if (from === to || to == null) return;
      dirtyRef.current = true;
      const o = [...ordered];
      const [m] = o.splice(from, 1);
      o.splice(to > from ? to - 1 : to, 0, m);
      setOrder(o);
      setIdx(o.indexOf(m));
    };
    const addSlide = (afterSi) => {
      dirtyRef.current = true;
      const id = 'x' + (xCounter.current++);
      setExtras((prev) => [...prev, { id, kind: 'content', title: 'New slide', paras: ['New point'], sub: null, visual: null }]);
      const o = [...ordered];
      o.splice(afterSi + 1, 0, id);
      setOrder(o);
      setIdx(afterSi + 1);
    };
    const deleteSlide = (si) => {
      dirtyRef.current = true;
      const ref = ordered[si];
      const o = [...ordered];
      o.splice(si, 1);
      setOrder(o);
      if (typeof ref === 'string') setExtras((prev) => prev.filter((e) => e.id !== ref));
      setIdx((i) => Math.max(0, Math.min(i, o.length - 1)));
    };
    const setSlideTheme = (oi, id) => { dirtyRef.current = true; setOv((prev) => ({ ...prev, [oi]: { ...(prev[oi] || {}), theme: id } })); };
    const toggleOv = (oi, key) => { dirtyRef.current = true; setOv((prev) => ({ ...prev, [oi]: { ...(prev[oi] || {}), [key]: !(prev[oi] || {})[key] } })); };
    // choosing a content arrangement (or Auto) also clears any applied layout — the two are
    // alternative ways to arrange a slide, so the simple modes give a one-click way out of a layout
    const setMode = (oi, m) => { dirtyRef.current = true; setOv((prev) => ({ ...prev, [oi]: { ...(prev[oi] || {}), mode: m, layout: null } })); };
    // re-run the whole generation flow from the document: drop cached AI bullets + text edits and
    // show the "generating" screen again (each section regenerates), keeping theme/layout/visual work
    const regenerateAll = () => {
      dirtyRef.current = true;
      forceGenRef.current = true; // rewrite every slide that has text, not only the long ones
      for (const k in condenseCache) delete condenseCache[k]; // force fresh AI, not the session cache
      setDistilled({});
      setEdited({});
      setRemarks({});
      setRevIdx(0);
      // reset per-slide arrangement (layout / content mode / flip) back to automatic, but keep
      // diagram edits, visual size, per-slide theme and skip choices
      setOv((prev) => {
        const nx = {};
        for (const k in prev) { const e = { ...prev[k] }; delete e.layout; delete e.mode; delete e.flip; nx[k] = e; }
        return nx;
      });
      skipAutoGenRef.current = false;
      restoredBuiltRef.current = false;
      setGenNonce((n) => n + 1);
      setPhase('gen');
    };
    // edit a slide's diagram (move/recolor/resize elements, just like in the doc) — persisted
    // as a per-slide visual override so the source document is left untouched
    const patchVisual = (oi, patch) => { dirtyRef.current = true; setOv((prev) => {
      const base = (prev[oi] && prev[oi].visual) || (srcOf(oi) && srcOf(oi).visual);
      if (!base) return prev;
      return { ...prev, [oi]: { ...(prev[oi] || {}), visual: { ...base, ...patch } } };
    }); };
    // drag-resize / move the whole visual on the slide canvas (8 handles + body),
    // stored per-slide as scale factors fw/fh and pixel offsets dx/dy in 1280-space
    const startVisDrag = (e, hmode) => {
      const sl = slides[Math.min(idx, slides.length - 1)];
      if (!sl || !sl.visual) return;
      dirtyRef.current = true;
      e.preventDefault();
      e.stopPropagation();
      const oi = sl._oi;
      const start = { x: e.clientX, y: e.clientY };
      const cur0 = (ov[oi] && ov[oi].vis) || { fw: 1, fh: 1, dx: 0, dy: 0 };
      const sc = stageW / 1280 || 0.64;
      const boxEl = stageRef.current && stageRef.current.querySelector('.slide-vis-box');
      const r = boxEl ? boxEl.getBoundingClientRect() : { width: 400 * sc, height: 300 * sc };
      const W0 = Math.max(40, r.width / (sc * (cur0.fw || 1)));
      const H0 = Math.max(40, r.height / (sc * (cur0.fh || 1)));
      const move = (ev) => {
        const ddx = (ev.clientX - start.x) / sc;
        const ddy = (ev.clientY - start.y) / sc;
        let { fw, fh, dx, dy } = cur0;
        if (hmode === 'move') { dx = cur0.dx + ddx; dy = cur0.dy + ddy; }
        else if (hmode.length === 2) {
          const sx = hmode.indexOf('e') !== -1 ? ddx : -ddx;
          const sy = hmode.indexOf('s') !== -1 ? ddy : -ddy;
          const k = Math.max(0.25 / cur0.fw, 1 + (sx / W0 + sy / H0) / 2);
          fw = cur0.fw * k; fh = cur0.fh * k;
          dx = cur0.dx + (hmode.indexOf('e') !== -1 ? (fw - cur0.fw) * W0 / 2 : -(fw - cur0.fw) * W0 / 2);
          dy = cur0.dy + (hmode.indexOf('s') !== -1 ? (fh - cur0.fh) * H0 / 2 : -(fh - cur0.fh) * H0 / 2);
        } else if (hmode === 'e' || hmode === 'w') {
          const dW = hmode === 'e' ? ddx : -ddx;
          fw = Math.max(0.25, cur0.fw + dW / W0);
          dx = cur0.dx + (hmode === 'e' ? (fw - cur0.fw) * W0 / 2 : -(fw - cur0.fw) * W0 / 2);
        } else {
          const dH = hmode === 's' ? ddy : -ddy;
          fh = Math.max(0.25, cur0.fh + dH / H0);
          dy = cur0.dy + (hmode === 's' ? (fh - cur0.fh) * H0 / 2 : -(fh - cur0.fh) * H0 / 2);
        }
        setOv((prev) => ({ ...prev, [oi]: { ...(prev[oi] || {}), vis: { fw, fh, dx, dy } } }));
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('no-select'); };
      document.body.classList.add('no-select');
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };

    // ----- build flow: review state -----
    const reviewSlides = slides.filter((s) => s.kind === 'title' || s.kind === 'content');
    const rev = reviewSlides[Math.min(revIdx, reviewSlides.length - 1)];
    const patchEdit = (oi, patch) => { dirtyRef.current = true; setEdited((prev) => ({ ...prev, [oi]: { ...(prev[oi] || {}), ...patch } })); };
    const regen = async (sl) => {
      if (!window.GlyphAI || regenOi != null) return;
      const base = srcOf(sl._oi);
      const note = (remarks[sl._oi] || '').trim();
      setRegenOi(sl._oi);
      try {
        if (base.kind === 'content' && (base.paras || []).length) {
          const bullets = await window.GlyphAI.condense(sl.title, base.paras, note);
          patchEdit(sl._oi, { paras: bullets.slice() });
        } else if (base.kind === 'title' && base.sub) {
          const s2 = await window.GlyphAI.condenseSub(base.sub, note);
          patchEdit(sl._oi, { sub: s2 });
        }
      } finally {
        setRegenOi(null);
      }
    };
    // generation progress: content slides that need AI condensing
    const genRows = baseSlides
      .map((sl, oi) => ({ sl, oi }))
      .filter((x) => x.sl.kind === 'content');
    const genNeeded = window.GlyphAI ? genRows.filter((x) => window.GlyphAI.needsCondense(x.sl.paras)) : [];

    useEffect(() => {
      function measure() {
        if (stageRef.current) setStageW(Math.min(stageRef.current.clientWidth - 56, 1100));
      }
      measure();
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }, [present, phase]);

    useEffect(() => {
      const k = (e) => {
        if (e.key === 'Escape') { if (present) setPresent(false); else if (pickOpen || layoutOpen) { setPickOpen(false); setLayoutOpen(false); } else onClose(); }
        if (phase !== 'deck' && !present) return; // arrows must not fight the review-form inputs
        if (e.key === 'ArrowRight' || e.key === 'PageDown') setIdx((i) => Math.min(i + 1, slides.length - 1));
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') setIdx((i) => Math.max(i - 1, 0));
      };
      window.addEventListener('keydown', k);
      return () => window.removeEventListener('keydown', k);
    }, [present, pickOpen, layoutOpen, slides.length, onClose, phase]);

    const doExport = async () => {
      setBusy(true);
      try {
        await exportPptx(live, theme, docTitle, railRef.current);
        toast('PPTX downloading…');
      } catch (e) {
        console.warn(e);
        toast('PPTX export unavailable offline — use PDF instead');
      }
      setBusy(false);
    };
    const doPrint = () => {
      setPrinting(true);
      toast('Choose “Landscape” in the print dialog');
      setTimeout(() => {
        window.print();
        setTimeout(() => setPrinting(false), 400);
      }, 350);
    };

    if (present) {
      const pw = Math.min(window.innerWidth, (window.innerHeight * 1280) / 720);
      const liveIdx = Math.max(0, live.findIndex((s) => s._si === cur));
      const shown = live[liveIdx] || live[0] || slides[0];
      const step = (d) => {
        const j = Math.min(Math.max(liveIdx + d, 0), live.length - 1);
        setIdx(live[j]._si);
      };
      return (
        <div className="present-root" onClick={() => step(1)}>
          <Slide slide={shown} theme={themeOf(shown)} w={pw} flip={shown._flip} layout={shown._layout} pageNo={pageOf[shown._si]} total={live.length} docTitle={docTitle} />
          <div className="present-count">{liveIdx + 1} / {live.length}</div>
          <button className="present-exit" onClick={(e) => { e.stopPropagation(); setPresent(false); }}>Esc · exit</button>
        </div>
      );
    }

    return (
      <div className="deck-root" data-screen-label="Presentation builder">
        <div className="deck-top">
          <div className="deck-title">
            <span className="brand-mark"></span>
            <b>{docTitle}</b>
            <span className="deck-meta">{live.length} slides · {theme.name}{aiBusy ? ' · ✦ condensing…' : ''}</span>
          </div>
          <div className="deck-actions">
            {phase === 'deck' ? (
              <React.Fragment>
                <button className={'ghost-btn sm' + (aiOn ? ' ai-on' : '')} title="Rewrite long slide text as short AI bullet points (also used for PPTX & PDF export)" onClick={() => setAiOn(!aiOn)}>✦ AI bullets: {aiOn ? 'on' : 'off'}</button>
                <button className="ghost-btn sm" title="Step through each slide to edit text or ✦ regenerate one slide" onClick={() => setPhase('review')}>✎ Review</button>
                <button className="ghost-btn sm" title="Rebuild every slide from the document (regenerates all content)" onClick={regenerateAll}>↻ Regenerate</button>
                <button className="ghost-btn sm" onClick={() => { setPickOpen(false); setLayoutOpen(!layoutOpen); }}>▦ Layouts</button>
                <button className="ghost-btn sm" onClick={() => { setLayoutOpen(false); setPickOpen(!pickOpen); }}>🎨 Theme</button>
                <button className="ghost-btn sm" onClick={doPrint}>⎙ PDF</button>
                <button className="ghost-btn sm" onClick={doExport} disabled={busy}>{busy ? 'Exporting…' : '↓ PPTX'}</button>
                <button className="primary-btn" onClick={() => setPresent(true)}>▶ Present</button>
              </React.Fragment>
            ) : (
              <button className="ghost-btn sm" onClick={() => setPhase('deck')}>Skip to deck →</button>
            )}
            <button className="icon-btn" onClick={onClose} aria-label="Close deck">✕</button>
          </div>
        </div>
        {pickOpen ? (
          <div className="theme-pick">
            <div className="theme-scope">
              <label className="lay-all"><input type="checkbox" checked={themeForSlide} onChange={(e) => setThemeForSlide(e.target.checked)} /> This slide only (slide {cur + 1})</label>
              {curSlide && curSlide._theme ? <button className="ghost-btn sm" onClick={() => setSlideTheme(curSlide._oi, null)}>↺ Use deck theme</button> : null}
            </div>
            {LOOKS.map((l) => (
              <div key={l.id} className="theme-row">
                <span className="theme-row-name">{l.name}</span>
                <div className="theme-swatches">
                  {PALETTES.map((p, pi) => {
                    const id = p.name.toLowerCase() + '-' + l.id;
                    const active = themeForSlide ? (curSlide && curSlide._theme === id) : themeId === id;
                    return (
                      <button
                        key={id}
                        className={'tswatch' + (active ? ' on' : '')}
                        title={p.name + ' ' + l.name}
                        style={{ background: l.id === 'dark' ? '#1b1916' : l.id === 'soft' ? p.soft : l.id === 'editorial' ? '#faf7f0' : '#fff' }}
                        onClick={() => { if (themeForSlide && curSlide) setSlideTheme(curSlide._oi, id); else setThemeId(id); }}
                      >
                        <span style={{ background: p.p, borderRadius: l.id === 'bold' ? 0 : 99 }}></span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {layoutOpen ? (
          <div className="layout-pick">
            <div className="lay-head">
              <b>{curSlide ? 'Slide layouts · applying to slide ' + (cur + 1) : 'Select a slide in the rail, then pick a layout'}</b>
              <label className="lay-all"><input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} /> Apply to all content slides</label>
              <button className="ghost-btn sm" onClick={() => {
                if (applyAll) setOv((prev) => { const nx = { ...prev }; baseSlides.forEach((sl, oi) => { if (nx[oi]) nx[oi] = { ...nx[oi], layout: null }; }); return nx; });
                else if (curSlide) setOv((prev) => ({ ...prev, [curSlide._oi]: { ...(prev[curSlide._oi] || {}), layout: null } }));
              }}>Auto (default)</button>
              <span className="lay-count">{((window.GlyphDeckLayouts.CATS.find((c) => c.id === layCat) || {}).layouts || []).length} layouts · {window.GlyphDeckLayouts.CATS.length} categories</span>
            </div>
            <div className="lay-body">
              <div className="lay-cats">
                {window.GlyphDeckLayouts.CATS.map((cat) => (
                  <button key={cat.id} className={cat.id === layCat ? 'on' : ''} onClick={() => setLayCat(cat.id)}>{cat.name}</button>
                ))}
              </div>
              <div className="lay-grid">
                {((window.GlyphDeckLayouts.CATS.find((c) => c.id === layCat) || { layouts: [] }).layouts).map((l) => (
                  <button
                    key={l.id}
                    className={'lay-chip' + (curSlide && curSlide._layout === l.id ? ' on' : '')}
                    title={l.name}
                    onClick={() => {
                      if (applyAll) setOv((prev) => { const nx = { ...prev }; baseSlides.forEach((sl, oi) => { if (sl.kind === 'content') nx[oi] = { ...(nx[oi] || {}), layout: l.id }; }); return nx; });
                      else if (curSlide) setOv((prev) => ({ ...prev, [curSlide._oi]: { ...(prev[curSlide._oi] || {}), layout: l.id } }));
                    }}
                  >
                    <window.GlyphDeckLayouts.Thumb conf={l.conf} />
                    <span>{l.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        {phase === 'resume' ? (
          <div className="deck-gen">
            <div className="deck-gen-card">
              <div className="gen-head"><span className="brand-mark"></span><b>Your slides are ready</b></div>
              <div className="gen-sub">We saved this presentation and the document hasn’t changed, so there’s nothing new to generate.</div>
              <div className="rev-nav" style={{ marginTop: 6, gap: 10, flexWrap: 'wrap' }}>
                <button className="primary-btn" onClick={() => setPhase('deck')}>Continue</button>
                <button className="ghost-btn sm" title="Step through each slide to edit text or ✦ regenerate one slide" onClick={() => setPhase('review')}>✎ Review</button>
                <button className="ghost-btn sm" title="Rebuild every slide from the document (regenerates all content)" onClick={regenerateAll}>↻ Regenerate</button>
              </div>
            </div>
          </div>
        ) : phase === 'gen' ? (
          <div className="deck-gen">
            <div className="deck-gen-card">
              <div className="gen-head"><span className="gen-spinner"></span><b>Generating your presentation…</b></div>
              <div className="gen-sub">
                Intro → agenda → {genRows.length} section slide{genRows.length === 1 ? '' : 's'} → thank you.
                {genNeeded.length ? ' Long sections are rewritten as crisp AI bullets.' : ''}
              </div>
              <div className="gen-list">
                {genRows.map(({ sl, oi }) => {
                  const hasText = (sl.paras || []).some((p) => String(p).trim());
                  const generated = !!(distilled[oi] && distilled[oi].paras);
                  const needs = hasText && (forceGenRef.current || (window.GlyphAI && window.GlyphAI.needsCondense(sl.paras)));
                  const done = generated || !needs;
                  return (
                    <div key={oi} className={'gen-row' + (done ? ' done' : '') + (!hasText ? ' notext' : '')}>
                      <span className="gen-dot">{generated ? '✓' : needs ? '' : '–'}</span>
                      <span className="gen-name">{sl.title}</span>
                      {sl.visual ? <span className="gen-vis" title={hasText ? "This section's diagram goes on the slide" : 'Visual-only slide — no text to rewrite'}>⬡ diagram{!hasText ? ' · no text' : ''}</span> : null}
                    </div>
                  );
                })}
              </div>
              <button className="ghost-btn sm" onClick={() => setPhase('review')}>Skip →</button>
            </div>
          </div>
        ) : phase === 'review' && rev ? (
          <div className="deck-review">
            <div className="rev-stage" ref={stageRef}>
              <Slide slide={rev} theme={themeOf(rev)} w={Math.min(stageW, 780)} flip={rev._flip} layout={rev._layout} docTitle={docTitle} />
              {rev.visual ? <div className="rev-vis-note">⬡ This section's diagram is on the slide and exports with it</div> : null}
            </div>
            <div className="rev-form">
              <div className="rev-kind">Slide {revIdx + 1} of {reviewSlides.length} · {rev.kind === 'title' ? 'Intro' : 'Section'}</div>
              <label>Title</label>
              <input value={rev.title} onChange={(e) => patchEdit(rev._oi, { title: e.target.value })} />
              {rev.kind === 'title' ? (
                <React.Fragment>
                  <label>Subtitle</label>
                  <textarea rows={3} value={rev.sub || ''} onChange={(e) => patchEdit(rev._oi, { sub: e.target.value })} />
                </React.Fragment>
              ) : (
                <React.Fragment>
                  <label>Bullets — one per line</label>
                  <textarea rows={8} value={(rev.paras || []).join('\n')} onChange={(e) => patchEdit(rev._oi, { paras: e.target.value.split('\n') })} />
                </React.Fragment>
              )}
              <details className="rev-remarks" open={!!(remarks[rev._oi] || '').length}>
                <summary>Remarks for the AI (optional)</summary>
                <textarea
                  rows={3}
                  placeholder="e.g. focus on the dates · punchier wording · max 4 bullets"
                  value={remarks[rev._oi] || ''}
                  onChange={(e) => setRemarks((p) => ({ ...p, [rev._oi]: e.target.value }))}
                />
              </details>
              <div className="rev-actions">
                <button
                  className="ghost-btn sm"
                  disabled={regenOi != null || (rev.kind === 'content' ? !((srcOf(rev._oi) || {}).paras || []).length : !(srcOf(rev._oi) || {}).sub)}
                  title="Rewrite this slide's text with AI, applying your remarks"
                  onClick={() => regen(rev)}
                >{regenOi === rev._oi ? '✦ Regenerating…' : '✦ Regenerate'}</button>
              </div>
              <div className="rev-nav">
                <button className="secondary-btn" disabled={revIdx === 0} onClick={() => setRevIdx(revIdx - 1)}>← Prev</button>
                <span className="deck-meta">{revIdx + 1} / {reviewSlides.length}</span>
                {revIdx < reviewSlides.length - 1
                  ? <button className="secondary-btn" onClick={() => setRevIdx(revIdx + 1)}>Next →</button>
                  : <button className="primary-btn" onClick={() => setPhase('deck')}>Build deck →</button>}
              </div>
            </div>
          </div>
        ) : (
        <div className="deck-main">
          <div className="deck-rail" ref={railRef}>
            {slides.map((sl, i) => (
              <div
                key={i}
                className={'thumb' + (i === cur ? ' on' : '') + (sl._skip ? ' skipped' : '') + (dragIdx === i ? ' dragging' : '') + (overIdx === i && dragIdx != null && dragIdx !== i ? ' drag-over' : '')}
                data-slide-idx={i} onClick={() => setIdx(i)} role="button" tabIndex={0}
                draggable
                onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(e) => { e.preventDefault(); if (overIdx !== i) setOverIdx(i); }}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                onDrop={(e) => { e.preventDefault(); dropReorder(dragIdx, i); setDragIdx(null); setOverIdx(null); }}
              >
                <Slide slide={sl} theme={themeOf(sl)} w={148} flip={sl._flip} layout={sl._layout} />
                <span className="thumb-n">{sl._skip ? '—' : pageOf[i] != null ? pageOf[i] : i + 1}</span>
                <span className="thumb-tools" onClick={(e) => e.stopPropagation()}>
                  <button title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button title="Move down" disabled={i === slides.length - 1} onClick={() => move(i, 1)}>↓</button>
                  {sl.kind === 'content' && sl.visual && (sl.paras || []).length ? (
                    <button title="Flip layout (swap text/visual sides)" onClick={() => toggleOv(sl._oi, 'flip')}>⇄</button>
                  ) : null}
                  <button title={sl._skip ? 'Include slide' : 'Skip slide'} onClick={() => toggleOv(sl._oi, 'skip')}>{sl._skip ? '◌' : '⊘'}</button>
                  <button className="del" title="Delete slide" disabled={slides.length <= 1} onClick={() => deleteSlide(i)}>✕</button>
                </span>
              </div>
            ))}
            <button className="deck-add-slide" onClick={() => addSlide(cur)}>＋ Add slide</button>
          </div>
          <div className="deck-stage" ref={stageRef}>
            {(curSlide.visual || curSlide._layout) ? (
              <div className="deck-mode">
                <span className="deck-mode-lbl">{curSlide.kind === 'content' && curSlide.visual ? 'Content' : 'Layout'}</span>
                {curSlide.kind === 'content' && curSlide.visual ? [['split', '▦ Split'], ['visual', '▣ Visual only'], ['text', '≡ Text only']].map(([m, lbl]) => (
                  <button key={m} className={!curSlide._layout && curSlide._mode === m ? 'on' : ''} title={curSlide._layout ? 'Switch to this arrangement (clears the layout)' : ''} onClick={() => setMode(curSlide._oi, m)}>{lbl}</button>
                )) : null}
                {(curSlide._layout || (ov[curSlide._oi] && ov[curSlide._oi].mode)) ? <button className="mode-auto" title={curSlide._layout ? 'Remove the layout (back to automatic)' : 'Automatic arrangement'} onClick={() => setMode(curSlide._oi, null)}>↺ {curSlide._layout ? 'Remove layout' : 'Auto'}</button> : null}
                {curSlide._vis ? <button className="mode-auto" title="Reset visual size & position" onClick={() => setOv((prev) => ({ ...prev, [curSlide._oi]: { ...(prev[curSlide._oi] || {}), vis: null } }))}>⤢ Reset size</button> : null}
                {curSlide._layout ? <span className="deck-mode-lbl" style={{ marginLeft: 'auto' }}>▦ {(window.GlyphDeckLayouts.byId[curSlide._layout] || {}).name || 'Layout'}</span> : null}
              </div>
            ) : null}
            <div style={{ position: 'relative' }}>
              <Slide slide={curSlide} theme={themeOf(curSlide)} w={stageW} flip={curSlide._flip} layout={curSlide._layout} pageNo={pageOf[cur]} total={live.length} docTitle={docTitle}
                editable onEdit={(patch) => patchEdit(curSlide._oi, patch)}
                visEdit={!!curSlide.visual && (curSlide._layout ? true : curSlide._mode !== 'text')}
                onVisEdit={startVisDrag} onVisPatch={(patch) => patchVisual(curSlide._oi, patch)} />
              <div className="deck-edit-hint">Click any text to edit{curSlide.visual && (curSlide._layout || curSlide._mode !== 'text') ? ' · click the visual to edit it, drag its frame to move/resize' : ''}</div>
              {curSlide._skip ? <div className="skip-badge">Skipped — excluded from Present &amp; exports</div> : null}
            </div>
            <div className="deck-nav">
              <button className="secondary-btn" disabled={cur === 0} onClick={() => setIdx(cur - 1)}>← Prev</button>
              <span className="deck-meta">{cur + 1} / {slides.length}</span>
              <button className="secondary-btn" disabled={cur === slides.length - 1} onClick={() => setIdx(cur + 1)}>Next →</button>
            </div>
          </div>
        </div>
        )}
        {printing ? (
          <div className="deck-print">
            {live.map((sl, k) => (
              <div key={k} className="print-page">
                <Slide slide={sl} theme={themeOf(sl)} w={1280} flip={sl._flip} layout={sl._layout} pageNo={k + 1} total={live.length} docTitle={docTitle} />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  window.GlyphDeck = { DeckOverlay, THEMES, buildSlides, EditableText };
})();
