// Glyph — diagram renderers, part B: cycle, mindmap, venn, comparison, steps, matrix + <Diagram>
(function () {
  const { GREY, polar, PALETTES, mk, hashStr, palAt } = window.GlyphDraw;
  const I = window.GlyphIcons;
  window.DIAGRAMS = window.DIAGRAMS || {};
  const D9 = window.DIAGRAMS;
  const W = 720;

  D9.cycle = {
    name: 'Cycle',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const M = !!pal.multi;
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const hasVal = IT.some((it) => it.value);
      const variant = spec.variant || 'ring';
      const R = n >= 6 ? 172 : n >= 5 ? 158 : 144;
      const bw = n >= 6 ? 116 : 132, bh = hasVal ? 56 : 46;
      const rx = variant === 'pills' ? bh / 2 : 14;
      const cx = 360, cy = t.y0 + R + bh / 2 + 6;
      const step = 360 / n;
      const angs = variant === 'horseshoe' && n > 1 ? IT.map((_, i) => -210 + (240 * i) / (n - 1)) : IT.map((_, i) => -90 + i * step);
      const els = [t.el];
      // arc arrows along the ring between consecutive nodes (drawn under the boxes)
      const nArcs = variant === 'horseshoe' ? n - 1 : n;
      for (let i = 0; i < nArcs; i++) {
        const aN = variant === 'horseshoe' ? angs[i + 1] : angs[i] + step;
        const gapDeg = Math.min((aN - angs[i]) * 0.42, ((bw * 0.5) / R) * (180 / Math.PI) + 7);
        const a1 = angs[i] + gapDeg;
        const a2 = aN - gapDeg;
        if (a2 - a1 > 4) els.push(<g key={'c' + i}>{D.arcArrow(cx, cy, R, a1, a2, { stroke: M ? A(i).p : A(0).p, sw: 2 })}</g>);
      }
      IT.forEach((it, i) => {
        const c = A(i);
        const ang = angs[i];
        const [x, y] = polar(cx, cy, R, ang);
        const solid = M || i === 0;
        els.push(
          <g key={'it' + i}>
            {D.box(x - bw / 2, y - bh / 2, bw, bh, { fill: solid ? c.p : c.soft, stroke: c.p, rx })}
            {D.ctext(x, y - (hasVal && it.value ? 9 : 0), it.label, { size: 13, weight: 600, fill: solid ? '#fff' : c.deep, maxW: bw - 18, maxLines: 2 })}
            {hasVal && it.value ? D.ctext(x, y + 13, it.value, { size: 10.5, weight: 600, fill: solid ? 'rgba(255,255,255,0.82)' : c.p, maxW: bw - 18, maxLines: 1 }) : null}
          </g>
        );
      });
      let maxY = cy + bh / 2;
      angs.forEach((a) => { maxY = Math.max(maxY, cy + R * Math.sin((a * Math.PI) / 180) + bh / 2); });
      return { h: maxY + 24, el: els };
    },
  };
  D9.cycle.variants = [
    { id: 'ring', name: 'Ring' },
    { id: 'horseshoe', name: 'Horseshoe' },
    { id: 'pills', name: 'Pill ring' },
  ];

  // child sub-nodes for the hierarchical mindmap: use explicit item.children if
  // present, otherwise derive them by splitting the detail on ; , and "and".
  const mmCap = (s) => { s = String(s || '').trim().replace(/^[\-•*\d.\)\s]+/, ''); return s ? s[0].toUpperCase() + s.slice(1) : s; };
  const mmChildren = (it) => {
    if (Array.isArray(it.children) && it.children.length) {
      return it.children.map((c) => ({ label: mmCap(typeof c === 'string' ? c : (c && c.label) || '') })).filter((c) => c.label).slice(0, 5);
    }
    if (it.detail) {
      const parts = String(it.detail).split(/\s*[;,]\s*|\s+and\s+/i).map((s) => s.trim()).filter((s) => s.length > 1);
      if (parts.length >= 2) return parts.slice(0, 4).map((p) => ({ label: mmCap(p).slice(0, 32) }));
    }
    return [];
  };

  D9.mindmap = {
    name: 'Mindmap',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const IT = spec.items;
      const cx = 360;

      // ----- hierarchical variant: center -> branches -> sub-nodes -----
      if ((spec.variant || 'branches') === 'subnodes') {
        const enriched = IT.map((it, i) => ({ it, gi: i, kids: mmChildren(it) }));
        const left = enriched.filter((e) => e.gi % 2 === 0);
        const right = enriched.filter((e) => e.gi % 2 === 1);
        const childRowH = 30, branchGap = 20, nodeH = 50, nodeW = 124, pillW = 98, pillH = 22;
        const sideH = (list) => Math.max(60, list.reduce((s, e) => s + Math.max(nodeH, e.kids.length * childRowH) + branchGap, 0) - branchGap);
        const h = Math.max(sideH(left), sideH(right), 200) + 56;
        const cy = h / 2;
        const els = [];
        const side = (list, dir) => {
          let y = cy - sideH(list) / 2;
          list.forEach((e) => {
            const c = A(e.gi);
            const blockH = Math.max(nodeH, e.kids.length * childRowH);
            const bcy = y + blockH / 2;
            const nodeX = dir > 0 ? cx + 70 : cx - 70 - nodeW;
            const ncx = nodeX + nodeW / 2;
            const edgeOut = dir > 0 ? nodeX + nodeW : nodeX;
            const edgeIn = dir > 0 ? nodeX : nodeX + nodeW;
            const sx = cx + dir * 58;
            els.push(<path key={'c' + e.gi} d={`M${sx} ${cy} C ${sx + dir * 46} ${cy}, ${edgeIn - dir * 40} ${bcy}, ${edgeIn} ${bcy}`} fill="none" stroke={c.mid} strokeWidth={2} />);
            els.push(
              <g key={'n' + e.gi}>
                {D.box(nodeX, bcy - nodeH / 2, nodeW, nodeH, { fill: c.soft, stroke: c.p, rx: 12 })}
                {I.draw(nodeX + 16, bcy - nodeH / 2 + 14, 16, I.nameFor(e.it), c.p, 2)}
                {D.ctext(ncx, bcy, e.it.label, { size: 11.5, weight: 700, fill: c.deep, maxW: nodeW - 14, maxLines: 2 })}
              </g>
            );
            e.kids.forEach((k, ki) => {
              const ky = y + ki * childRowH + childRowH / 2;
              const px = dir > 0 ? edgeOut + 26 : edgeOut - 26 - pillW;
              const pin = dir > 0 ? px : px + pillW;
              els.push(<path key={'ck' + e.gi + '_' + ki} d={`M${edgeOut} ${bcy} C ${edgeOut + dir * 16} ${bcy}, ${pin - dir * 16} ${ky}, ${pin} ${ky}`} fill="none" stroke={c.mid} strokeWidth={1.3} />);
              els.push(
                <g key={'k' + e.gi + '_' + ki}>
                  {D.box(px, ky - pillH / 2, pillW, pillH, { fill: '#fff', stroke: c.mid, rx: 11 })}
                  {D.ctext(px + pillW / 2, ky, k.label, { size: 9, weight: 600, fill: c.deep, maxW: pillW - 10, maxLines: 1 })}
                </g>
              );
            });
            y += blockH + branchGap;
          });
        };
        side(left, -1);
        side(right, 1);
        els.push(<g key="ctr">{D.ellipse(cx, cy, 62, 40, { fill: A(0).p, stroke: A(0).p })}{D.ctext(cx, cy, spec.title, { size: 12.5, weight: 700, fill: '#fff', maxW: 108, maxLines: 3 })}</g>);
        return { h, el: els };
      }

      // ----- default: single-level branches -----
      const right = IT.map((it, i) => [it, i]).filter(([, i]) => i % 2 === 0);
      const left = IT.map((it, i) => [it, i]).filter(([, i]) => i % 2 === 1);
      const rows = Math.max(right.length, left.length);
      const rowH = 74;
      const h = Math.max(rows * rowH + 70, 250);
      const cy = h / 2;
      const nw = 196, nh = 50;
      const els = [];
      els.push(<g key="ctr">{D.ellipse(cx, cy, 112, 46, { fill: A(0).p, stroke: A(0).p })}{D.ctext(cx, cy, spec.title, { size: 15, weight: 700, fill: '#fff', maxW: 196, maxLines: 2 })}</g>);
      function side(list, dir, key) {
        const x = dir > 0 ? W - 24 - nw : 24;
        const edgeX = dir > 0 ? x : x + nw;
        list.forEach(([it, gi], k) => {
          const c = A(gi);
          const y = cy + (k - (list.length - 1) / 2) * rowH;
          const sx = cx + dir * 112, sy = cy;
          const d = `M${sx} ${sy} C ${sx + dir * 60} ${sy}, ${edgeX - dir * 70} ${y}, ${edgeX - dir * 6} ${y}`;
          els.push(
            <g key={'it' + gi}>
              <path d={d} fill="none" stroke={c.mid} strokeWidth={2} />
              {D.box(x, y - nh / 2, nw, nh, { fill: '#fff', stroke: c.p, rx: 12 })}
              {I.draw(x + 24, y, 22, I.nameFor(it), c.p, 2)}
              {D.ctext(x + nw / 2 + 18, y - (it.detail ? 8 : 0), it.label, { size: 12.5, weight: 600, fill: c.deep, maxW: nw - 52, maxLines: 1 })}
              {it.detail ? D.ctext(x + nw / 2 + 18, y + 12, it.detail, { size: 10, fill: GREY, maxW: nw - 52, maxLines: 1 }) : null}
            </g>
          );
        });
      }
      side(right, 1, 'r');
      side(left, -1, 'l');
      return { h, el: els };
    },
  };
  D9.mindmap.variants = [
    { id: 'branches', name: 'Branches' },
    { id: 'subnodes', name: 'Sub-branches' },
  ];

  D9.venn = {
    name: 'Venn',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items;
      const three = IT.length >= 3;
      const els = [t.el];
      let h;
      if (three) {
        const r = 102;
        const cs = [[292, t.y0 + 112], [428, t.y0 + 112], [360, t.y0 + 226]];
        const cen = [360, t.y0 + 150];
        cs.forEach((c, i) => {
          els.push(<g key={'v' + i}>{D.circle(c[0], c[1], r, { fill: A(i).p, fillOpacity: 0.14, stroke: A(i).p, sw: 1.8 })}</g>);
        });
        IT.slice(0, 3).forEach((it, i) => {
          const c = cs[i];
          const dx = c[0] - cen[0], dy = c[1] - cen[1];
          const len = Math.hypot(dx, dy) || 1;
          const lx = c[0] + (dx / len) * 46, ly = c[1] + (dy / len) * 42;
          els.push(<g key={'it' + i}>{D.ctext(lx, ly, it.label, { size: 13.5, weight: 700, fill: A(i).deep, maxW: 130, maxLines: 2 })}{it.detail ? D.ctext(lx, ly + 28, it.detail, { size: 10, fill: GREY, maxW: 120, maxLines: 2 }) : null}</g>);
        });
        h = t.y0 + 226 + r + 26;
        if (IT.length > 3) {
          IT.slice(3).forEach((it, k) => {
            els.push(<g key={'it' + (3 + k)}>{D.circle(40, h - 14 + k * 24, 3.5, { fill: A(3 + k).p, stroke: A(3 + k).p })}{D.ctext(54, h - 14 + k * 24, it.label + (it.detail ? ' — ' + it.detail : ''), { size: 11, fill: GREY, anchor: 'start', maxW: 600, maxLines: 1 })}</g>);
          });
          h += IT.slice(3).length * 24 + 10;
        }
      } else {
        const r = 116;
        const cy = t.y0 + 128;
        els.push(<g key="v0">{D.circle(282, cy, r, { fill: A(0).p, fillOpacity: 0.14, stroke: A(0).p, sw: 1.8 })}</g>);
        els.push(<g key="v1">{D.circle(438, cy, r, { fill: A(1).p, fillOpacity: 0.14, stroke: A(1).p, sw: 1.8 })}</g>);
        const a = IT[0] || { label: '' }, b = IT[1] || { label: '' };
        els.push(<g key="it0">{D.ctext(218, cy, a.label, { size: 14, weight: 700, fill: A(0).deep, maxW: 140, maxLines: 2 })}{a.detail ? D.ctext(218, cy + 32, a.detail, { size: 10.5, fill: GREY, maxW: 130, maxLines: 2 }) : null}</g>);
        els.push(<g key="it1">{D.ctext(502, cy, b.label, { size: 14, weight: 700, fill: A(1).deep, maxW: 140, maxLines: 2 })}{b.detail ? D.ctext(502, cy + 32, b.detail, { size: 10.5, fill: GREY, maxW: 130, maxLines: 2 }) : null}</g>);
        h = cy + r + 30;
      }
      return { h, el: els };
    },
  };

  D9.comparison = {
    name: 'Compare',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const M = !!pal.multi;
      const t = D.title(spec.title);
      const IT = spec.items;
      const a = IT[0] || { label: 'Option A' }, b = IT[1] || { label: 'Option B' };
      const rest = IT.slice(2);
      const L = [], R = [];
      rest.forEach((it, i) => (i % 2 === 0 ? L : R).push(it));
      const rows = Math.max(L.length, R.length, 1);
      const rowH = 46;
      const hh = 52;
      const colW = 322, lx = 24, rx = 374;
      const bodyH = rows * rowH + 18;
      const els = [t.el];
      function col(x, head, items, c, primary, key, base) {
        els.push(
          <g key={key}>
            {D.box(x, t.y0, colW, hh + bodyH, { fill: '#fff', stroke: c.mid, rx: 14 })}
            {D.box(x, t.y0, colW, hh, { fill: primary ? c.p : c.soft, stroke: c.p, rx: 14 })}
            {D.ctext(x + colW / 2, t.y0 + hh / 2, head.label, { size: 14.5, weight: 700, fill: primary ? '#fff' : c.deep, maxW: colW - 60, maxLines: 1 })}
          </g>
        );
        items.forEach((it, i) => {
          const y = t.y0 + hh + 18 + i * rowH + rowH / 2 - 8;
          els.push(
            <g key={'it' + (base + 2 * i)}>
              {I.draw(x + 27, y, 18, I.nameFor(it), c.p, 2)}
              {D.ctext(x + 44, y - (it.detail ? 8 : 0), it.label, { size: 12.5, weight: 600, fill: c.deep, anchor: 'start', maxW: colW - 70, maxLines: 1 })}
              {it.detail ? D.ctext(x + 44, y + 11, it.detail, { size: 10.5, fill: GREY, anchor: 'start', maxW: colW - 70, maxLines: 1 }) : null}
            </g>
          );
        });
      }
      col(lx, a, L, A(0), true, 'it0', 2);
      col(rx, b, R, A(1), M, 'it1', 3);
      els.push(<g key="vs">{D.circle(360, t.y0 + hh / 2, 17, { fill: '#fff', stroke: A(0).p, sw: 1.8 })}{D.ctext(360, t.y0 + hh / 2, 'vs', { size: 11.5, weight: 700, fill: A(0).p })}</g>);
      return { h: t.y0 + hh + bodyH + 26, el: els };
    },
  };

  D9.steps = {
    name: 'Steps',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const M = !!pal.multi;
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const baseY = t.y0 + 236;
      const gap = 10;
      const colW = (W - 48 - (n - 1) * gap) / n;
      const minH = 66, maxH = 200;
      const els = [t.el];
      const hasDetail = IT.some((it) => it.detail);
      IT.forEach((it, i) => {
        const c = A(i);
        const bh = n === 1 ? maxH : minH + ((maxH - minH) * i) / (n - 1);
        const x = 24 + i * (colW + gap);
        const y = baseY - bh;
        const op = M ? 0.9 : 0.22 + (0.58 * i) / Math.max(1, n - 1);
        const dark = op > 0.45;
        els.push(
          <g key={'it' + i}>
            {D.box(x, y, colW, bh, { fill: c.p, stroke: c.p, rx: 8, opacity: undefined })}
            {D.box(x, y, colW, bh, { fill: '#fff', stroke: 'none', rx: 8, opacity: 1 - op })}
            {D.box(x, y, colW, bh, { fill: 'none', stroke: c.p, rx: 8 })}
            {D.ctext(x + colW / 2, y - 16, it.value || String(i + 1).padStart(2, '0'), { size: 13, weight: 700, fill: c.p, maxW: colW + 10, maxLines: 1 })}
            {I.draw(x + colW / 2, y + 18, 20, I.nameFor(it), dark ? '#fff' : c.p, 2)}
            {D.ctext(x + colW / 2, y + Math.min(bh / 2, 34) + 14, it.label, { size: 12.5, weight: 600, fill: dark ? '#fff' : c.deep, maxW: colW - 12, maxLines: 3 })}
            {it.detail ? D.ctext(x + colW / 2, baseY + 22, it.detail, { size: 9.5, fill: GREY, maxW: colW - 4, maxLines: 2 }) : null}
          </g>
        );
      });
      return { h: baseY + (hasDetail ? 52 : 22), el: els };
    },
  };

  D9.matrix = {
    name: 'Matrix',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items;
      const quad = IT.slice(0, 4);
      const extra = IT.slice(4);
      const gap = 14, cw = (W - 48 - gap) / 2, ch = 124;
      const els = [t.el];
      quad.forEach((it, i) => {
        const c = A(i);
        const x = 24 + (i % 2) * (cw + gap);
        const y = t.y0 + Math.floor(i / 2) * (ch + gap);
        els.push(
          <g key={'it' + i}>
            {D.box(x, y, cw, ch, { fill: c.soft, stroke: c.p, rx: 14 })}
            {I.draw(x + 26, y + 26, 22, I.nameFor(it), c.p, 2)}
            {D.ctext(x + cw / 2, y + ch / 2 - (it.detail ? 13 : 0), it.label, { size: 15, weight: 700, fill: c.deep, maxW: cw - 36, maxLines: 2 })}
            {it.detail ? D.ctext(x + cw / 2, y + ch / 2 + 22, it.detail, { size: 11, fill: GREY, maxW: cw - 36, maxLines: 2 }) : null}
          </g>
        );
      });
      let h = t.y0 + 2 * ch + gap + 26;
      extra.forEach((it, k) => {
        els.push(<g key={'it' + (4 + k)}>{D.circle(40, h - 8 + k * 24, 3.5, { fill: A(4 + k).p, stroke: A(4 + k).p })}{D.ctext(54, h - 8 + k * 24, it.label + (it.detail ? ' — ' + it.detail : ''), { size: 11, fill: GREY, anchor: 'start', maxW: 600, maxLines: 1 })}</g>);
      });
      if (extra.length) h += extra.length * 24 + 8;
      return { h, el: els };
    },
  };

  // ---------- shared component ----------
  const TYPE_ORDER = ['flow', 'list', 'timeline', 'stats', 'steps', 'cycle', 'mindmap', 'funnel', 'pyramid', 'venn', 'comparison', 'matrix'];

  function Diagram({ visual, className }) {
    const pal = PALETTES[visual.palette || 0] || PALETTES[0];
    const D = mk(visual.style || 'clean', hashStr(visual.id + visual.type) || 7);
    const r = D9[visual.type] || D9.flow;
    let out;
    try {
      out = r.render(visual.spec, D, pal);
    } catch (e) {
      out = { h: 120, el: [<text key="e" x={24} y={60} fontSize={14} fill="#a33">Could not render this layout</text>] };
    }
    return (
      <svg viewBox={`0 0 720 ${Math.ceil(out.h)}`} className={className} style={{ width: '100%', display: 'block' }} xmlns="http://www.w3.org/2000/svg">
        {out.el}
      </svg>
    );
  }

  window.Diagram = Diagram;
  window.TYPE_ORDER = TYPE_ORDER;
})();
