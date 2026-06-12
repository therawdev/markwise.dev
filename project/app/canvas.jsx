// Glyph — Canvas: a pannable, zoomable board of all the document's visuals as draggable cards
(function () {
  const { useState, useRef, useEffect, useCallback } = React;

  const CARD_W = 404, GAPX = 60, GAPY = 56, COLS = 3, ROW_H = 320;
  const LS_VIEW = 'glyph-canvas-view-v1';

  function loadView() {
    try { const v = JSON.parse(localStorage.getItem(LS_VIEW)); if (v && typeof v.scale === 'number') return v; } catch (e) { /* ignore */ }
    return { tx: 80, ty: 70, scale: 0.9 };
  }

  function defaultPos(i) {
    return { x: (i % COLS) * (CARD_W + GAPX), y: Math.floor(i / COLS) * (ROW_H + GAPY) };
  }

  function Canvas({ blocks, rawBlocks, selVis, onSelect, onPatch, onExport, onDelete, onPreviewVariant }) {
    const visuals = blocks.filter((b) => b.kind === 'visual');
    const rawVisual = (id) => {
      const rb = (rawBlocks || blocks).find((b) => b.kind === 'visual' && b.visual.id === id);
      return rb ? rb.visual : null;
    };
    const [view, setView] = useState(loadView);
    const [layoutsFor, setLayoutsFor] = useState(null); // visual id with open layout gallery
    const [dragPos, setDragPos] = useState(null); // { id, x, y } while dragging a card
    const [resz, setResz] = useState(null); // { id, w } while resizing a card
    const viewRef = useRef(view); viewRef.current = view;
    const blocksRef = useRef(blocks); blocksRef.current = blocks;
    const drag = useRef(null);

    useEffect(() => { try { localStorage.setItem(LS_VIEW, JSON.stringify(view)); } catch (e) { /* ignore */ } }, [view]);

    const savedPos = (v, i) => (v.layout && v.layout.canvas) ? v.layout.canvas : defaultPos(i);
    const posOf = (v, i) => (dragPos && dragPos.id === v.id) ? dragPos : savedPos(v, i);
    const widthOf = (v) => (resz && resz.id === v.id) ? resz.w : ((v.layout && v.layout.canvas && v.layout.canvas.w) || CARD_W);

    const onMove = useCallback((e) => {
      const d = drag.current; if (!d) return;
      if (d.type === 'pan') {
        setView((vw) => ({ ...vw, tx: d.ox + (e.clientX - d.sx), ty: d.oy + (e.clientY - d.sy) }));
      } else if (d.type === 'resize') {
        const s = viewRef.current.scale;
        const w = Math.min(760, Math.max(260, d.w0 + (e.clientX - d.sx) / s));
        d.last = w;
        if (d.wrapEl && d.wrapH) {
          const hsc2 = Math.min(3, Math.max(0.5, (d.hsc0 * (d.wrapH + (e.clientY - d.sy))) / d.wrapH));
          d.lastH = hsc2;
          d.wrapEl.style.aspectRatio = String(d.baseAspect / hsc2);
          const sv = d.wrapEl.querySelector('svg');
          if (sv) { sv.setAttribute('preserveAspectRatio', 'none'); sv.style.height = '100%'; }
        }
        setResz({ id: d.id, w });
      } else {
        const s = viewRef.current.scale;
        d.moved = true;
        setDragPos({ id: d.id, x: d.ox + (e.clientX - d.sx) / s, y: d.oy + (e.clientY - d.sy) / s });
      }
    }, []);
    const onUp = useCallback(() => {
      const d = drag.current;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (d && d.type === 'resize') {
        const b = blocksRef.current.find((x) => x.kind === 'visual' && x.visual.id === d.id);
        const layout = (b && b.visual.layout) || {};
        if (d.wrapEl) d.wrapEl.style.aspectRatio = '';
        const patch = { layout: { ...layout, canvas: { ...d.pos, w: Math.round(d.last) } } };
        if (d.lastH != null) patch.hscale = Math.round(d.lastH * 100) / 100;
        onPatch(d.id, patch);
      } else if (d && d.type === 'card' && d.moved) {
        const b = blocksRef.current.find((x) => x.kind === 'visual' && x.visual.id === d.id);
        const layout = (b && b.visual.layout) || {};
        const dp = drag.current.last || null;
        if (dp) onPatch(d.id, { layout: { ...layout, canvas: { x: Math.round(dp.x), y: Math.round(dp.y) } } });
      }
      drag.current = null;
      setDragPos(null);
      setResz(null);
    }, [onMove, onPatch]);

    // keep last drag pos for commit
    useEffect(() => { if (drag.current && dragPos) drag.current.last = { x: dragPos.x, y: dragPos.y }; }, [dragPos]);

    const startPan = (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.cv-card') || e.target.closest('.cv-controls')) return;
      onSelect(null);
      drag.current = { type: 'pan', sx: e.clientX, sy: e.clientY, ox: view.tx, oy: view.ty };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };
    const startCardDrag = (e, v, i) => {
      if (e.button !== 0) return;
      if (e.target.closest('.cv-card-tools') || e.target.closest('.cv-resize')) return;
      if (e.target.closest('.dg-wrap')) return; // svg area: element drags + marquee select live here
      e.stopPropagation();
      onSelect(v.id);
      const p = savedPos(v, i);
      drag.current = { type: 'card', id: v.id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false, last: p };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };

    const startResize = (e, v, i) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      onSelect(v.id);
      const w0 = widthOf(v);
      const card = e.target.closest('.cv-card');
      const wrapEl = card ? card.querySelector('.dg-wrap') : null;
      const wr = wrapEl ? wrapEl.getBoundingClientRect() : null;
      const hsc0 = v.hscale || 1;
      drag.current = {
        type: 'resize', id: v.id, sx: e.clientX, sy: e.clientY, w0, last: w0, pos: savedPos(v, i),
        wrapEl, wrapH: wr ? wr.height : 0, hsc0, lastH: null,
        baseAspect: wr ? (wr.width / Math.max(1, wr.height)) * hsc0 : 1,
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };

    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        setView((vw) => {
          const ns = Math.min(2, Math.max(0.3, vw.scale * (e.deltaY < 0 ? 1.1 : 0.9)));
          const k = ns / vw.scale;
          return { scale: ns, tx: mx - (mx - vw.tx) * k, ty: my - (my - vw.ty) * k };
        });
      } else {
        setView((vw) => ({ ...vw, tx: vw.tx - e.deltaX, ty: vw.ty - e.deltaY }));
      }
    };

    const zoomBy = (f) => setView((vw) => {
      const ns = Math.min(2, Math.max(0.3, vw.scale * f));
      const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
      const k = ns / vw.scale;
      return { scale: ns, tx: cx - (cx - vw.tx) * k, ty: cy - (cy - vw.ty) * k };
    });
    const tidy = () => {
      visuals.forEach((b, i) => {
        const layout = b.visual.layout || {};
        const prev = layout.canvas || {};
        onPatch(b.visual.id, { layout: { ...layout, canvas: { ...defaultPos(i), w: prev.w } } });
      });
      setView((vw) => ({ ...vw, tx: 80, ty: 70 }));
    };

    return (
      <div className="cv-surface" data-screen-label="Canvas" onMouseDown={startPan} onWheel={onWheel}>
        {visuals.length === 0 ? (
          <div className="cv-empty">
            <div className="cv-empty-card">
              <div className="cv-empty-mark">✦</div>
              <b>Your canvas is empty</b>
              <p>Switch to <strong>Doc</strong>, highlight a passage, and press ✦ Visualize. Every visual you create lands here to arrange freely.</p>
            </div>
          </div>
        ) : null}
        <div className="cv-world" style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }}>
          {visuals.map((b, i) => {
            const v = b.visual;
            const p = posOf(v, i);
            return (
              <div
                key={b.id}
                className={'cv-card' + (selVis === v.id ? ' sel' : '') + (dragPos && dragPos.id === v.id ? ' dragging' : '')}
                style={{ left: p.x, top: p.y, width: widthOf(v) }}
                onMouseDown={(e) => startCardDrag(e, v, i)}
              >
                <div className="cv-card-head">
                  <span className="cv-card-title">{v.spec.title || 'Untitled'}</span>
                  <span className="cv-card-tools">
                    <button title="Layouts" onClick={(e) => { e.stopPropagation(); setLayoutsFor(layoutsFor === v.id ? null : v.id); }}>▦</button>
                    <button title="Edit" onClick={(e) => { e.stopPropagation(); onSelect(v.id); }}>✎</button>
                    <button title="Export" onClick={(e) => { e.stopPropagation(); onExport(v.id); }}>⤓</button>
                    <button title="Delete" className="del" onClick={(e) => { e.stopPropagation(); onDelete(b.id); }}>✕</button>
                  </span>
                </div>
                <div className="cv-card-body"><window.Diagram visual={v} editable={true} onPatch={(patch) => onPatch(v.id, patch)} onOpenPanel={() => onSelect(v.id)} /></div>
                {layoutsFor === v.id ? (
                  <window.GlyphVariants.VariantGallery
                    visual={rawVisual(v.id) || v}
                    onPick={(p) => onPatch(v.id, p.type ? { type: p.type, variant: null } : { variant: p.variant })}
                    onPreview={(p) => onPreviewVariant && onPreviewVariant(v.id, p)}
                    onClose={() => setLayoutsFor(null)}
                  />
                ) : null}
                <span className="cv-resize" title="Drag to resize" onMouseDown={(e) => startResize(e, v, i)}></span>
              </div>
            );
          })}
        </div>
        <div className="cv-controls">
          <button className="cv-ctl" title="Tidy into a grid" onClick={tidy}>⊞ Tidy</button>
          <span className="cv-zoom">
            <button className="cv-ctl icon" title="Zoom out" onClick={() => zoomBy(0.85)}>−</button>
            <span className="cv-zoom-val" title="Reset zoom" onClick={() => setView({ tx: 80, ty: 70, scale: 0.9 })}>{Math.round(view.scale * 100)}%</span>
            <button className="cv-ctl icon" title="Zoom in" onClick={() => zoomBy(1.18)}>+</button>
          </span>
        </div>
      </div>
    );
  }

  window.GlyphCanvas = { Canvas };
})();
