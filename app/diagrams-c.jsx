// Glyph — diagram renderers, part C: chevron, kanban, cards, hub, orbit, honeycomb, bracket, tree, fishbone, gantt
(function () {
  const { GREY, polar, palAt } = window.GlyphDraw;
  window.DIAGRAMS = window.DIAGRAMS || {};
  const D9 = window.DIAGRAMS;
  const W = 720;

  const grid = (n, maxCols) => {
    const cols = Math.min(n, maxCols);
    return { cols, rows: Math.ceil(n / cols) };
  };
  window.GlyphKit = { grid };

  D9.chevron = {
    name: 'Chevron',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const variant = spec.variant || 'auto';
      const { cols, rows } = grid(n, variant === 'row' ? n : variant === 'stack' ? 3 : 5);
      const d = 16, gap = 6, bh = 72, rowGap = 30;
      const cw = (W - 48 - (cols - 1) * gap - d) / cols;
      const els = [t.el];
      const hasDetail = IT.some((it) => it.detail);
      IT.forEach((it, i) => {
        const c = A(i);
        const r = Math.floor(i / cols), k = i % cols;
        const x = 24 + k * (cw + gap);
        const y = t.y0 + r * (bh + rowGap + (hasDetail ? 22 : 0));
        const solid = !!pal.multi || i % 2 === 0;
        const pts = [[x, y], [x + cw, y], [x + cw + d, y + bh / 2], [x + cw, y + bh], [x, y + bh], [x + (k === 0 && r === 0 ? 0 : d), y + bh / 2]];
        els.push(
          <g key={'it' + i}>
            {D.poly(pts, { fill: solid ? c.p : c.soft, stroke: c.p })}
            {D.ctext(x + cw / 2 + d / 2, y + bh / 2, it.label, { size: 13, weight: 600, fill: solid ? '#fff' : c.deep, maxW: cw - 14, maxLines: 2 })}
            {it.detail ? D.ctext(x + cw / 2 + d / 2, y + bh + 16, it.detail, { size: 10, fill: GREY, maxW: cw + 4, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: t.y0 + rows * (bh + rowGap + (hasDetail ? 22 : 0)) - rowGap + 26, el: els };
    },
  };
  D9.chevron.variants = [
    { id: 'auto', name: 'Auto' },
    { id: 'row', name: 'Single row' },
    { id: 'stack', name: 'Stacked' },
  ];

  D9.kanban = {
    name: 'Columns',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const { cols, rows } = grid(n, 5);
      const gap = 12, hh = 44, bodyH = 96, rowGap = 18;
      const cw = (W - 48 - (cols - 1) * gap) / cols;
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const r = Math.floor(i / cols), k = i % cols;
        const x = 24 + k * (cw + gap);
        const y = t.y0 + r * (hh + bodyH + rowGap);
        els.push(
          <g key={'it' + i}>
            {D.box(x, y + hh - 8, cw, bodyH + 8, { fill: c.soft, stroke: c.mid, rx: 12 })}
            {D.box(x, y, cw, hh, { fill: c.p, stroke: c.p, rx: 12 })}
            {D.ctext(x + cw / 2, y + hh / 2, it.label, { size: 12.5, weight: 700, fill: '#fff', maxW: cw - 14, maxLines: 2 })}
            {it.detail ? D.ctext(x + cw / 2, y + hh + bodyH / 2 - (it.value ? 10 : 0), it.detail, { size: 10.5, fill: c.deep, maxW: cw - 18, maxLines: 3 }) : null}
            {it.value ? D.ctext(x + cw / 2, y + hh + bodyH - 18, it.value, { size: 13, weight: 700, fill: c.p, maxW: cw - 14, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: t.y0 + rows * (hh + bodyH + rowGap) - rowGap + 26, el: els };
    },
  };

  D9.cards = {
    name: 'Cards',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const { cols, rows } = grid(n, n <= 4 ? 2 : n <= 9 ? 3 : 4);
      const gap = 14, ch = 96;
      const cw = (W - 48 - (cols - 1) * gap) / cols;
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const x = 24 + (i % cols) * (cw + gap);
        const y = t.y0 + Math.floor(i / cols) * (ch + gap);
        els.push(
          <g key={'it' + i}>
            {D.box(x, y, cw, ch, { fill: '#fff', stroke: c.mid, rx: 12 })}
            {D.box(x, y, 5, ch, { fill: c.p, stroke: 'none', rx: 2.5 })}
            {D.text(x + 18, y + 30, it.label, { size: 13.5, weight: 700, fill: c.deep, maxW: cw - 34 - (it.value ? 50 : 0), maxLines: 2 })}
            {it.detail ? D.text(x + 18, y + ch - 22, it.detail, { size: 10.5, fill: GREY, maxW: cw - 34, maxLines: 2 }) : null}
            {it.value ? D.text(x + cw - 14, y + 30, it.value, { size: 13, weight: 700, fill: c.p, anchor: 'end', maxW: 70, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: t.y0 + rows * (ch + gap) - gap + 26, el: els };
    },
  };

  D9.hub = {
    name: 'Hub',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const R = n <= 6 ? 168 : 196;
      const cx = 360, cy = t.y0 + R + 28;
      const nw = n <= 6 ? 148 : 126, nh = 46;
      const els = [t.el];
      IT.forEach((it, i) => {
        const ang = -90 + (i * 360) / n;
        const [x, y] = polar(cx, cy, R, ang);
        const [lx, ly] = polar(cx, cy, 74, ang);
        els.push(<g key={'ln' + i}>{D.line(lx, ly, x - (x - cx) * 0.16, y - (y - cy) * 0.16, { stroke: A(i).mid, sw: 1.6 })}</g>);
      });
      els.push(
        <g key="hub">
          {D.circle(cx, cy, 68, { fill: A(0).p, stroke: A(0).p })}
          {D.ctext(cx, cy, spec.title, { size: 14, weight: 700, fill: '#fff', maxW: 112, maxLines: 3 })}
        </g>
      );
      IT.forEach((it, i) => {
        const c = A(i);
        const ang = -90 + (i * 360) / n;
        const [x, y] = polar(cx, cy, R, ang);
        els.push(
          <g key={'it' + i}>
            {D.box(x - nw / 2, y - nh / 2, nw, nh, { fill: c.soft, stroke: c.p, rx: 12 })}
            {D.ctext(x, y, it.label, { size: 12, weight: 600, fill: c.deep, maxW: nw - 14, maxLines: 2 })}
          </g>
        );
      });
      return { h: cy + R + nh / 2 + 22, el: els };
    },
  };

  D9.orbit = {
    name: 'Orbit',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const rings = Math.min(3, Math.max(1, Math.ceil(n / 4)));
      const R0 = 96, dR = 62;
      const Rmax = R0 + (rings - 1) * dR;
      const cx = 360, cy = t.y0 + Rmax + 30;
      const els = [t.el];
      for (let r = 0; r < rings; r++) {
        els.push(<g key={'ring' + r}>{D.circle(cx, cy, R0 + r * dR, { fill: 'none', stroke: '#dedad3', sw: 1.2, dash: '3 5' })}</g>);
      }
      els.push(
        <g key="core">
          {D.circle(cx, cy, 52, { fill: A(0).p, stroke: A(0).p })}
          {D.ctext(cx, cy, spec.title, { size: 12.5, weight: 700, fill: '#fff', maxW: 86, maxLines: 3 })}
        </g>
      );
      IT.forEach((it, i) => {
        const c = A(i);
        const ring = i % rings;
        const idxOnRing = Math.floor(i / rings);
        const perRing = Math.ceil(n / rings);
        const ang = -90 + (idxOnRing * 360) / perRing + ring * 28;
        const R = R0 + ring * dR;
        const [x, y] = polar(cx, cy, R, ang);
        els.push(
          <g key={'it' + i}>
            {D.circle(x, y, 9, { fill: c.p, stroke: '#fff', sw: 2 })}
            {D.ctext(x, y + (y > cy ? 24 : -24), it.label, { size: 11.5, weight: 600, fill: c.deep, maxW: 110, maxLines: 2 })}
          </g>
        );
      });
      return { h: cy + Rmax + 40, el: els };
    },
  };

  D9.honeycomb = {
    name: 'Honeycomb',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const variant = spec.variant || 'auto';
      const cols = variant === 'row' ? n : variant === 'balanced' ? Math.ceil(n / 2) : Math.min(n, 4);
      const R = Math.min(60, 640 / ((cols - 1) * 1.74 + 2.9));
      const dx = R * 1.74, dy = R * 1.5;
      // center the whole tessellation around x=360
      const baseX = IT.map((_, i) => (i % cols) * dx + (Math.floor(i / cols) % 2 ? dx / 2 : 0));
      const minX = Math.min(...baseX), maxX = Math.max(...baseX);
      const startX = 360 - (minX + maxX) / 2;
      const els = [t.el];
      let maxY = t.y0;
      IT.forEach((it, i) => {
        const c = A(i);
        const r = Math.floor(i / cols);
        const cx = startX + baseX[i];
        const cy = t.y0 + R + 6 + r * dy;
        maxY = Math.max(maxY, cy + R);
        const pts = [0, 60, 120, 180, 240, 300].map((a) => polar(cx, cy, R, a + 30));
        const solid = !!pal.multi || i % 3 === 0;
        els.push(
          <g key={'it' + i}>
            {D.poly(pts, { fill: solid ? c.p : c.soft, stroke: c.p })}
            {D.ctext(cx, cy - (it.value ? 8 : 0), it.label, { size: 11.5, weight: 600, fill: solid ? '#fff' : c.deep, maxW: R * 1.5, maxLines: 3 })}
            {it.value ? D.ctext(cx, cy + 22, it.value, { size: 11, weight: 700, fill: solid ? 'rgba(255,255,255,0.8)' : c.p, maxW: R * 1.4, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: maxY + 22, el: els };
    },
  };
  D9.honeycomb.variants = [
    { id: 'auto', name: 'Cluster' },
    { id: 'balanced', name: 'Balanced rows' },
    { id: 'row', name: 'Single row' },
  ];

  D9.bracket = {
    name: 'Bracket',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const rowH = 52;
      const bodyH = n * rowH;
      const y0 = t.y0 + 8, cy = y0 + bodyH / 2;
      const bx = 268;
      const els = [t.el];
      els.push(
        <g key="root">
          {D.box(24, cy - 34, 200, 68, { fill: A(0).p, stroke: A(0).p, rx: 12 })}
          {D.ctext(124, cy, spec.title, { size: 14, weight: 700, fill: '#fff', maxW: 176, maxLines: 2 })}
        </g>
      );
      const brace = `M${bx} ${y0 + 6} C${bx + 22} ${y0 + 6} ${bx + 22} ${cy - 10} ${bx + 40} ${cy} C${bx + 22} ${cy + 10} ${bx + 22} ${y0 + bodyH - 6} ${bx} ${y0 + bodyH - 6}`;
      els.push(<g key="brace">{D.path(brace, { fill: 'none', stroke: '#c9c4bb', sw: 2 })}</g>);
      els.push(<g key="tie">{D.line(224, cy, bx + 36, cy, { stroke: '#c9c4bb', sw: 2 })}</g>);
      IT.forEach((it, i) => {
        const c = A(i);
        const y = y0 + i * rowH + rowH / 2;
        els.push(
          <g key={'it' + i}>
            {D.circle(336, y, 5, { fill: c.p, stroke: c.p })}
            {D.ctext(354, y - (it.detail ? 9 : 0), it.label, { size: 13.5, weight: 600, fill: c.deep, anchor: 'start', maxW: 250, maxLines: 1 })}
            {it.detail ? D.ctext(354, y + 12, it.detail, { size: 10.5, fill: GREY, anchor: 'start', maxW: 300, maxLines: 1 }) : null}
            {it.value ? D.ctext(W - 30, y, it.value, { size: 13, weight: 700, fill: c.p, anchor: 'end', maxW: 80, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: y0 + bodyH + 26, el: els };
    },
  };

  D9.tree = {
    name: 'Tree',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const { cols, rows } = grid(n, 4);
      const gap = 14, nh = 62, rowGap = 46;
      const nw = (W - 48 - (cols - 1) * gap) / cols;
      const rootW = 220, rootH = 54;
      const rootX = 360 - rootW / 2, rootY = t.y0;
      const busY = rootY + rootH + 24;
      const els = [t.el];
      els.push(
        <g key="root">
          {D.box(rootX, rootY, rootW, rootH, { fill: A(0).p, stroke: A(0).p, rx: 12 })}
          {D.ctext(360, rootY + rootH / 2, spec.title, { size: 14, weight: 700, fill: '#fff', maxW: rootW - 20, maxLines: 2 })}
        </g>
      );
      els.push(<g key="stem">{D.line(360, rootY + rootH, 360, busY, { stroke: '#c9c4bb', sw: 1.8 })}</g>);
      const topRowN = Math.min(n, cols);
      const xs = [];
      for (let k = 0; k < topRowN; k++) xs.push(24 + k * (nw + gap) + nw / 2);
      if (topRowN > 1) els.push(<g key="bus">{D.line(xs[0], busY, xs[topRowN - 1], busY, { stroke: '#c9c4bb', sw: 1.8 })}</g>);
      IT.forEach((it, i) => {
        const c = A(i);
        const r = Math.floor(i / cols), k = i % cols;
        const x = 24 + k * (nw + gap);
        const y = busY + 16 + r * (nh + rowGap);
        if (r === 0) els.push(<g key={'dl' + i}>{D.line(x + nw / 2, busY, x + nw / 2, y, { stroke: '#c9c4bb', sw: 1.8 })}</g>);
        else els.push(<g key={'dl' + i}>{D.line(x + nw / 2, y - rowGap + nh, x + nw / 2, y, { stroke: '#c9c4bb', sw: 1.8, dash: '3 4' })}</g>);
        els.push(
          <g key={'it' + i}>
            {D.box(x, y, nw, nh, { fill: c.soft, stroke: c.p, rx: 10 })}
            {D.ctext(x + nw / 2, y + nh / 2 - (it.detail ? 9 : 0), it.label, { size: 12, weight: 600, fill: c.deep, maxW: nw - 14, maxLines: 2 })}
            {it.detail ? D.ctext(x + nw / 2, y + nh / 2 + 14, it.detail, { size: 9.5, fill: GREY, maxW: nw - 14, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: busY + 16 + rows * (nh + rowGap) - rowGap + 26, el: els };
    },
  };

  D9.fishbone = {
    name: 'Fishbone',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const perSide = Math.ceil(n / 2);
      const ribH = 88;
      const cy = t.y0 + ribH + 30;
      const x0 = 40, x1 = W - 150;
      const els = [t.el];
      els.push(<g key="spine">{D.arrow(x0, cy, x1, cy, { stroke: A(0).p, sw: 2.6 })}</g>);
      els.push(
        <g key="headbox">
          {D.box(x1 + 10, cy - 28, 96, 56, { fill: A(0).p, stroke: A(0).p, rx: 10 })}
          {D.ctext(x1 + 58, cy, spec.title, { size: 11.5, weight: 700, fill: '#fff', maxW: 82, maxLines: 3 })}
        </g>
      );
      IT.forEach((it, i) => {
        const c = A(i);
        const up = i % 2 === 0;
        const k = Math.floor(i / 2);
        const span = (x1 - x0 - 80) / Math.max(1, perSide);
        const xb = x0 + 60 + k * span + (up ? 0 : span * 0.45);
        const xt = xb + 44;
        const yt = cy + (up ? -ribH : ribH);
        els.push(<g key={'rib' + i}>{D.line(xb, cy, xt, yt, { stroke: c.p, sw: 1.8 })}</g>);
        els.push(
          <g key={'it' + i}>
            {D.ctext(xt + 4, yt + (up ? -14 : 12) - (it.detail && up ? 14 : 0), it.label, { size: 12, weight: 600, fill: c.deep, anchor: 'middle', maxW: 130, maxLines: 2 })}
            {it.detail ? D.ctext(xt + 4, yt + (up ? -14 : 12) + (up ? 16 : 16), it.detail, { size: 9.5, fill: GREY, anchor: 'middle', maxW: 130, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: cy + ribH + 44, el: els };
    },
  };

  D9.gantt = {
    name: 'Gantt',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const rowH = 44, labW = 178;
      const x0 = 24 + labW, x1 = W - 36;
      const span = x1 - x0;
      const els = [t.el];
      for (let g = 0; g <= 4; g++) {
        const gx = x0 + (g * span) / 4;
        els.push(<g key={'g' + g}>{D.line(gx, t.y0 - 6, gx, t.y0 + n * rowH, { stroke: '#eceae5', sw: 1 })}</g>);
      }
      IT.forEach((it, i) => {
        const c = A(i);
        const y = t.y0 + i * rowH + rowH / 2;
        const start = x0 + (span * 0.72 * i) / Math.max(1, n);
        const len = Math.max(70, (span * 1.0) / Math.max(2, n) + span * 0.12);
        const bw = Math.min(len, x1 - start);
        els.push(
          <g key={'it' + i}>
            {D.ctext(24, y, it.label, { size: 12.5, weight: 600, fill: c.deep, anchor: 'start', maxW: labW - 16, maxLines: 2 })}
            {D.box(start, y - 13, bw, 26, { fill: c.p, stroke: c.p, rx: 13, fillOpacity: pal.multi ? 0.9 : 0.78 })}
            {it.value ? D.ctext(Math.min(start + bw + 10, x1 - 4), y, it.value, { size: 10.5, weight: 700, fill: c.p, anchor: 'start', maxW: 70, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: t.y0 + n * rowH + 24, el: els };
    },
  };
})();
