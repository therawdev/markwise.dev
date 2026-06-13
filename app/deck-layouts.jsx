// Glyph — deck slide layouts: 10 use-case categories × 5 layouts, one generic renderer
(function () {
  const F = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  const L = (id, name, conf) => ({ id, name, conf });

  const CATS = [
    { id: 'essentials', name: 'Deck essentials', layouts: [
      L('es-welcome', 'Welcome', { invert: true, title: 'hero', body: 'sublines' }),
      L('es-intro', 'Intro', { title: 'huge', body: 'sublines', accent: 'bar' }),
      L('es-agenda', 'Agenda', { title: 'left', body: 'agenda', accent: 'side' }),
      L('es-divider', 'Section divider', { invert: true, title: 'hero', body: 'none' }),
      L('es-divider2', 'Divider (light)', { title: 'hero', body: 'none', accent: 'half' }),
      L('es-quote', 'Quote opener', { title: 'center', body: 'quote', accent: 'bar' }),
      L('es-team', 'Team', { title: 'top', body: 'cards', accent: 'corner' }),
      L('es-summary', 'Summary', { title: 'top', body: 'checklist', accent: 'bar' }),
      L('es-next', 'Next steps', { title: 'top', body: 'steps', accent: 'bottom' }),
      L('es-qa', 'Q&A', { title: 'hero', body: 'sublines', accent: 'frame' }),
      L('es-contact', 'Contact', { title: 'hero', body: 'sublines', accent: 'bottom' }),
      L('es-thanks', 'Thank you', { invert: true, title: 'hero', body: 'sublines' }),
    ] },
    { id: 'pitch', name: 'Startup pitch', layouts: [
      L('pi-problem', 'Problem', { title: 'huge', body: 'bullets', accent: 'bar' }),
      L('pi-solution', 'Solution', { title: 'left', body: 'cards', accent: 'side' }),
      L('pi-market', 'Market size', { title: 'center', body: 'stats', accent: 'corner' }),
      L('pi-traction', 'Traction', { title: 'top', body: 'bullets', accent: 'bottom', visPos: 'right' }),
      L('pi-team', 'Team', { title: 'band', body: 'cards' }),
    ] },
    { id: 'bizreview', name: 'Business review', layouts: [
      L('br-exec', 'Exec summary', { title: 'top', body: 'feature', accent: 'bar' }),
      L('br-kpi', 'KPI snapshot', { title: 'top', body: 'stats', accent: 'frame' }),
      L('br-wins', 'Wins & lowlights', { title: 'top', body: 'twocol', accent: 'side' }),
      L('br-risks', 'Risks', { title: 'left', body: 'numbered', accent: 'half' }),
      L('br-next', 'Next quarter', { title: 'top', body: 'steps', accent: 'bottom' }),
    ] },
    { id: 'sales', name: 'Sales', layouts: [
      L('sa-hook', 'Hook', { title: 'center', body: 'quote', accent: 'corner' }),
      L('sa-pain', 'Pain points', { title: 'top', body: 'numbered', accent: 'side' }),
      L('sa-offer', 'Offer', { title: 'left', body: 'cards', accent: 'half' }),
      L('sa-proof', 'Proof', { title: 'top', body: 'quote', accent: 'frame' }),
      L('sa-pricing', 'Pricing', { title: 'center', body: 'cards', accent: 'bottom' }),
    ] },
    { id: 'marketing', name: 'Marketing', layouts: [
      L('mk-campaign', 'Campaign idea', { title: 'huge', body: 'feature', accent: 'corner' }),
      L('mk-audience', 'Audience', { title: 'left', body: 'bullets', accent: 'half' }),
      L('mk-channels', 'Channels', { title: 'top', body: 'cards' }),
      L('mk-calendar', 'Calendar', { title: 'top', body: 'agenda', accent: 'side' }),
      L('mk-results', 'Results', { title: 'top', body: 'stats', accent: 'bottom' }),
    ] },
    { id: 'product', name: 'Product', layouts: [
      L('pr-roadmap', 'Roadmap', { title: 'top', body: 'steps', accent: 'side' }),
      L('pr-feature', 'Feature spotlight', { title: 'left', body: 'feature', accent: 'corner' }),
      L('pr-how', 'How it works', { title: 'top', body: 'numbered', accent: 'frame' }),
      L('pr-voice', 'User feedback', { title: 'center', body: 'quote' }),
      L('pr-metrics', 'Metrics', { title: 'top', body: 'stats', accent: 'side' }),
    ] },
    { id: 'strategy', name: 'Strategy', layouts: [
      L('st-vision', 'Vision', { title: 'center', body: 'quote', invert: true }),
      L('st-pillars', 'Pillars', { title: 'top', body: 'cards', accent: 'bottom' }),
      L('st-bets', 'Big bets', { title: 'left', body: 'numbered', accent: 'side' }),
      L('st-risks', 'Risks & mitigations', { title: 'top', body: 'twocol', accent: 'frame' }),
      L('st-plan', 'One-page plan', { title: 'top', body: 'agenda', accent: 'bar' }),
    ] },
    { id: 'education', name: 'Education', layouts: [
      L('ed-intro', 'Lesson intro', { title: 'band', body: 'bullets' }),
      L('ed-concept', 'Key concept', { title: 'center', body: 'feature', accent: 'corner' }),
      L('ed-example', 'Worked example', { title: 'top', body: 'numbered', accent: 'side' }),
      L('ed-practice', 'Practice', { title: 'top', body: 'checklist', accent: 'frame' }),
      L('ed-recap', 'Recap', { title: 'left', body: 'checklist', accent: 'half' }),
    ] },
    { id: 'report', name: 'Report & data', layouts: [
      L('re-headline', 'Headline number', { title: 'top', body: 'stats', invert: true }),
      L('re-chart', 'Chart + notes', { title: 'top', body: 'bullets', accent: 'bar', visPos: 'right' }),
      L('re-exhibit', 'Exhibit', { title: 'top', body: 'bullets', visPos: 'full' }),
      L('re-findings', 'Findings', { title: 'left', body: 'bullets', accent: 'side' }),
      L('re-appendix', 'Appendix', { title: 'top', body: 'agenda' }),
    ] },
    { id: 'creative', name: 'Creative & agency', layouts: [
      L('cr-statement', 'Statement', { title: 'huge', body: 'bullets', invert: true }),
      L('cr-showcase', 'Showcase', { title: 'top', body: 'feature', accent: 'half' }),
      L('cr-case', 'Case study', { title: 'left', body: 'numbered', accent: 'bar' }),
      L('cr-quote', 'Big quote', { title: 'center', body: 'quote', accent: 'frame' }),
      L('cr-manifesto', 'Manifesto', { title: 'center', body: 'twocol', accent: 'corner' }),
    ] },
    { id: 'event', name: 'Event & workshop', layouts: [
      L('ev-welcome', 'Welcome', { title: 'center', body: 'bullets', invert: true }),
      L('ev-agenda', 'Agenda', { title: 'left', body: 'agenda', accent: 'half' }),
      L('ev-speaker', 'Speaker', { title: 'top', body: 'feature', accent: 'corner' }),
      L('ev-activity', 'Activity', { title: 'band', body: 'steps' }),
      L('ev-wrap', 'Wrap-up', { title: 'top', body: 'checklist', accent: 'bottom' }),
    ] },
  ];
  const byId = {};
  // extras pool: each category draws a different 15 from these, for 20 layouts per category
  const EXTRAS = [
    ['Spotlight', { title: 'huge', body: 'feature', accent: 'bar' }],
    ['Two columns', { title: 'top', body: 'twocol', accent: 'corner' }],
    ['Checklist', { title: 'top', body: 'checklist', accent: 'side' }],
    ['Numbered', { title: 'left', body: 'numbered', accent: 'bar' }],
    ['Card trio', { title: 'center', body: 'cards', accent: 'bottom' }],
    ['Stat band', { title: 'band', body: 'stats' }],
    ['Quote panel', { title: 'left', body: 'quote', accent: 'half' }],
    ['Agenda lines', { title: 'center', body: 'agenda', accent: 'frame' }],
    ['Step track', { title: 'center', body: 'steps', accent: 'bar' }],
    ['Inverted bullets', { title: 'top', body: 'bullets', invert: true }],
    ['Inverted cards', { title: 'center', body: 'cards', invert: true }],
    ['Inverted steps', { title: 'band', body: 'steps', invert: true }],
    ['Visual right', { title: 'top', body: 'bullets', accent: 'frame', visPos: 'right' }],
    ['Visual left', { title: 'top', body: 'bullets', accent: 'bottom', visPos: 'left' }],
    ['Visual below', { title: 'top', body: 'bullets', accent: 'bar', visPos: 'bottom' }],
    ['Full exhibit', { title: 'center', body: 'bullets', visPos: 'full' }],
    ['Framed bullets', { title: 'top', body: 'bullets', accent: 'frame' }],
    ['Half-panel list', { title: 'left', body: 'bullets', accent: 'half' }],
    ['Banded cards', { title: 'band', body: 'cards' }],
    ['Corner feature', { title: 'center', body: 'feature', accent: 'corner' }],
    ['Side stats', { title: 'left', body: 'stats', accent: 'side' }],
    ['Framed steps', { title: 'top', body: 'steps', accent: 'frame' }],
    ['Banded checklist', { title: 'band', body: 'checklist' }],
    ['Big quote', { title: 'huge', body: 'quote', accent: 'corner' }],
    ['Agenda + bar', { title: 'left', body: 'agenda', accent: 'bar' }],
    ['Numbered frame', { title: 'center', body: 'numbered', accent: 'frame' }],
    ['Half feature', { title: 'left', body: 'feature', accent: 'half' }],
    ['Wide checklist', { title: 'huge', body: 'checklist', accent: 'bottom' }],
    ['Stat columns', { title: 'top', body: 'stats', accent: 'corner' }],
    ['Inverted quote', { title: 'band', body: 'quote', invert: true }],
  ];
  CATS.forEach((c, k) => {
    if (c.id === 'essentials') return; // essentials stays curated-only
    const off = (k * 11) % EXTRAS.length;
    for (let j = 0; j < 15; j++) {
      const [nm, conf] = EXTRAS[(off + j) % EXTRAS.length];
      c.layouts.push({ id: c.id + '-x' + j, name: nm, conf });
    }
  });
  CATS.forEach((c) => c.layouts.forEach((l) => { byId[l.id] = { ...l, catName: c.name }; }));

  const statOf = (p) => {
    const m = String(p).match(/[$€£]?\d[\d,.]*\s*(%|[MBKx]\b|\+)?/);
    return m ? m[0].trim() : null;
  };
  const splitHead = (p) => {
    const ix = p.search(/[:—]|\s-\s/);
    if (ix > 2 && ix < 48) return [p.slice(0, ix).trim(), p.slice(ix + 1).replace(/^[-—\s]+/, '').trim()];
    return [null, p];
  };
  const clip = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s);

  // editable text node — uses the deck's click-to-edit EditableText on the editing stage, else a plain span.
  // (deck-layouts.jsx loads before deck.jsx, so resolve the component lazily at render time.)
  function ET(props) {
    const C = window.GlyphDeck && window.GlyphDeck.EditableText;
    return C ? React.createElement(C, props) : React.createElement('span', { style: props.style }, props.value);
  }

  // ---------- body renderers (each line is click-to-edit when `editable`; edits the raw bullet) ----------
  function Bullets({ paras, fg, acc, size, square, editable, onEditPara, off }) {
    const base = off || 0;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, justifyContent: 'center', height: '100%' }}>
        {paras.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <span style={{ flex: '0 0 10px', width: 10, height: 10, borderRadius: square ? 0 : '50%', background: acc, marginTop: 11 }}></span>
            {editable
              ? <ET value={p} style={{ fontSize: size, lineHeight: 1.5, color: fg, fontFamily: F, flex: 1 }} onCommit={(t) => onEditPara(base + i, t)} />
              : <span style={{ fontSize: size, lineHeight: 1.5, color: fg, fontFamily: F }}>{clip(p, 300)}</span>}
          </div>
        ))}
      </div>
    );
  }
  function Numbered({ paras, fg, sub, acc, size, editable, onEditPara }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, justifyContent: 'center', height: '100%' }}>
        {paras.map((p, i) => {
          const [h, b] = splitHead(p);
          return (
            <div key={i} style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>
              <span style={{ flex: '0 0 56px', fontSize: 30, fontWeight: 800, color: acc, fontFamily: F, lineHeight: 1.1 }}>{String(i + 1).padStart(2, '0')}</span>
              {editable
                ? <ET value={p} style={{ fontSize: size, lineHeight: 1.45, color: fg, fontFamily: F, flex: 1 }} onCommit={(t) => onEditPara(i, t)} />
                : <span style={{ fontSize: size, lineHeight: 1.45, color: fg, fontFamily: F }}>{h ? <b>{h} — </b> : null}{clip(b, 240)}</span>}
            </div>
          );
        })}
      </div>
    );
  }
  function Cards({ paras, fg, sub, cardBg, radius, editable, onEditPara }) {
    const cols = paras.length <= 3 ? Math.max(paras.length, 1) : paras.length === 4 ? 2 : 3;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 22, alignContent: 'center', height: '100%' }}>
        {paras.map((p, i) => {
          const [h, b] = splitHead(p);
          return (
            <div key={i} style={{ background: cardBg, borderRadius: radius, padding: '26px 26px' }}>
              {editable
                ? <ET value={p} style={{ fontSize: 16.5, lineHeight: 1.5, color: fg, fontFamily: F }} onCommit={(t) => onEditPara(i, t)} />
                : <React.Fragment>{h ? <div style={{ fontSize: 19, fontWeight: 700, color: fg, fontFamily: F, marginBottom: 10 }}>{h}</div> : null}<div style={{ fontSize: h ? 14.5 : 16.5, lineHeight: 1.5, color: h ? sub : fg, fontFamily: F }}>{clip(b, 200)}</div></React.Fragment>}
            </div>
          );
        })}
      </div>
    );
  }
  function Stats({ paras, fg, sub, acc, editable, onEditPara }) {
    const items = paras.slice(0, 4);
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, 1fr)`, gap: 30, alignContent: 'center', height: '100%' }}>
        {items.map((p, i) => {
          const st = statOf(p);
          const rest = st ? p.replace(st, '').replace(/^\W+|\W+$/g, '') : p;
          return (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 52, fontWeight: 800, color: acc, fontFamily: F, letterSpacing: '-1px' }}>{st || String(i + 1).padStart(2, '0')}</div>
              {editable
                ? <ET value={p} style={{ fontSize: 15.5, lineHeight: 1.45, color: sub, fontFamily: F, marginTop: 12, textAlign: 'center' }} onCommit={(t) => onEditPara(i, t)} />
                : <div style={{ fontSize: 15.5, lineHeight: 1.45, color: sub, fontFamily: F, marginTop: 12 }}>{clip(rest, 130)}</div>}
            </div>
          );
        })}
      </div>
    );
  }
  function Steps({ paras, fg, sub, acc, cardBg, editable, onEditPara }) {
    const items = paras.slice(0, 5);
    return (
      <div style={{ position: 'relative', display: 'flex', gap: 26, alignItems: 'flex-start', justifyContent: 'center', height: '100%', paddingTop: '12%' }}>
        <div style={{ position: 'absolute', left: '4%', right: '4%', top: 'calc(12% + 23px)', height: 3, background: cardBg }}></div>
        {items.map((p, i) => {
          const [h, b] = splitHead(p);
          return (
            <div key={i} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', background: acc, color: '#fff', fontSize: 19, fontWeight: 700, fontFamily: F, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>{i + 1}</div>
              {editable
                ? <ET value={p} style={{ fontSize: 13.5, lineHeight: 1.45, color: sub, fontFamily: F, marginTop: 16, textAlign: 'center' }} onCommit={(t) => onEditPara(i, t)} />
                : <React.Fragment>{h ? <div style={{ fontSize: 16, fontWeight: 700, color: fg, fontFamily: F, marginTop: 16 }}>{h}</div> : null}<div style={{ fontSize: 13.5, lineHeight: 1.45, color: sub, fontFamily: F, marginTop: h ? 6 : 16 }}>{clip(b, 110)}</div></React.Fragment>}
            </div>
          );
        })}
      </div>
    );
  }
  function Quote({ paras, fg, sub, acc, headFont, editable, onEditPara }) {
    const rest = paras.slice(1);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', height: '100%', padding: '0 60px' }}>
        <div style={{ fontSize: 110, fontWeight: 800, color: acc, fontFamily: headFont, lineHeight: 0.4, marginBottom: 30 }}>“</div>
        {editable
          ? <ET value={paras[0] || ''} style={{ fontSize: 32, lineHeight: 1.4, fontWeight: 600, color: fg, fontFamily: headFont, maxWidth: 940, textAlign: 'center' }} onCommit={(t) => onEditPara(0, t)} />
          : <div style={{ fontSize: paras[0] && paras[0].length > 140 ? 28 : 36, lineHeight: 1.4, fontWeight: 600, color: fg, fontFamily: headFont, maxWidth: 940 }}>{clip(paras[0] || '', 280)}</div>}
        {rest.map((p, i) => (
          editable
            ? <ET key={i} value={p} style={{ fontSize: 16, color: sub, fontFamily: F, marginTop: i === 0 ? 30 : 10, textAlign: 'center' }} onCommit={(t) => onEditPara(i + 1, t)} />
            : <div key={i} style={{ fontSize: 16, color: sub, fontFamily: F, marginTop: i === 0 ? 30 : 10 }}>{clip(p, 140)}</div>
        ))}
      </div>
    );
  }
  function TwoCol({ paras, fg, acc, square, editable, onEditPara }) {
    const half = Math.ceil(paras.length / 2);
    const colsP = [paras.slice(0, half), paras.slice(half)];
    return (
      <div style={{ display: 'flex', gap: 60, height: '100%', alignItems: 'center' }}>
        {colsP.map((col, k) => (
          <div key={k} style={{ flex: 1 }}>
            <Bullets paras={col} fg={fg} acc={acc} size={18} square={square} editable={editable} onEditPara={onEditPara} off={k === 0 ? 0 : half} />
          </div>
        ))}
      </div>
    );
  }
  function Checklist({ paras, fg, acc, size, editable, onEditPara }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, justifyContent: 'center', height: '100%' }}>
        {paras.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
            <span style={{ flex: '0 0 26px', width: 26, height: 26, borderRadius: 7, background: acc, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, marginTop: 2 }}>✓</span>
            {editable
              ? <ET value={p} style={{ fontSize: size, lineHeight: 1.5, color: fg, fontFamily: F, flex: 1 }} onCommit={(t) => onEditPara(i, t)} />
              : <span style={{ fontSize: size, lineHeight: 1.5, color: fg, fontFamily: F }}>{clip(p, 260)}</span>}
          </div>
        ))}
      </div>
    );
  }
  function Agenda({ paras, fg, sub, acc, hairline, editable, onEditPara }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
        {paras.map((p, i) => {
          const [h, b] = splitHead(p);
          return (
            <div key={i} style={{ display: 'flex', gap: 26, alignItems: 'baseline', padding: '17px 0', borderBottom: i < paras.length - 1 ? `1px solid ${hairline}` : 'none' }}>
              <span style={{ flex: '0 0 52px', fontSize: 16, fontWeight: 800, color: acc, fontFamily: F }}>{String(i + 1).padStart(2, '0')}</span>
              {editable
                ? <ET value={p} style={{ fontSize: 18.5, color: fg, fontFamily: F, lineHeight: 1.4, flex: 1 }} onCommit={(t) => onEditPara(i, t)} />
                : <span style={{ fontSize: 18.5, color: fg, fontFamily: F, lineHeight: 1.4 }}>{h ? <b style={{ marginRight: 12 }}>{h}</b> : null}{h ? <span style={{ color: sub, fontSize: 16 }}>{clip(b, 160)}</span> : clip(b, 220)}</span>}
            </div>
          );
        })}
      </div>
    );
  }
  function Feature({ paras, fg, sub, acc, square, editable, onEditPara }) {
    const rest = paras.slice(1);
    return (
      <div style={{ display: 'flex', gap: 64, height: '100%', alignItems: 'center' }}>
        {editable
          ? <div style={{ flex: '0 0 46%', borderLeft: `5px solid ${acc}`, paddingLeft: 28 }}><ET value={paras[0] || ''} style={{ fontSize: 29, lineHeight: 1.42, fontWeight: 600, color: fg, fontFamily: F }} onCommit={(t) => onEditPara(0, t)} /></div>
          : <div style={{ flex: '0 0 46%', fontSize: 29, lineHeight: 1.42, fontWeight: 600, color: fg, fontFamily: F, borderLeft: `5px solid ${acc}`, paddingLeft: 28 }}>{clip(paras[0] || '', 230)}</div>}
        {rest.length ? <div style={{ flex: 1 }}><Bullets paras={rest} fg={sub} acc={acc} size={17} square={square} editable={editable} onEditPara={onEditPara} off={1} /></div> : null}
      </div>
    );
  }

  // ---------- generic layout slide (rendered inside the 1280×720 .slide div) ----------
  function LayoutSlide({ slide, v, conf, flip, pageNo, total, docTitle, editable, onEdit, visEdit, onVisPatch, onVisEdit, VisFrame, vis, visMoved }) {
    const inv = !!conf.invert;
    const acc = inv ? '#ffffff' : v.accent;
    const fg = inv ? '#ffffff' : v.fg;
    const sub = inv ? 'rgba(255,255,255,0.78)' : v.sub;
    const cardBg = inv ? 'rgba(255,255,255,0.15)' : v.look === 'dark' ? 'rgba(255,255,255,0.08)' : v.look === 'soft' ? '#ffffff' : v.soft;
    const hairline = inv ? 'rgba(255,255,255,0.3)' : v.look === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(20,18,14,0.14)';
    const square = v.look === 'bold';
    // title / thank-you slides carry their text in `sub`; fall back to it so layouts have a body.
    // strip any leading "1. " enumerator (e.g. agenda lines) so numbered layouts don't double-number.
    const paras = ((slide.paras && slide.paras.length) ? slide.paras : (slide.sub ? [slide.sub] : [])).slice(0, 6).map((p) => String(p).replace(/^\s*\d+[.)]\s+/, ''));
    const A = conf.accent;
    const tm = conf.title || 'top';
    const onEditPara = (i, t) => { const np = (slide.paras || []).slice(); if (String(t).trim()) np[i] = t; else np.splice(i, 1); onEdit && onEdit({ paras: np }); };
    const T = () => (editable ? <ET value={slide.title} style={{ outline: 'none' }} onCommit={(t) => onEdit && onEdit({ title: t })} /> : slide.title);

    let visPos = slide.visual ? (conf.visPos || 'right') : 'none';
    if (visPos === 'full' && !slide.visual) visPos = 'none';

    const bodyEl = (size) => {
      const common = { paras, fg: v.look === 'dark' || inv ? fg : '#3a362f', sub, acc, square, editable, onEditPara };
      switch (conf.body) {
        case 'none': return null;
        case 'sublines': return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, justifyContent: 'center', alignItems: 'center', textAlign: 'center', height: '100%' }}>
            {paras.slice(0, 4).map((p, i) => (
              editable
                ? <ET key={i} value={p} style={{ fontSize: i === 0 ? 22 : 17.5, lineHeight: 1.5, color: i === 0 ? fg : sub, fontFamily: F, maxWidth: 860, textAlign: 'center' }} onCommit={(t) => onEditPara(i, t)} />
                : <div key={i} style={{ fontSize: i === 0 ? 22 : 17.5, lineHeight: 1.5, color: i === 0 ? fg : sub, fontFamily: F, maxWidth: 860 }}>{clip(p, 220)}</div>
            ))}
          </div>
        );
        case 'numbered': return <Numbered {...common} size={size + 1} />;
        case 'cards': return <Cards paras={paras} fg={fg} sub={sub} cardBg={cardBg} radius={Math.max(v.radius, 8)} editable={editable} onEditPara={onEditPara} />;
        case 'stats': return <Stats paras={paras} fg={fg} sub={sub} acc={inv ? '#fff' : v.accent} editable={editable} onEditPara={onEditPara} />;
        case 'steps': return <Steps paras={paras} fg={fg} sub={sub} acc={inv ? 'rgba(255,255,255,0.9)' : v.accent} cardBg={cardBg} editable={editable} onEditPara={onEditPara} />;
        case 'quote': return <Quote paras={paras} fg={fg} sub={sub} acc={acc} headFont={v.headFont} editable={editable} onEditPara={onEditPara} />;
        case 'twocol': return <TwoCol {...common} />;
        case 'checklist': return <Checklist paras={paras} fg={common.fg} acc={inv ? 'rgba(255,255,255,0.35)' : v.accent} size={size + 2} editable={editable} onEditPara={onEditPara} />;
        case 'agenda': return <Agenda paras={paras} fg={fg} sub={sub} acc={acc} hairline={hairline} editable={editable} onEditPara={onEditPara} />;
        case 'feature': return <Feature paras={paras} fg={fg} sub={sub} acc={acc} square={square} editable={editable} onEditPara={onEditPara} />;
        default: return <Bullets {...common} size={size + 3} />;
      }
    };

    const vv = vis || { fw: 1, fh: 1, dx: 0, dy: 0 };
    const visEl = slide.visual ? (
      <div className="slide-vis" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, height: '100%' }}>
        <div className="slide-vis-box" style={{ position: 'relative', width: visPos === 'full' ? '72%' : '100%', transform: visMoved ? `translate(${vv.dx}px,${vv.dy}px) scale(${vv.fw},${vv.fh})` : undefined, transformOrigin: 'center', background: inv || v.card ? '#ffffff' : 'transparent', borderRadius: v.radius, padding: inv || v.card ? '16px 20px' : 0, boxShadow: inv || v.card ? '0 10px 40px -12px rgba(20,18,14,0.3)' : 'none', maxHeight: (visEdit || visMoved) ? undefined : (visPos === 'full' ? 520 : 460), overflow: (visEdit || visMoved) ? 'visible' : 'hidden' }}>
          <window.Diagram visual={slide.visual} editable={visEdit} onPatch={visEdit ? onVisPatch : undefined} />
          {visEdit && VisFrame ? <VisFrame fw={vv.fw} fh={vv.fh} accent={acc} onStart={onVisEdit} /> : null}
        </div>
      </div>
    ) : null;

    let bodyArea;
    if (conf.body === 'none' && visPos === 'none') bodyArea = null;
    else if (visPos === 'full') bodyArea = visEl;
    else if (visPos === 'none') bodyArea = <div style={{ flex: 1, minHeight: 0 }}>{bodyEl(slide.visual ? 16 : 18)}</div>;
    else if (visPos === 'bottom') bodyArea = (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18, minHeight: 0 }}>
        <div style={{ flex: '0 0 34%' }}>{bodyEl(14)}</div>
        {visEl}
      </div>
    );
    else {
      const parts = [<div key="b" style={{ flex: '0 0 40%', minWidth: 0 }}>{bodyEl(15)}</div>, <React.Fragment key="v">{visEl}</React.Fragment>];
      if (flip || visPos === 'left') parts.reverse();
      bodyArea = <div style={{ flex: 1, display: 'flex', gap: 44, minHeight: 0, alignItems: 'stretch' }}>{parts}</div>;
    }

    const titleStyle = { fontFamily: v.headFont, fontWeight: 700, letterSpacing: '-0.5px', color: fg };
    const accents = [];
    if (!inv) {
      if (A === 'bar') accents.push(<div key="a" style={{ position: 'absolute', left: 80, top: 52, width: 56, height: 7, background: v.accent, borderRadius: square ? 0 : 4 }}></div>);
      if (A === 'side') accents.push(<div key="a" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 16, background: v.accent }}></div>);
      if (A === 'bottom') accents.push(<div key="a" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 12, background: v.accent }}></div>);
      if (A === 'corner') accents.push(<div key="a" style={{ position: 'absolute', right: -110, top: -110, width: 320, height: 320, borderRadius: '50%', background: v.accent, opacity: 0.12 }}></div>);
      if (A === 'frame') accents.push(<div key="a" style={{ position: 'absolute', inset: 26, border: `2px solid ${v.accent}`, borderRadius: square ? 0 : 10, pointerEvents: 'none' }}></div>);
      if (A === 'half') accents.push(<div key="a" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 430, background: v.look === 'dark' ? 'rgba(255,255,255,0.06)' : v.soft }}></div>);
    }
    if (tm === 'band') accents.push(<div key="band" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 124, background: inv ? 'rgba(255,255,255,0.16)' : v.accent }}></div>);

    const pad = A === 'frame' ? '64px 96px 70px' : A === 'side' ? '52px 80px 56px 104px' : '52px 80px 56px';
    let inner;
    if (tm === 'hero') {
      inner = (
        <div style={{ position: 'absolute', inset: pad, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ ...titleStyle, fontSize: 64, lineHeight: 1.1, maxWidth: 1020 }}>{T()}</div>
          {bodyArea ? <div style={{ marginTop: 34, width: '100%', maxWidth: 980, flex: '0 1 auto', minHeight: 0, maxHeight: '46%' }}>{bodyArea}</div> : null}
        </div>
      );
    } else if (tm === 'left') {
      inner = (
        <div style={{ position: 'absolute', inset: pad, display: 'flex', gap: 56 }}>
          <div style={{ flex: '0 0 320px', display: 'flex', alignItems: 'center' }}>
            <div style={{ ...titleStyle, fontSize: 46, lineHeight: 1.12 }}>{T()}</div>
          </div>
          {bodyArea}
        </div>
      );
    } else if (tm === 'center') {
      inner = (
        <div style={{ position: 'absolute', inset: pad, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ ...titleStyle, fontSize: 44, textAlign: 'center', marginTop: conf.body === 'quote' ? 4 : 8 }}>{T()}</div>
          <div style={{ flex: 1, minHeight: 0, maxWidth: 1060, width: '100%', margin: '0 auto' }}>{bodyArea}</div>
        </div>
      );
    } else if (tm === 'band') {
      inner = (
        <div style={{ position: 'absolute', inset: pad, paddingTop: 0, top: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 124, display: 'flex', alignItems: 'center', flex: '0 0 124px' }}>
            <div style={{ ...titleStyle, fontSize: 40, color: '#ffffff' }}>{T()}</div>
          </div>
          <div style={{ flex: 1, minHeight: 0, paddingTop: 28, paddingBottom: 8 }}>{bodyArea}</div>
        </div>
      );
    } else {
      const huge = tm === 'huge';
      inner = (
        <div style={{ position: 'absolute', inset: pad, display: 'flex', flexDirection: 'column' }}>
          <div style={{ ...titleStyle, fontSize: huge ? 60 : 40, lineHeight: 1.08, maxWidth: huge ? 1000 : undefined, marginTop: A === 'bar' ? 26 : 0, marginBottom: 6 }}>{T()}</div>
          <div style={{ flex: 1, minHeight: 0, marginTop: huge ? 26 : 14 }}>{bodyArea}</div>
        </div>
      );
    }

    return (
      <React.Fragment>
        {accents}
        {inner}
        {pageNo ? (
          <div style={{ position: 'absolute', left: 80, right: 80, bottom: 20, display: 'flex', justifyContent: 'space-between', fontSize: 14, color: sub, fontFamily: F }}>
            <span>{docTitle}</span>
            <span>{pageNo}{total ? ' / ' + total : ''}</span>
          </div>
        ) : null}
      </React.Fragment>
    );
  }

  // ---------- tiny schematic thumbnail for the picker ----------
  function Thumb({ conf }) {
    const acc = '#4953b8', grey = '#c9c5bd';
    const els = [];
    const inv = !!conf.invert;
    if (conf.accent === 'side') els.push(<span key="as" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: acc }}></span>);
    if (conf.accent === 'bottom') els.push(<span key="ab" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: acc }}></span>);
    if (conf.accent === 'corner') els.push(<span key="ac" style={{ position: 'absolute', right: -10, top: -10, width: 26, height: 26, borderRadius: '50%', background: acc, opacity: 0.25 }}></span>);
    if (conf.accent === 'frame') els.push(<span key="af" style={{ position: 'absolute', inset: 3, border: `1px solid ${acc}`, borderRadius: 2 }}></span>);
    if (conf.accent === 'half') els.push(<span key="ah" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '38%', background: acc, opacity: 0.13 }}></span>);
    const tm = conf.title || 'top';
    const tcol = inv ? '#fff' : '#3a362f';
    if (tm === 'band') els.push(<span key="t" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 9, background: acc }}></span>);
    else if (tm === 'hero') els.push(<span key="t" style={{ position: 'absolute', left: '26%', right: '26%', top: conf.body === 'none' ? '42%' : '30%', height: 6, background: tcol, borderRadius: 2 }}></span>);
    else if (tm === 'left') els.push(<span key="t" style={{ position: 'absolute', left: 8, top: '40%', width: 18, height: 5, background: tcol, borderRadius: 2 }}></span>);
    else if (tm === 'center') els.push(<span key="t" style={{ position: 'absolute', left: '32%', right: '32%', top: 7, height: 5, background: tcol, borderRadius: 2 }}></span>);
    else els.push(<span key="t" style={{ position: 'absolute', left: 8, top: 7, width: tm === 'huge' ? 42 : 30, height: tm === 'huge' ? 7 : 5, background: tcol, borderRadius: 2 }}></span>);

    const bx = tm === 'left' ? 34 : 8;
    const by = tm === 'band' || tm === 'center' ? 20 : tm === 'huge' ? 22 : 19;
    const lc = inv ? 'rgba(255,255,255,0.8)' : grey;
    const b = conf.body;
    if (b === 'none') { /* title-only layout */ }
    else if (b === 'sublines') [0, 1].forEach((k) => els.push(<span key={'sl' + k} style={{ position: 'absolute', left: `${33 + k * 5}%`, right: `${33 + k * 5}%`, top: by + 11 + k * 7, height: 3, background: lc, borderRadius: 2 }}></span>));
    else if (b === 'cards') [0, 1, 2].forEach((k) => els.push(<span key={'c' + k} style={{ position: 'absolute', left: bx + k * 18, top: by, width: 14, height: 16, background: inv ? 'rgba(255,255,255,0.3)' : '#e7e3da', borderRadius: 2 }}></span>));
    else if (b === 'stats') [0, 1, 2].forEach((k) => els.push(<span key={'s' + k} style={{ position: 'absolute', left: bx + 4 + k * 18, top: by, width: 9, height: 9, background: acc, borderRadius: 1 }}></span>));
    else if (b === 'steps') [0, 1, 2, 3].forEach((k) => els.push(<span key={'p' + k} style={{ position: 'absolute', left: bx + 2 + k * 15, top: by + 4, width: 7, height: 7, borderRadius: '50%', background: acc }}></span>));
    else if (b === 'quote') els.push(<span key="q" style={{ position: 'absolute', left: 0, right: 0, top: by - 2, textAlign: 'center', fontSize: 20, fontWeight: 800, color: acc, lineHeight: 1 }}>“</span>);
    else if (b === 'twocol') [0, 1].forEach((c) => [0, 1, 2].forEach((k) => els.push(<span key={'t' + c + k} style={{ position: 'absolute', left: bx + c * 34, top: by + k * 7, width: 24, height: 3, background: lc, borderRadius: 2 }}></span>)));
    else if (b === 'feature') {
      els.push(<span key="f" style={{ position: 'absolute', left: bx, top: by, width: 22, height: 18, background: inv ? 'rgba(255,255,255,0.3)' : '#e7e3da', borderRadius: 2, borderLeft: `2px solid ${acc}` }}></span>);
      [0, 1, 2].forEach((k) => els.push(<span key={'fl' + k} style={{ position: 'absolute', left: bx + 30, top: by + 1 + k * 7, width: 30, height: 3, background: lc, borderRadius: 2 }}></span>));
    } else {
      [0, 1, 2].forEach((k) => els.push(
        <span key={'l' + k} style={{ position: 'absolute', left: bx, top: by + k * 8, width: b === 'agenda' ? 64 : 46, height: 3.5, background: lc, borderRadius: 2 }}>
          {(b === 'numbered' || b === 'checklist' || b === 'bullets' || b === undefined) ? <span style={{ position: 'absolute', left: -6, top: 0, width: 4, height: 4, background: acc, borderRadius: b === 'checklist' ? 1 : '50%' }}></span> : null}
        </span>
      ));
    }
    if (conf.visPos === 'right') els.push(<span key="v" style={{ position: 'absolute', right: 8, top: by, width: 24, height: 22, border: `1.5px solid ${acc}`, borderRadius: 3 }}></span>);
    if (conf.visPos === 'full') els.push(<span key="v" style={{ position: 'absolute', left: '28%', right: '28%', top: by - 1, height: 24, border: `1.5px solid ${acc}`, borderRadius: 3 }}></span>);
    return <span className="lay-thumb" style={{ background: inv ? acc : '#fff' }}>{els}</span>;
  }

  window.GlyphDeckLayouts = { CATS, byId, LayoutSlide, Thumb };
})();
