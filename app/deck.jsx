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
  function Slide({ slide, theme, w, flip, pageNo, total, docTitle, layout }) {
    const v = themeVars(theme);
    const s = w / 1280;
    const isTitle = slide.kind === 'title' || slide.kind === 'thanks';
    const L = !isTitle && slide.kind !== 'agenda' && layout && window.GlyphDeckLayouts ? window.GlyphDeckLayouts.byId[layout] : null;
    const inv = !!(L && L.conf.invert);
    const bg = isTitle && v.titleBg ? v.titleBg : inv ? v.accent : v.bg;
    const fg = isTitle && v.titleBg ? '#ffffff' : v.fg;
    const sub = isTitle && v.titleBg ? 'rgba(255,255,255,0.82)' : v.sub;
    const accent = isTitle && v.titleBg ? '#ffffff' : v.accent;
    const paras = (slide.paras || []).filter((p) => String(p).trim()).slice(0, slide.kind === 'agenda' ? 10 : 6);
    const split = slide.visual && paras.length > 0;
    const cols = [];
    if (paras.length) cols.push('text');
    if (slide.visual) cols.push('vis');
    if (flip) cols.reverse();
    return (
      <div className="slide-scaler" style={{ width: w, height: (w * 720) / 1280 }}>
        <div className="slide" style={{ width: 1280, height: 720, transform: `scale(${s})`, background: bg, color: fg, fontFamily: v.headFont }}>
          {!L && (v.look === 'minimal' || v.look === 'dark') ? <div style={{ position: 'absolute', left: 90, top: isTitle ? 200 : 56, width: 56, height: 7, background: accent, borderRadius: 4 }}></div> : null}
          {!L && v.look === 'soft' ? <div style={{ position: 'absolute', right: -90, top: -90, width: 280, height: 280, borderRadius: '50%', background: v.accent, opacity: 0.12 }}></div> : null}
          {!isTitle && L ? (
            <window.GlyphDeckLayouts.LayoutSlide slide={slide} v={v} conf={L.conf} flip={flip} pageNo={pageNo} total={total} docTitle={docTitle} />
          ) : isTitle ? (
            <div style={{ position: 'absolute', left: 90, right: 110, top: 236 }}>
              <div style={{ fontSize: 66, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-1px', borderLeft: v.look === 'bold' ? '14px solid rgba(255,255,255,0.6)' : 'none', paddingLeft: v.look === 'bold' ? 28 : 0 }}>{slide.title}</div>
              {v.look === 'editorial' ? <div style={{ width: 110, height: 2, background: accent, margin: '28px 0' }}></div> : null}
              {slide.sub ? <div style={{ fontSize: 24, lineHeight: 1.5, color: sub, marginTop: 26, maxWidth: 880, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>{slide.sub.length > 300 ? slide.sub.slice(0, 297) + '…' : slide.sub}</div> : null}
            </div>
          ) : (
            <div style={{ position: 'absolute', inset: '52px 80px 56px' }}>
              <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 8, paddingLeft: v.look === 'bold' ? 24 : v.look === 'minimal' || v.look === 'dark' ? 0 : 0, borderLeft: v.look === 'bold' ? `12px solid ${v.accent}` : 'none', marginTop: v.look === 'minimal' || v.look === 'dark' ? 22 : 0 }}>{slide.title}</div>
              {v.look === 'editorial' ? <div style={{ width: 88, height: 2, background: accent, margin: '10px 0 4px' }}></div> : null}
              <div style={{ display: 'flex', gap: 44, marginTop: 26, height: 500 }}>
                {cols.map((kind) =>
                  kind === 'text' ? (
                    <div key="text" style={{ flex: split ? '0 0 38%' : 1, display: 'flex', flexDirection: 'column', gap: 22, justifyContent: 'center' }}>
                      {paras.map((p, i) => (
                        <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                          <span style={{ flex: '0 0 10px', width: 10, height: 10, borderRadius: v.look === 'bold' ? 0 : '50%', background: v.accent, marginTop: 11 }}></span>
                          <span style={{ fontSize: slide.visual ? 19 : 23, lineHeight: 1.55, color: v.fg === '#211f1c' ? '#3a362f' : v.fg, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>{p.length > 300 ? p.slice(0, 297) + '…' : p}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div key="vis" className="slide-vis" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
                      <div style={{ width: split ? '100%' : '76%', background: v.card ? '#ffffff' : 'transparent', borderRadius: v.radius, padding: v.card ? '18px 22px' : 0, boxShadow: v.card ? '0 10px 40px -12px rgba(20,18,14,0.25)' : 'none', maxHeight: 490, overflow: 'hidden' }}>
                        <window.Diagram visual={slide.visual} />
                      </div>
                    </div>
                  )
                )}
              </div>
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
        const paras = (sl.paras || []).filter((p) => String(p).trim()).slice(0, sl.kind === 'agenda' ? 10 : 6);
        const hasVis = !!sl.visual;
        const flip = !!sl._flip && hasVis && paras.length > 0;
        const textX = flip ? 5.8 : 0.6;
        if (paras.length) {
          s.addText(paras.map((p) => ({ text: p.length > 280 ? p.slice(0, 277) + '…' : p, options: { bullet: { code: '2022' }, color: fg, breakLine: true } })), {
            x: textX, y: 1.3, w: hasVis ? 3.7 : 8.8, h: 3.7, fontSize: hasVis ? 11 : 14, color: fg, fontFace: 'Helvetica', valign: 'top', paraSpaceAfter: 8,
          });
        }
        if (hasVis && railEl) {
          const svg = railEl.querySelector(`[data-slide-idx="${sl._si}"] svg`);
          if (svg) {
            const png = await window.GlyphDocExport.svgToPng(svg, 2);
            const aspect = png.h / png.w;
            let iw = paras.length ? 5.1 : 7.2;
            let ih = iw * aspect;
            const maxH = 3.7;
            if (ih > maxH) { ih = maxH; iw = ih / aspect; }
            const ix = paras.length ? (flip ? 0.55 + (5.1 - iw) / 2 : 4.55 + (5.1 - iw) / 2) : (W - iw) / 2;
            s.addImage({ data: png.url, x: ix, y: 1.3 + (maxH - ih) / 2, w: iw, h: ih });
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

  // ---------- deck overlay ----------
  function DeckOverlay({ docTitle, blocks, onClose, toast }) {
    const baseSlides = useMemo(() => buildSlides(docTitle, blocks), [docTitle, blocks]);
    const [order, setOrder] = useState(null);
    const [ov, setOv] = useState({});
    const [themeId, setThemeId] = useState(() => localStorage.getItem('glyph-deck-theme') || 'indigo-minimal');
    const [idx, setIdx] = useState(() => {
      const n = parseInt(localStorage.getItem('glyph-deck-idx') || '0', 10);
      return isNaN(n) ? 0 : Math.max(0, n);
    });
    const [present, setPresent] = useState(false);
    const [aiOn, setAiOn] = useState(() => localStorage.getItem('glyph-deck-ai') !== '0');
    const [aiBusy, setAiBusy] = useState(false);
    const [distilled, setDistilled] = useState({});
    // build flow: generating → per-slide review (editable, remarks, regenerate) → deck
    const [phase, setPhase] = useState('gen');
    const [revIdx, setRevIdx] = useState(0);
    const [edited, setEdited] = useState({});   // oi → {title, paras, sub} user overrides
    const [remarks, setRemarks] = useState({}); // oi → free-text remarks fed to regeneration
    const [regenOi, setRegenOi] = useState(null);
    const [pickOpen, setPickOpen] = useState(false);
    const [layoutOpen, setLayoutOpen] = useState(false);
    const [layCat, setLayCat] = useState('essentials');
    const [applyAll, setApplyAll] = useState(false);
    const [busy, setBusy] = useState(false);
    const [printing, setPrinting] = useState(false);
    const [stageW, setStageW] = useState(820);
    const stageRef = useRef(null);
    const railRef = useRef(null);
    const theme = THEMES.find((t) => t.id === themeId) || THEMES[0];

    const ordered = order && order.length === baseSlides.length ? order : baseSlides.map((_, i) => i);
    // the agenda lists the content slides in their current order, with title edits applied
    const agendaParas = ordered
      .map((oi) => ({ oi, b: baseSlides[oi] }))
      .filter((x) => x.b.kind === 'content')
      .map((x, n) => (n + 1) + '.  ' + ((edited[x.oi] || {}).title != null ? edited[x.oi].title : x.b.title));
    const slides = ordered.map((oi, si) => {
      const base = baseSlides[oi];
      const d = aiOn && distilled[oi] && distilled[oi].key === slideKey(base) ? distilled[oi] : {};
      const e = edited[oi] || {};
      return {
        ...base,
        title: e.title != null ? e.title : base.title,
        paras: base.kind === 'agenda' ? agendaParas : (e.paras || d.paras || base.paras),
        sub: e.sub != null ? e.sub : (d.sub || base.sub),
        _oi: oi, _si: si, _skip: !!(ov[oi] || {}).skip, _flip: !!(ov[oi] || {}).flip, _layout: (ov[oi] || {}).layout || null,
      };
    });
    const live = slides.filter((s) => !s._skip);
    const pageOf = {};
    live.forEach((s, k) => { pageOf[s._si] = k + 1; });
    const cur = Math.min(idx, slides.length - 1);
    const curSlide = slides[cur];

    useEffect(() => { setOrder(null); setOv({}); setDistilled({}); setEdited({}); setRemarks({}); setRevIdx(0); }, [baseSlides.length]);
    useEffect(() => { localStorage.setItem('glyph-deck-theme', themeId); }, [themeId]);
    useEffect(() => { localStorage.setItem('glyph-deck-ai', aiOn ? '1' : '0'); }, [aiOn]);

    // Condense long / multi-sentence slide text into presentation bullets via AI,
    // then move the build flow from "generating" to "review"
    useEffect(() => {
      const toReview = () => setPhase((p) => (p === 'gen' ? 'review' : p));
      if (!aiOn || !window.GlyphAI) { toReview(); return; }
      let dead = false;
      const need = [];
      baseSlides.forEach((sl, oi) => {
        if (sl.kind === 'content' && window.GlyphAI.needsCondense(sl.paras)) need.push({ oi, type: 'paras' });
        if (sl.kind === 'title' && sl.sub && sl.sub.length > 200) need.push({ oi, type: 'sub' });
      });
      if (!need.length) { toReview(); return; }
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
        if (val && val._fallback) delete condenseCache[key]; // don't cache fallbacks — retry on next open
        if (!dead) setDistilled((prev) => ({ ...prev, [n.oi]: { ...(prev[n.oi] || {}), key: slideKey(sl), [n.type]: val } }));
      })).finally(() => { if (!dead) { setAiBusy(false); toReview(); } });
      return () => { dead = true; };
    }, [aiOn, baseSlides]);
    useEffect(() => { localStorage.setItem('glyph-deck-idx', String(cur)); }, [cur]);

    const move = (si, dir) => {
      const o = [...ordered];
      const j = si + dir;
      if (j < 0 || j >= o.length) return;
      [o[si], o[j]] = [o[j], o[si]];
      setOrder(o);
      setIdx(j);
    };
    const toggleOv = (oi, key) => setOv((prev) => ({ ...prev, [oi]: { ...(prev[oi] || {}), [key]: !(prev[oi] || {})[key] } }));

    // ----- build flow: review state -----
    const reviewSlides = slides.filter((s) => s.kind === 'title' || s.kind === 'content');
    const rev = reviewSlides[Math.min(revIdx, reviewSlides.length - 1)];
    const patchEdit = (oi, patch) => setEdited((prev) => ({ ...prev, [oi]: { ...(prev[oi] || {}), ...patch } }));
    const regen = async (sl) => {
      if (!window.GlyphAI || regenOi != null) return;
      const base = baseSlides[sl._oi];
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
          <Slide slide={shown} theme={theme} w={pw} flip={shown._flip} layout={shown._layout} pageNo={pageOf[shown._si]} total={live.length} docTitle={docTitle} />
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
                <button className="ghost-btn sm" onClick={() => setPhase('review')}>✎ Review slides</button>
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
            {LOOKS.map((l) => (
              <div key={l.id} className="theme-row">
                <span className="theme-row-name">{l.name}</span>
                <div className="theme-swatches">
                  {PALETTES.map((p, pi) => {
                    const id = p.name.toLowerCase() + '-' + l.id;
                    return (
                      <button
                        key={id}
                        className={'tswatch' + (themeId === id ? ' on' : '')}
                        title={p.name + ' ' + l.name}
                        style={{ background: l.id === 'dark' ? '#1b1916' : l.id === 'soft' ? p.soft : l.id === 'editorial' ? '#faf7f0' : '#fff' }}
                        onClick={() => setThemeId(id)}
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
              <b>{curSlide && curSlide.kind === 'content' ? 'Slide layouts · applying to slide ' + (cur + 1) : 'Select a content slide in the rail, then pick a layout'}</b>
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
                      else if (curSlide && curSlide.kind === 'content') setOv((prev) => ({ ...prev, [curSlide._oi]: { ...(prev[curSlide._oi] || {}), layout: l.id } }));
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
        {phase === 'gen' ? (
          <div className="deck-gen">
            <div className="deck-gen-card">
              <div className="gen-head"><span className="gen-spinner"></span><b>Generating your presentation…</b></div>
              <div className="gen-sub">
                Intro → agenda → {genRows.length} section slide{genRows.length === 1 ? '' : 's'} → thank you.
                {genNeeded.length ? ' Long sections are rewritten as crisp AI bullets.' : ''}
              </div>
              <div className="gen-list">
                {genRows.map(({ sl, oi }) => {
                  const needed = window.GlyphAI && window.GlyphAI.needsCondense(sl.paras);
                  const done = !needed || !!(distilled[oi] && distilled[oi].paras);
                  return (
                    <div key={oi} className={'gen-row' + (done ? ' done' : '')}>
                      <span className="gen-dot">{done ? '✓' : ''}</span>
                      <span className="gen-name">{sl.title}</span>
                      {sl.visual ? <span className="gen-vis" title="This section's diagram goes on the slide">⬡ diagram</span> : null}
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
              <Slide slide={rev} theme={theme} w={Math.min(stageW, 780)} flip={rev._flip} layout={rev._layout} docTitle={docTitle} />
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
                  disabled={regenOi != null || (rev.kind === 'content' ? !(baseSlides[rev._oi].paras || []).length : !baseSlides[rev._oi].sub)}
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
              <div key={i} className={'thumb' + (i === cur ? ' on' : '') + (sl._skip ? ' skipped' : '')} data-slide-idx={i} onClick={() => setIdx(i)} role="button" tabIndex={0}>
                <Slide slide={sl} theme={theme} w={148} flip={sl._flip} layout={sl._layout} />
                <span className="thumb-n">{sl._skip ? '—' : pageOf[i] != null ? pageOf[i] : i + 1}</span>
                <span className="thumb-tools" onClick={(e) => e.stopPropagation()}>
                  <button title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button title="Move down" disabled={i === slides.length - 1} onClick={() => move(i, 1)}>↓</button>
                  {sl.kind === 'content' && sl.visual && (sl.paras || []).length ? (
                    <button title="Flip layout (swap text/visual sides)" onClick={() => toggleOv(sl._oi, 'flip')}>⇄</button>
                  ) : null}
                  <button title={sl._skip ? 'Include slide' : 'Skip slide'} onClick={() => toggleOv(sl._oi, 'skip')}>{sl._skip ? '◌' : '⊘'}</button>
                </span>
              </div>
            ))}
          </div>
          <div className="deck-stage" ref={stageRef}>
            <div style={{ position: 'relative' }}>
              <Slide slide={curSlide} theme={theme} w={stageW} flip={curSlide._flip} layout={curSlide._layout} pageNo={pageOf[cur]} total={live.length} docTitle={docTitle} />
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
                <Slide slide={sl} theme={theme} w={1280} flip={sl._flip} layout={sl._layout} pageNo={k + 1} total={live.length} docTitle={docTitle} />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  window.GlyphDeck = { DeckOverlay, THEMES, buildSlides };
})();
