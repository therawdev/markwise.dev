// Glyph — interactive <Diagram>: select items, sub-texts, graphics, notes, arrows — singly,
// shift-click multi, or marquee drag. Floating toolbar applies color/size/move to the whole selection.
(function () {
  const { PALETTES, mk, hashStr, hueSet } = window.GlyphDraw;
  const { useState, useRef, useEffect } = React;

  const norm = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').replace(/…/g, '').trim().toLowerCase();

  function textContent(el) {
    if (el == null || el === false) return '';
    if (typeof el === 'string' || typeof el === 'number') return String(el);
    if (Array.isArray(el)) return el.map(textContent).join(' ');
    if (el.props) return textContent(el.props.children);
    return '';
  }

  function classify(content, it, fallback) {
    const c = norm(content);
    const tryMatch = (t) => {
      const v = norm(t);
      return !!v && !!c && (c === v || c.startsWith(v) || (c.length > 3 && v.startsWith(c)));
    };
    if (tryMatch(it.label)) return 'label';
    if (tryMatch(it.value)) return 'value';
    if (tryMatch(it.detail)) return 'detail';
    return fallback;
  }

  const HUES = [262, 155, 45, 320, 210, 350, 30];
  const hueColor = (h) => (h === 'ink' ? '#2b2925' : `oklch(0.51 0.155 ${h})`);
  const clampSc = (v) => Math.round(Math.min(3, Math.max(0.3, v)) * 100) / 100;
  const dkey = (d) => d.kind + ':' + (d.kind === 'item' ? d.i : d.kind === 'sub' ? d.i + ':' + d.sub : d.kind === 'gfx' ? d.key : d.id);
  const layoutKeyOf = (d) => (d.kind === 'item' ? 'it:' + d.i : d.kind === 'sub' ? 'sub:' + d.i + ':' + d.sub : d.kind === 'gfx' ? 'gfx:' + d.key : null);
  const scaleKeyOf = (d) => (d.kind === 'sub' ? 'scsub:' + d.i + ':' + d.sub : d.kind === 'gfx' ? 'scgfx:' + d.key : null);

  function Diagram({ visual, className, editable, onPatch, onOpenPanel }) {
    const svgRef = useRef(null);
    const draggedRef = useRef(false);
    const [drag, setDrag] = useState(null);       // { dx, dy, keys:[], noteIds:[], arrowIds:[] }
    const [sels, setSels] = useState([]);         // array of descriptors
    const [pop, setPop] = useState(null);         // 'color' | 'text' | 'size' | 'line'
    const [boxes, setBoxes] = useState([]);       // px boxes of selected elements
    const [liveSc, setLiveSc] = useState(null);   // live scale factor while corner-dragging
    const [mq, setMq] = useState(null);           // marquee rect {x0,y0,x1,y1}
    const layout = visual.layout || {};
    const sel = sels.length === 1 ? sels[0] : null;
    const isSel = (d) => sels.some((x) => dkey(x) === dkey(d));

    const off = (key) => {
      const base = layout[key] || [0, 0];
      if (drag && drag.keys && drag.keys.indexOf(key) !== -1) return [base[0] + drag.dx, base[1] + drag.dy];
      return base;
    };
    const liveFor = (d) => (liveSc != null && isSel(d) ? liveSc : 1);
    // when group-resizing, each element's center must also move relative to the union center
    const boxOf = (d) => boxes.find((b) => b.k === dkey(d));
    const unionOf = (bs) => {
      if (!bs.length) return null;
      const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
      const x1 = Math.max(...bs.map((b) => b.x + b.w)), y1 = Math.max(...bs.map((b) => b.y + b.h));
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, wrapW: bs.wrapW };
    };
    const groupOffset = (d, f) => {
      if (sels.length < 2 || f === 1) return [0, 0];
      const b = boxOf(d);
      const u2 = unionOf(boxes);
      if (!b || !u2 || !boxes.wrapW) return [0, 0];
      const k = 720 / boxes.wrapW;
      return [
        (b.x + b.w / 2 - (u2.x + u2.w / 2)) * k * (f - 1),
        (b.y + b.h / 2 - (u2.y + u2.h / 2)) * k * (f - 1),
      ];
    };
    const liveOffset = (d) => (liveSc == null || !isSel(d) ? [0, 0] : groupOffset(d, liveSc));

    const basePal = PALETTES[visual.palette || 0] || PALETTES[0];
    const pal = Object.assign({}, basePal, { _items: visual.spec.items });
    const D = mk(visual.style || 'clean', hashStr(visual.id + visual.type) || 7, visual.conn);
    const r = window.DIAGRAMS[visual.type] || window.DIAGRAMS.flow;
    let out;
    try {
      const specV = visual.variant ? Object.assign({}, visual.spec, { variant: visual.variant }) : visual.spec;
      out = r.render(specV, D, pal);
    } catch (e) {
      out = { h: 120, el: [<text key="e" x={24} y={60} fontSize={14} fill="#a33">Could not render this layout</text>] };
    }

    useEffect(() => { setSels([]); setPop(null); }, [visual.id]);

    // measure all selected elements
    useEffect(() => {
      if (!sels.length || !editable) { setBoxes([]); return; }
      const svg = svgRef.current;
      if (!svg) { setBoxes([]); return; }
      const find = (d) => (d.kind === 'item' ? svg.querySelector(`g[data-it="${d.i}"]`)
        : d.kind === 'sub' ? svg.querySelector(`[data-sub="${d.i}:${d.sub}"]`)
        : d.kind === 'gfx' ? svg.querySelector(`g[data-gfx="${CSS.escape(d.key)}"]`)
        : d.kind === 'note' ? svg.querySelector(`g[data-note="${d.id}"]`)
        : svg.querySelector(`g[data-ar="${d.id}"]`));
      try {
        const sr = svg.getBoundingClientRect();
        const bs = [];
        sels.forEach((d) => {
          const el = find(d);
          if (!el) return;
          const er = el.getBoundingClientRect();
          bs.push({ x: er.x - sr.x, y: er.y - sr.y, w: er.width, h: er.height, k: dkey(d) });
        });
        if (!bs.length) { setSels([]); setBoxes([]); return; }
        bs.wrapW = sr.width;
        setBoxes(bs);
      } catch (e) { setBoxes([]); }
    }, [sels, visual, editable]);

    const pick = (e, desc) => {
      if (!editable) return;
      e.stopPropagation();
      if (draggedRef.current) return;
      setPop(null);
      setSels((cur) => {
        if (e.shiftKey && cur.length) {
          const k = dkey(desc);
          return cur.some((d) => dkey(d) === k) ? cur.filter((d) => dkey(d) !== k) : [...cur, desc];
        }
        return [desc];
      });
    };

    // drag one element — or the whole selection if the dragged element is part of it
    function startDrag(e, desc) {
      if (!editable || e.button === 2) return;
      e.preventDefault();
      e.stopPropagation();
      const svg = svgRef.current;
      const scale = svg ? 720 / svg.getBoundingClientRect().width : 1;
      const group = isSel(desc) && sels.length > 1 ? sels : [desc];
      const keys = group.map(layoutKeyOf).filter(Boolean);
      const noteIds = group.filter((d) => d.kind === 'note').map((d) => d.id);
      const arrowIds = group.filter((d) => d.kind === 'arrow').map((d) => d.id);
      const sx = e.clientX, sy = e.clientY;
      const move = (ev) => setDrag({ dx: (ev.clientX - sx) * scale, dy: (ev.clientY - sy) * scale, keys, noteIds, arrowIds });
      const up = (ev) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setDrag(null);
        const dx = (ev.clientX - sx) * scale, dy = (ev.clientY - sy) * scale;
        draggedRef.current = !(Math.abs(dx) < 2 && Math.abs(dy) < 2);
        if (!draggedRef.current || !onPatch) return;
        const patch = {};
        if (keys.length) {
          const nl = { ...layout };
          keys.forEach((k) => { const b = nl[k] || [0, 0]; nl[k] = [Math.round(b[0] + dx), Math.round(b[1] + dy)]; });
          patch.layout = nl;
        }
        if (noteIds.length) patch.notes = (visual.notes || []).map((nt) => (noteIds.indexOf(nt.id) !== -1 ? { ...nt, x: nt.x + dx, y: nt.y + dy } : nt));
        if (arrowIds.length) patch.arrows = (visual.arrows || []).map((a) => (arrowIds.indexOf(a.id) !== -1 ? { ...a, x1: Math.round(a.x1 + dx), y1: Math.round(a.y1 + dy), x2: Math.round(a.x2 + dx), y2: Math.round(a.y2 + dy) } : a));
        onPatch(patch);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }

    // marquee select on empty background
    const startMarquee = (e) => {
      if (!editable || e.button !== 0 || e.target !== svgRef.current) return;
      const svg = svgRef.current;
      const sr = svg.getBoundingClientRect();
      const x0 = e.clientX - sr.x, y0 = e.clientY - sr.y;
      let last = { x0, y0, x1: x0, y1: y0 };
      const move = (ev) => { last = { x0, y0, x1: ev.clientX - sr.x, y1: ev.clientY - sr.y }; setMq(last); };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setMq(null);
        const w = Math.abs(last.x1 - last.x0), h = Math.abs(last.y1 - last.y0);
        if (w < 6 && h < 6) { draggedRef.current = false; return; }
        draggedRef.current = true;
        const sr2 = svg.getBoundingClientRect();
        const rx0 = Math.min(last.x0, last.x1) + sr2.x, ry0 = Math.min(last.y0, last.y1) + sr2.y;
        const rx1 = Math.max(last.x0, last.x1) + sr2.x, ry1 = Math.max(last.y0, last.y1) + sr2.y;
        const picked = [];
        const items2 = visual.spec.items || [];
        svg.querySelectorAll('g[data-it], g[data-gfx], g[data-note], g[data-ar]').forEach((el) => {
          const r2 = el.getBoundingClientRect();
          if (!(r2.right >= rx0 && r2.left <= rx1 && r2.bottom >= ry0 && r2.top <= ry1)) return;
          if (el.hasAttribute('data-it')) picked.push({ kind: 'item', i: +el.getAttribute('data-it') });
          else if (el.hasAttribute('data-gfx')) {
            const key = el.getAttribute('data-gfx');
            const mm = /^[a-zA-Z_]+?(\d*)$/.exec(key);
            picked.push({ kind: 'gfx', key, i: mm && mm[1] !== '' && items2[+mm[1]] ? +mm[1] : null });
          } else if (el.hasAttribute('data-note')) picked.push({ kind: 'note', id: el.getAttribute('data-note') });
          else picked.push({ kind: 'arrow', id: el.getAttribute('data-ar') });
        });
        setSels(picked);
        setPop(null);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };

    const items = visual.spec.items || [];

    function wrapTexts(el, it, i) {
      let order = 0;
      const walk = (node) => {
        if (!React.isValidElement(node)) return node;
        if (node.type === 'text') {
          const sub = classify(textContent(node.props.children), it, 't' + order);
          order++;
          const desc = { kind: 'sub', i, sub };
          const key = 'sub:' + i + ':' + sub;
          const [dx, dy] = off(key);
          const moved = dx || dy;
          const ssc = (layout['scsub:' + i + ':' + sub] || 1) * liveFor(desc);
          const [slx, sly] = liveOffset(desc);
          const tcol = layout['clsub:' + i + ':' + sub];
          const cloned = React.cloneElement(node, {
            'data-sub': i + ':' + sub,
            fill: tcol != null ? hueColor(tcol) : node.props.fill,
            transform: (node.props.transform ? node.props.transform + ' ' : '') + `translate(${dx + slx} ${dy + sly})`,
            style: Object.assign({}, node.props.style, editable ? { cursor: 'move', paintOrder: moved ? 'stroke' : undefined, stroke: moved ? 'rgba(255,255,255,0.85)' : undefined, strokeWidth: moved ? 3 : undefined } : null),
            onPointerDown: (e) => startDrag(e, desc),
            onClick: (e) => pick(e, desc),
          });
          return ssc !== 1 ? <g key={'ssw' + i + sub} style={{ transformBox: 'fill-box', transformOrigin: 'center', transform: `scale(${ssc})` }}>{cloned}</g> : cloned;
        }
        const kids = node.props && node.props.children;
        if (kids == null || typeof kids !== 'object') return node;
        return React.cloneElement(node, { children: React.Children.map(kids, walk) });
      };
      return walk(el);
    }

    const content = (out.el || []).map((el) => {
      if (!React.isValidElement(el)) return el;
      const key = el.key == null ? '' : String(el.key);
      if (el.type === 'clipPath' || key === '__t' || key === '__backdrop' || key === 'e') return el;
      const m = /^it(\d+)$/.exec(key);
      if (m) {
        const i = +m[1];
        const it = items[i] || {};
        const desc = { kind: 'item', i };
        const [dx, dy] = off('it:' + i);
        const sc = (it.scale || 1) * liveFor(desc);
        const [ilx, ily] = liveOffset(desc);
        const inner = wrapTexts(el, it, i);
        return (
          <g
            key={'w' + i}
            data-it={i}
            transform={`translate(${dx + ilx} ${dy + ily})`}
            style={editable ? { cursor: 'grab' } : undefined}
            onPointerDown={(e) => startDrag(e, desc)}
            onClick={(e) => pick(e, desc)}
          >
            {sc !== 1 ? <g style={{ transformBox: 'fill-box', transformOrigin: 'center', transform: `scale(${sc})` }}>{inner}</g> : inner}
          </g>
        );
      }
      const mi = /^([a-zA-Z_]+?)(\d*)$/.exec(key);
      if (!mi || !key) return el;
      const gi = mi[2] !== '' && items[+mi[2]] ? +mi[2] : null;
      const desc = { kind: 'gfx', key, i: gi };
      const [gdx, gdy] = off('gfx:' + key);
      const gsc = (layout['scgfx:' + key] || 1) * liveFor(desc);
      const [glx, gly] = liveOffset(desc);
      const inner2 = gsc !== 1 ? <g style={{ transformBox: 'fill-box', transformOrigin: 'center', transform: `scale(${gsc})` }}>{el}</g> : el;
      return (
        <g
          key={'wg' + key}
          data-gfx={key}
          transform={`translate(${gdx + glx} ${gdy + gly})`}
          style={editable ? { cursor: 'grab' } : undefined}
          onPointerDown={(e) => startDrag(e, desc)}
          onClick={(e) => pick(e, desc)}
        >
          {inner2}
        </g>
      );
    });

    function startArrowDrag(e, ar, which) {
      if (!editable || e.button === 2) return;
      if (which === 'both') { startDrag(e, { kind: 'arrow', id: ar.id }); return; }
      e.preventDefault();
      e.stopPropagation();
      const svg = svgRef.current;
      const scale = svg ? 720 / svg.getBoundingClientRect().width : 1;
      const sx = e.clientX, sy = e.clientY;
      const move = (ev) => setDrag({ dx: (ev.clientX - sx) * scale, dy: (ev.clientY - sy) * scale, keys: [], noteIds: [], arrowIds: [], end: { id: ar.id, which } });
      const up = (ev) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setDrag(null);
        const dx = (ev.clientX - sx) * scale, dy = (ev.clientY - sy) * scale;
        draggedRef.current = !(Math.abs(dx) < 2 && Math.abs(dy) < 2);
        if (!draggedRef.current || !onPatch) return;
        onPatch({
          arrows: (visual.arrows || []).map((a) => {
            if (a.id !== ar.id) return a;
            const nx = { ...a };
            if (which === 'a') { nx.x1 = Math.round(nx.x1 + dx); nx.y1 = Math.round(nx.y1 + dy); }
            else { nx.x2 = Math.round(nx.x2 + dx); nx.y2 = Math.round(nx.y2 + dy); }
            return nx;
          }),
        });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }

    const arrowList = visual.arrows || [];
    const arrows = arrowList.map((ar) => {
      const c = ar.color == null || ar.color === 'ink' ? '#211f1c' : hueSet(ar.color).p;
      let x1 = ar.x1, y1 = ar.y1, x2 = ar.x2, y2 = ar.y2;
      if (drag) {
        if (drag.arrowIds && drag.arrowIds.indexOf(ar.id) !== -1) { x1 += drag.dx; y1 += drag.dy; x2 += drag.dx; y2 += drag.dy; }
        else if (drag.end && drag.end.id === ar.id) {
          if (drag.end.which === 'a') { x1 += drag.dx; y1 += drag.dy; } else { x2 += drag.dx; y2 += drag.dy; }
        }
      }
      const a = Math.atan2(y2 - y1, x2 - x1);
      const L = 11, sw = ar.weight || 2;
      const hx = (k) => (x2 - L * Math.cos(a + k)).toFixed(1), hy = (k) => (y2 - L * Math.sin(a + k)).toFixed(1);
      const desc = { kind: 'arrow', id: ar.id };
      return (
        <g key={'arrow' + ar.id} data-ar={ar.id} onClick={(e) => pick(e, desc)}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth={sw} strokeLinecap="round" strokeDasharray={ar.dash ? '7 6' : undefined}></line>
          {ar.kind === 'arrow' ? <path d={`M${hx(0.5)} ${hy(0.5)}L${x2.toFixed(1)} ${y2.toFixed(1)}L${hx(-0.5)} ${hy(-0.5)}Z`} fill={c} stroke={c} strokeWidth="1" strokeLinejoin="round"></path> : null}
          {editable ? (
            <g>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(0,0,0,0)" strokeWidth="14" style={{ cursor: 'move' }} onPointerDown={(e) => startArrowDrag(e, ar, 'both')}></line>
              <circle cx={x1} cy={y1} r="5" fill="#fff" stroke={c} strokeWidth="1.6" style={{ cursor: 'crosshair' }} onPointerDown={(e) => startArrowDrag(e, ar, 'a')}></circle>
              <circle cx={x2} cy={y2} r="5" fill="#fff" stroke={c} strokeWidth="1.6" style={{ cursor: 'crosshair' }} onPointerDown={(e) => startArrowDrag(e, ar, 'b')}></circle>
            </g>
          ) : null}
        </g>
      );
    });

    const notes = (visual.notes || []).map((nt) => {
      const moved = drag && drag.noteIds && drag.noteIds.indexOf(nt.id) !== -1 ? [drag.dx, drag.dy] : [0, 0];
      const c = nt.color == null || nt.color === 'ink' ? '#211f1c' : hueSet(nt.color).p;
      const lines = String(nt.text || '').split('\n');
      const desc = { kind: 'note', id: nt.id };
      const size = (nt.size || 13) * liveFor(desc);
      const [nlx, nly] = liveOffset(desc);
      return (
        <g
          key={'note' + nt.id}
          data-note={nt.id}
          transform={`translate(${nt.x + moved[0] + nlx} ${nt.y + moved[1] + nly})`}
          style={editable ? { cursor: 'move' } : undefined}
          onPointerDown={(e) => startDrag(e, desc)}
          onClick={(e) => pick(e, desc)}
        >
          <text x={0} y={0} fontFamily={D.F} fontSize={size} fontWeight={600} fill={c} style={{ paintOrder: 'stroke', stroke: 'rgba(255,255,255,0.9)', strokeWidth: 3.5 }}>
            {lines.map((l, k) => (
              <tspan key={k} x={0} dy={k === 0 ? 0 : size * 1.3}>{l}</tspan>
            ))}
          </text>
        </g>
      );
    });

    // ---------- floating controls ----------
    const selItem = sel && sel.kind === 'item' ? items[sel.i] : null;
    const selSubItem = sel && sel.kind === 'sub' ? items[sel.i] : null;
    const selGfx = sel && sel.kind === 'gfx' ? sel : null;
    const selNote = sel && sel.kind === 'note' ? (visual.notes || []).find((n) => n.id === sel.id) : null;
    const selArrow = sel && sel.kind === 'arrow' ? arrowList.find((a) => a.id === sel.id) : null;
    const itemFor = selItem || selSubItem || (selGfx && selGfx.i != null ? items[selGfx.i] : null);
    const multi = sels.length > 1;

    const setItemProp = (patch) => {
      if (!onPatch || !sel || sel.i == null) return;
      onPatch({ spec: { ...visual.spec, items: items.map((x, k) => (k === sel.i ? { ...x, ...patch } : x)) } });
    };
    const setArrowProp = (patch) => {
      if (!onPatch || !selArrow) return;
      onPatch({ arrows: arrowList.map((a) => (a.id === sel.id ? { ...a, ...patch } : a)) });
    };
    const setNoteProp = (patch) => {
      if (!onPatch || !selNote) return;
      onPatch({ notes: (visual.notes || []).map((n) => (n.id === sel.id ? { ...n, ...patch } : n)) });
    };
    const setColorAll = (h) => {
      if (!onPatch || !sels.length) return;
      const idx = new Set(), nids = new Set(), aids = new Set();
      let nl = null;
      sels.forEach((d) => {
        if (d.kind === 'sub') {
          nl = nl || { ...layout };
          const k = 'clsub:' + d.i + ':' + d.sub;
          if (h == null) delete nl[k]; else nl[k] = h;
        } else if (d.kind === 'item') idx.add(d.i);
        else if (d.kind === 'gfx' && d.i != null) idx.add(d.i);
        else if (d.kind === 'note') nids.add(d.id);
        else if (d.kind === 'arrow') aids.add(d.id);
      });
      const patch = {};
      if (nl) patch.layout = nl;
      if (idx.size) patch.spec = { ...visual.spec, items: items.map((x, k) => (idx.has(k) ? { ...x, color: h } : x)) };
      if (nids.size) patch.notes = (visual.notes || []).map((n) => (nids.has(n.id) ? { ...n, color: h == null ? 'ink' : h } : n));
      if (aids.size) patch.arrows = arrowList.map((a) => (aids.has(a.id) ? { ...a, color: h == null ? 'ink' : h } : a));
      onPatch(patch);
    };
    // scale every selected element by absolute step (chips) or relative factor (corner drag);
    // in multi-selections positions also scale around the union center so elements don't overlap
    const applyScale = (mode, v) => {
      if (!onPatch || !sels.length) return;
      const nl = { ...layout };
      let nitems = null, nnotes = null, touchedLayout = false;
      sels.forEach((d) => {
        if (d.kind === 'item') {
          const cur = (items[d.i] && items[d.i].scale) || 1;
          const nv = clampSc(mode === 'abs' ? v : cur * v);
          nitems = (nitems || items.slice()).map((x, k) => (k === d.i ? { ...x, scale: nv } : x));
          const [ox, oy] = groupOffset(d, nv / cur);
          if (ox || oy) {
            const lk = 'it:' + d.i;
            const b0 = nl[lk] || [0, 0];
            nl[lk] = [Math.round(b0[0] + ox), Math.round(b0[1] + oy)];
            touchedLayout = true;
          }
        } else {
          const sk = scaleKeyOf(d);
          if (sk) {
            const cur = layout[sk] || 1;
            const nv = clampSc(mode === 'abs' ? v : cur * v);
            nl[sk] = nv;
            touchedLayout = true;
            const [ox, oy] = groupOffset(d, nv / cur);
            if (ox || oy) {
              const lk = layoutKeyOf(d);
              const b0 = nl[lk] || [0, 0];
              nl[lk] = [Math.round(b0[0] + ox), Math.round(b0[1] + oy)];
            }
          } else if (d.kind === 'note') {
            const nt = (visual.notes || []).find((n) => n.id === d.id) || {};
            const curN = nt.size || 13;
            const nv = Math.max(8, Math.round(mode === 'abs' ? 13 * v : curN * v));
            const [ox, oy] = groupOffset(d, nv / curN);
            nnotes = (nnotes || (visual.notes || []).slice()).map((n) => (n.id === d.id ? { ...n, size: nv, x: n.x + ox, y: n.y + oy } : n));
          }
        }
      });
      const patch = {};
      if (nitems) patch.spec = { ...visual.spec, items: nitems };
      if (touchedLayout) patch.layout = nl;
      if (nnotes) patch.notes = nnotes;
      if (Object.keys(patch).length) onPatch(patch);
    };
    const deleteSelected = () => {
      if (!onPatch) return;
      const nids = sels.filter((d) => d.kind === 'note').map((d) => d.id);
      const aids = sels.filter((d) => d.kind === 'arrow').map((d) => d.id);
      const patch = {};
      if (nids.length) patch.notes = (visual.notes || []).filter((n) => nids.indexOf(n.id) === -1);
      if (aids.length) patch.arrows = arrowList.filter((a) => aids.indexOf(a.id) === -1);
      if (Object.keys(patch).length) onPatch(patch);
      setSels([]);
    };
    const addTextAtSel = () => {
      if (!onPatch) return;
      const id = 'n' + Math.random().toString(36).slice(2, 7);
      const svg = svgRef.current;
      const k = svg ? 720 / svg.getBoundingClientRect().width : 1;
      const u = union();
      const x = u ? Math.min(640, Math.max(16, (u.x + u.w / 2) * k - 34)) : 540;
      const y = u ? Math.max(18, (u.y + u.h + 18) * k) : 46;
      onPatch({ notes: [...(visual.notes || []), { id, text: 'New text', x, y, size: 13, color: 'ink' }] });
      setSels([{ kind: 'note', id }]);
      setPop('text');
    };

    function union() { return unionOf(boxes); }

    const commitScale = (f) => { if (f !== 1) applyScale('rel', f); };
    // drag anywhere inside the union selection box to move the whole selection;
    // a plain click falls through to the element under the pointer
    const descFromPoint = (x, y) => {
      const els = document.elementsFromPoint(x, y);
      for (const el of els) {
        if (!el.closest) continue;
        if (el.classList && (el.classList.contains('dg-selbox') || el.classList.contains('dg-marquee'))) continue;
        const sb = el.closest('[data-sub]');
        if (sb) { const parts = sb.getAttribute('data-sub').split(':'); return { kind: 'sub', i: +parts[0], sub: parts.slice(1).join(':') }; }
        const it = el.closest('g[data-it]');
        if (it) return { kind: 'item', i: +it.getAttribute('data-it') };
        const gx = el.closest('g[data-gfx]');
        if (gx) {
          const key = gx.getAttribute('data-gfx');
          const mm = /^[a-zA-Z_]+?(\d*)$/.exec(key);
          return { kind: 'gfx', key, i: mm && mm[1] !== '' && items[+mm[1]] ? +mm[1] : null };
        }
        const nt = el.closest('g[data-note]');
        if (nt) return { kind: 'note', id: nt.getAttribute('data-note') };
        const arw = el.closest('g[data-ar]');
        if (arw) return { kind: 'arrow', id: arw.getAttribute('data-ar') };
        if (el === svgRef.current) return null;
      }
      return null;
    };
    const startBoxDrag = (e) => {
      if (e.button !== 0 || !sels.length) return;
      const sx = e.clientX, sy = e.clientY;
      const shift = e.shiftKey;
      startDrag(e, sels[0]); // moves the whole selection (group path)
      const onUp = (ev) => {
        window.removeEventListener('pointerup', onUp);
        if (Math.abs(ev.clientX - sx) >= 2 || Math.abs(ev.clientY - sy) >= 2) return;
        // no movement: treat as a click on whatever is under the pointer
        const d = descFromPoint(ev.clientX, ev.clientY);
        setPop(null);
        setSels((cur) => {
          if (!d) return [];
          if (shift && cur.length) {
            const k = dkey(d);
            return cur.some((x) => dkey(x) === k) ? cur.filter((x) => dkey(x) !== k) : [...cur, d];
          }
          return [d];
        });
      };
      window.addEventListener('pointerup', onUp);
    };
    const startScaleDrag = (e) => {
      const u = union();
      if (!u || e.button === 2) return;
      e.preventDefault();
      e.stopPropagation();
      const sx = e.clientX, w0 = Math.max(10, u.w);
      const calc = (ev) => Math.min(3, Math.max(0.3, (w0 + (ev.clientX - sx)) / w0));
      const move = (ev) => setLiveSc(calc(ev));
      const up = (ev) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        const f = calc(ev);
        setLiveSc(null);
        commitScale(f);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };

    const curColor = sel && sel.kind === 'sub' && layout['clsub:' + sel.i + ':' + sel.sub] != null ? layout['clsub:' + sel.i + ':' + sel.sub]
      : itemFor ? itemFor.color : selNote ? (selNote.color || 'ink') : selArrow ? (selArrow.color || 'ink') : null;
    const swatch = !multi && curColor != null ? hueColor(curColor) : null;

    const dots = (value, set, withAuto) => (
      <div className="dg-dots">
        {withAuto ? <button className={'dg-dot auto' + (value == null ? ' on' : '')} title="Auto" onClick={() => set(null)}></button> : null}
        <button className={'dg-dot' + (value === 'ink' ? ' on' : '')} style={{ background: '#2b2925' }} title="Ink" onClick={() => set('ink')}></button>
        {HUES.map((h) => (
          <button key={h} className={'dg-dot' + (value === h ? ' on' : '')} style={{ background: hueColor(h) }} onClick={() => set(h)}></button>
        ))}
      </div>
    );

    const sizeChips = (pairs, cur, set) => (
      <div className="dg-chiprow">
        {pairs.map(([v, l]) => (
          <button key={l} className={'dg-chip' + (cur === v ? ' on' : '')} onClick={() => set(v)}>{l}</button>
        ))}
      </div>
    );

    let popEl = null;
    if (pop === 'color') {
      if (multi) popEl = <div><label>Color · {sels.length} selected</label>{dots(undefined, setColorAll, true)}</div>;
      else if (sel && sel.kind === 'sub') {
        const ck = 'clsub:' + sel.i + ':' + sel.sub;
        popEl = <div><label>Text color</label>{dots(layout[ck] == null ? null : layout[ck], (h) => setColorAll(h), true)}</div>;
      }
      else if (itemFor) popEl = <div><label>Color</label>{dots(itemFor.color == null ? null : itemFor.color, (h) => setColorAll(h), true)}</div>;
      else if (selArrow) popEl = <div><label>Color</label>{dots(selArrow.color || 'ink', (h) => setColorAll(h), false)}</div>;
      else if (selNote) popEl = <div><label>Color</label>{dots(selNote.color || 'ink', (h) => setColorAll(h), false)}</div>;
    }
    if (pop === 'size') {
      const lbl = multi ? 'Size · ' + sels.length + ' selected' : sel && sel.kind === 'gfx' ? 'Size' : sel && (sel.kind === 'sub' || sel.kind === 'note') ? 'Text size' : 'Element size';
      const cur = multi ? null
        : selItem ? (selItem.scale || 1)
        : sel && sel.kind === 'sub' ? (layout['scsub:' + sel.i + ':' + sel.sub] || 1)
        : selGfx ? (layout['scgfx:' + sel.key] || 1)
        : selNote ? ((selNote.size || 13) / 13) : null;
      popEl = <div><label>{lbl}</label>{sizeChips([[0.85, 'S'], [1, 'M'], [1.25, 'L'], [1.55, 'XL']], cur, (v) => applyScale('abs', v))}</div>;
    }
    if (pop === 'text' && !multi && selSubItem && ['label', 'detail', 'value'].indexOf(sel.sub) !== -1) {
      const field = sel.sub;
      popEl = (
        <div className="dg-form">
          <label>{field}</label>
          <input type="text" autoFocus value={selSubItem[field] || ''} onChange={(e) => setItemProp({ [field]: field === 'label' ? e.target.value : (e.target.value || null) })} />
        </div>
      );
    } else if (pop === 'text' && !multi && itemFor) {
      popEl = (
        <div className="dg-form">
          <label>Label</label>
          <input type="text" value={itemFor.label || ''} onChange={(e) => setItemProp({ label: e.target.value })} />
          <label>Detail</label>
          <input type="text" value={itemFor.detail || ''} onChange={(e) => setItemProp({ detail: e.target.value || null })} />
          <label>Value</label>
          <input type="text" value={itemFor.value || ''} onChange={(e) => setItemProp({ value: e.target.value || null })} />
        </div>
      );
    }
    if (pop === 'text' && !multi && selNote) {
      popEl = (
        <div className="dg-form">
          <label>Text</label>
          <textarea rows="2" autoFocus value={selNote.text || ''} onChange={(e) => setNoteProp({ text: e.target.value })}></textarea>
        </div>
      );
    }
    if (pop === 'line' && selArrow && !multi) {
      popEl = (
        <div>
          <label>Line</label>
          <div className="dg-chiprow">
            <button className={'dg-chip' + (!selArrow.dash ? ' on' : '')} onClick={() => setArrowProp({ dash: false })}>Solid</button>
            <button className={'dg-chip' + (selArrow.dash ? ' on' : '')} onClick={() => setArrowProp({ dash: true })}>Dashed</button>
          </div>
          <div className="dg-chiprow">
            <button className={'dg-chip' + (selArrow.kind === 'arrow' ? ' on' : '')} onClick={() => setArrowProp({ kind: 'arrow' })}>→ Head</button>
            <button className={'dg-chip' + (selArrow.kind !== 'arrow' ? ' on' : '')} onClick={() => setArrowProp({ kind: 'line' })}>— Plain</button>
          </div>
          <label>Thickness</label>
          <input type="range" min="1" max="6" step="0.5" value={selArrow.weight || 2} onChange={(e) => setArrowProp({ weight: parseFloat(e.target.value) })} />
        </div>
      );
    }

    const u = union();
    const anySel = sels.length > 0 && u;
    const hasDeletable = sels.some((d) => d.kind === 'note' || d.kind === 'arrow');
    const canResize = anySel && sels.some((d) => d.kind !== 'arrow');
    const lf = liveSc == null ? 1 : liveSc;
    const ubw = u ? u.w * lf : 0, ubh = u ? u.h * lf : 0;
    const ubx = u ? u.x + (u.w - ubw) / 2 : 0, uby = u ? u.y + (u.h - ubh) / 2 : 0;
    const floatLeft = u ? Math.min(Math.max(u.x + u.w / 2, 92), (u.wrapW || 720) - 92) : 0;

    const hsc = visual.hscale || 1;
    return (
      <div className="dg-wrap" style={{ position: 'relative', aspectRatio: hsc !== 1 ? '720 / ' + (Math.ceil(out.h) * hsc).toFixed(1) : undefined }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 720 ${Math.ceil(out.h)}`}
          preserveAspectRatio={hsc !== 1 ? 'none' : undefined}
          className={className}
          style={{ width: '100%', height: hsc !== 1 ? '100%' : undefined, display: 'block', touchAction: editable ? 'none' : undefined }}
          xmlns="http://www.w3.org/2000/svg"
          onPointerDown={startMarquee}
          onClick={() => { if (editable && !draggedRef.current) { setSels([]); setPop(null); } }}
        >
          {window.GlyphDraw.backdrop(visual.backdrop, 720, Math.ceil(out.h), basePal)}
          {content}
          {notes}
          {arrows}
        </svg>
        {editable && mq ? (
          <div className="dg-marquee" style={{ left: Math.min(mq.x0, mq.x1), top: Math.min(mq.y0, mq.y1), width: Math.abs(mq.x1 - mq.x0), height: Math.abs(mq.y1 - mq.y0) }}></div>
        ) : null}
        {editable && anySel && multi ? boxes.map((b, k) => (
          <div key={'mb' + k} className="dg-selbox faint" style={{ left: b.x - 3, top: b.y - 3, width: b.w + 6, height: b.h + 6 }}></div>
        )) : null}
        {editable && anySel ? (
          <div className="dg-selbox" style={{ left: ubx - 5, top: uby - 5, width: ubw + 10, height: ubh + 10 }} onPointerDown={startBoxDrag}>
            <i></i><i></i><i></i>
            {canResize ? <i className="dg-rs" title="Drag to resize" onPointerDown={startScaleDrag}></i> : <i></i>}
          </div>
        ) : null}
        {editable && anySel ? (
          <div
            className="dg-float"
            style={{ left: floatLeft, top: Math.max(4, uby - 44) }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="dg-toolbar">
              {multi ? <span className="dg-count">{sels.length}</span> : null}
              {multi || itemFor || selNote || selArrow ? (
                <button title="Color" onClick={() => setPop(pop === 'color' ? null : 'color')}>
                  <span className="dg-cur" style={{ background: swatch || 'conic-gradient(#e5533f,#e8b73a,#3f9d6b,#4646c8,#e5533f)' }}></span>
                </button>
              ) : null}
              {!multi && (itemFor || selNote) ? <button title="Edit text" onClick={() => setPop(pop === 'text' ? null : 'text')}>Aa</button> : null}
              {canResize ? <button title="Size" onClick={() => setPop(pop === 'size' ? null : 'size')}>⤢</button> : null}
              {!multi && (selItem || selSubItem || selGfx) ? <button title="Add text here" onClick={addTextAtSel}>+T</button> : null}
              {!multi && selArrow ? <button title="Line style" onClick={() => setPop(pop === 'line' ? null : 'line')}>—</button> : null}
              {hasDeletable ? <button className="dg-del" title={multi ? 'Delete notes & arrows in selection' : 'Delete'} onClick={deleteSelected}>✕</button> : null}
              {onOpenPanel ? <button title="All settings" onClick={() => onOpenPanel()}>⋯</button> : null}
            </div>
            {popEl ? <div className="dg-pop">{popEl}</div> : null}
          </div>
        ) : null}
      </div>
    );
  }

  window.Diagram = Diagram;
})();
