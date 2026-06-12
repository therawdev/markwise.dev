// Glyph — editor: text blocks, visual blocks, sample document, floating visualize button
(function () {
  const { useEffect, useRef, useState } = React;

  // ---------- sample document ----------
  function sampleBlocks() {
    return [
      { id: 'b1', kind: 'text', tag: 'h1', html: 'Orbit 2.0 Launch Plan' },
      { id: 'b2', kind: 'text', tag: 'p', html: 'Orbit 2.0 is our biggest release since the original launch: a rebuilt editor, shared workspaces, and an automation engine. This document is the single source of truth for the go-to-market plan. <b>Select any passage and press ✦ Visualize</b> to turn it into a diagram.' },
      { id: 'b3', kind: 'text', tag: 'h2', html: 'Launch phases' },
      { id: 'b4', kind: 'text', tag: 'p', html: 'The launch unfolds in four phases. Private beta opens in July to 200 design partners. Early access follows in August with self-serve signup and referral invites. General availability lands on September 15 alongside the new pricing. The expansion phase runs through Q4, adding enterprise SSO and EU data residency.' },
      {
        id: 'bv1', kind: 'visual', visual: {
          id: 'bv1', type: 'timeline', style: 'clean', palette: 0,
          source: 'The launch unfolds in four phases. Private beta opens in July to 200 design partners. Early access follows in August with self-serve signup. General availability lands on September 15 alongside the new pricing. The expansion phase runs through Q4, adding enterprise SSO and EU data residency.',
          spec: {
            title: 'Launch phases', best: ['timeline', 'flow', 'list'],
            items: [
              { label: 'Private beta', detail: '200 design partners', value: 'July' },
              { label: 'Early access', detail: 'Self-serve signup opens', value: 'Aug' },
              { label: 'General availability', detail: 'Launches with new pricing', value: 'Sep 15' },
              { label: 'Expansion', detail: 'Enterprise SSO, EU residency', value: 'Q4' },
            ],
          },
        },
      },
      { id: 'b5', kind: 'text', tag: 'h2', html: 'Channel strategy' },
      { id: 'b6', kind: 'text', tag: 'p', html: 'We run two motions side by side. The paid motion covers search ads, newsletter sponsorships, and retargeting against trial drop-offs. The organic motion leans on the public changelog, founder posts, the community Slack, and a launch-week livestream. Paid buys reach; organic builds trust.' },
      { id: 'b7', kind: 'text', tag: 'h2', html: 'Success metrics' },
      { id: 'b8', kind: 'text', tag: 'p', html: 'We are targeting 10,000 signups in the first 30 days, a 25% activation rate within the first week, 1,200 paying teams by December, and an NPS above 50 from the beta cohort.' },
      { id: 'b9', kind: 'text', tag: 'h2', html: 'Risks' },
      { id: 'b10', kind: 'text', tag: 'p', html: 'Three risks could slow us down. Migration friction from Orbit 1.x workspaces, a crowded September release calendar, and support load from the pricing change. Each has an owner and a mitigation plan in the appendix.' },
    ];
  }

  // ---------- text block (uncontrolled contenteditable) ----------
  const TextBlock = React.memo(
    function TextBlock({ block, onHtml, onKey }) {
      const ref = useRef(null);
      useEffect(() => {
        if (ref.current && ref.current.innerHTML !== block.html) ref.current.innerHTML = block.html;
        if (block.autoFocus && ref.current) ref.current.focus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [block.id, block.tag]);
      return React.createElement(block.tag, {
        className: 'tb tb-' + block.tag,
        'data-block-id': block.id,
        contentEditable: true,
        suppressContentEditableWarning: true,
        spellCheck: false,
        ref,
        onInput: (e) => onHtml(block.id, e.currentTarget.innerHTML),
        onKeyDown: (e) => onKey && onKey(block.id, e),
      });
    },
    (a, b) => a.block.id === b.block.id && a.block.tag === b.block.tag
  );

  // a gallery exists if the type has variants or same-category siblings
  function hasGallery(type) {
    if ((((window.DIAGRAMS[type] || {}).variants) || []).length) return true;
    const cat = (window.TYPE_CATEGORIES || []).find((c) => c.types.indexOf(type) !== -1);
    return !!(cat && cat.types.filter((t) => t !== type && window.DIAGRAMS[t]).length);
  }

  // ---------- visual block ----------
  function VisualBlock({ block, baseVisual, selected, onSelect, onExport, onDelete, onPatch, onPreviewVariant }) {
    const v = block.visual;
    const ref = useRef(null);
    const [showLayouts, setShowLayouts] = useState(false);
    const [showStyle, setShowStyle] = useState(false);
    const QUICK_COLORS = [
      { id: 'multi', name: 'Multicolor', pal: 7, bg: 'linear-gradient(135deg, oklch(0.51 0.155 262) 0% 33%, oklch(0.51 0.155 155) 33% 66%, oklch(0.51 0.155 30) 66% 100%)' },
      { id: 'blue', name: 'Single blue', pal: 0, bg: 'oklch(0.51 0.155 262)' },
      { id: 'black', name: 'Black', pal: 4, bg: '#2b2925' },
      { id: 'white', name: 'White (outline)', bg: '#fff' },
    ];
    const quickActive = (q) => (q.id === 'white' ? v.style === 'outline' : v.palette === q.pal && v.style !== 'outline');
    const applyQuick = (q) => {
      if (q.id === 'white') onPatch({ style: 'outline' });
      else onPatch(Object.assign({ palette: q.pal }, v.style === 'outline' ? { style: 'clean' } : {}));
      setShowStyle(false);
    };
    const startResize = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const fig = ref.current;
      if (!fig || !fig.parentElement) return;
      const fr = fig.getBoundingClientRect();
      // derive the %-resolution base from the figure's own current width — exact for any box model
      const curPct = parseFloat(fig.style.width) || (v.width || 100);
      const pw = (fr.width * 100) / curPct;
      const start = fr.width;
      const wrap = fig.querySelector('.dg-wrap');
      const svgEl = wrap && wrap.querySelector('svg');
      const wr = wrap ? wrap.getBoundingClientRect() : null;
      const hsc0 = v.hscale || 1;
      const sx = e.clientX, sy = e.clientY;
      // horizontal drag → width %, vertical drag → independent height stretch
      const calcW = (ev) => Math.min(100, Math.max(38, ((start + (ev.clientX - sx)) / pw) * 100));
      const calcH = (ev) => (wr ? Math.min(3, Math.max(0.5, (hsc0 * (wr.height + (ev.clientY - sy))) / Math.max(1, wr.height))) : hsc0);
      const move = (ev) => {
        fig.style.width = calcW(ev) + '%';
        if (wrap && wr) {
          const baseAspect = (wr.width / Math.max(1, wr.height)) * hsc0; // undistorted aspect
          wrap.style.aspectRatio = String(baseAspect / calcH(ev));
          if (svgEl) { svgEl.setAttribute('preserveAspectRatio', 'none'); svgEl.style.height = '100%'; }
        }
      };
      const up = (ev) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (wrap) wrap.style.aspectRatio = '';
        onPatch({ width: Math.round(calcW(ev)), hscale: Math.round(calcH(ev) * 100) / 100 });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    return (
      <figure
        ref={ref}
        className={'vis-block' + (selected ? ' selected' : '')}
        style={{ width: (v.width || 100) + '%' }}
        data-block-id={block.id}
        contentEditable={false}
        onClick={(e) => { e.stopPropagation(); }}
      >
        <window.Diagram visual={v} editable={true} onPatch={onPatch} onOpenPanel={() => onSelect(v.id)} />
        {showLayouts ? (
          <window.GlyphVariants.VariantGallery
            visual={baseVisual || v}
            onPick={(p) => onPatch(p.type ? { type: p.type, variant: null } : { variant: p.variant })}
            onPreview={onPreviewVariant}
            onClose={() => setShowLayouts(false)}
          />
        ) : null}
        {showStyle ? (
          <div className="style-pop" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            {QUICK_COLORS.map((q) => (
              <button key={q.id} className={'style-pop-btn' + (quickActive(q) ? ' on' : '')} onClick={() => applyQuick(q)}>
                <span className="style-dot" style={{ background: q.bg, border: q.id === 'white' ? '1px solid #c9c5bd' : 'none' }}></span>
                {q.name}
              </button>
            ))}
            <button className="style-pop-btn more" onClick={() => { setShowStyle(false); onSelect(v.id); }}>More styles…</button>
          </div>
        ) : null}
        <span className="vis-resize" title="Drag to resize" onPointerDown={startResize}></span>
        <figcaption className="vis-toolbar" onClick={(e) => e.stopPropagation()}>
          {hasGallery(v.type) ? <button onClick={() => { setShowStyle(false); setShowLayouts((s) => !s); }}>Layouts</button> : null}
          <button onClick={() => { setShowLayouts(false); setShowStyle((s) => !s); }}>Style</button>
          <button onClick={() => onSelect(v.id)}>Edit</button>
          <button onClick={() => onExport(v.id)}>Export</button>
          <button className="del" onClick={() => onDelete(block.id)}>Delete</button>
        </figcaption>
      </figure>
    );
  }

  // ---------- floating visualize button ----------
  function Fab({ fab, onClick }) {
    if (!fab) return null;
    const x = Math.min(Math.max(fab.x, 90), window.innerWidth - 90);
    return (
      <button
        className="fab"
        style={{ left: x, top: Math.max(fab.y, 70) }}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
      >
        <span className="fab-spark">✦</span> Visualize
      </button>
    );
  }

  function HintPill({ onDismiss }) {
    return (
      <div className="hint-pill">
        <span><b>Tip:</b> highlight text → <span className="hint-accent">✦ Visualize</span>. Drag any shape or label on a visual to fine-tune it.</span>
        <button className="icon-btn sm" onClick={onDismiss} aria-label="Dismiss tip">✕</button>
      </div>
    );
  }

  window.GlyphEditor = { sampleBlocks, TextBlock, VisualBlock, Fab, HintPill };
})();
