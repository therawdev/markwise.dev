// Glyph — diagram renderers, part F: diverge, converge, waterfall, heatgrid, checklist, proscons, agenda, dial, segments, ribbon + catalog
(function () {
  const { GREY, polar, palAt, seriesOf, ringSeg } = window.GlyphDraw;
  window.DIAGRAMS = window.DIAGRAMS || {};
  const D9 = window.DIAGRAMS;
  const W = 720;

  D9.diverge = {
    name: 'Diverge',
    render(spec, D, pal, dirIn) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const rowH = Math.min(72, 380 / n + 24);
      const bodyH = n * rowH;
      const cy = t.y0 + bodyH / 2;
      const hubX = dirIn ? 560 : 160, colX = dirIn ? 60 : 330;
      const nw = 300, nh = Math.min(52, rowH - 12);
      const els = [t.el];
      els.push(
        <g key="hub">
          {D.circle(hubX, cy, 64, { fill: A(0).p, stroke: A(0).p })}
          {D.ctext(hubX, cy, spec.title, { size: 13, weight: 700, fill: '#fff', maxW: 104, maxLines: 3 })}
        </g>
      );
      IT.forEach((it, i) => {
        const c = A(i);
        const y = t.y0 + i * rowH + rowH / 2;
        const ex = dirIn ? colX + nw : colX;
        if (dirIn) els.push(<g key={'a' + i}>{D.arrow(ex + 8, y, hubX - 70, cy + (y - cy) * 0.18, { stroke: c.p, sw: 1.8 })}</g>);
        else els.push(<g key={'a' + i}>{D.arrow(hubX + 66, cy + (y - cy) * 0.18, ex - 10, y, { stroke: c.p, sw: 1.8 })}</g>);
        els.push(
          <g key={'it' + i}>
            {D.box(colX, y - nh / 2, nw, nh, { fill: c.soft, stroke: c.p, rx: 11 })}
            {D.ctext(colX + nw / 2, y - (it.detail && nh > 40 ? 8 : 0), it.label, { size: 12.5, weight: 600, fill: c.deep, maxW: nw - 18, maxLines: 1 })}
            {it.detail && nh > 40 ? D.ctext(colX + nw / 2, y + 12, it.detail, { size: 10, fill: GREY, maxW: nw - 18, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: t.y0 + bodyH + 20, el: els };
    },
  };

  D9.converge = {
    name: 'Converge',
    render(spec, D, pal) {
      return D9.diverge.render(spec, D, pal, true);
    },
  };

  D9.waterfall = {
    name: 'Waterfall',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const vs = seriesOf(IT);
      const tot = vs.reduce((a, b) => a + b, 0) || 1;
      const baseY = t.y0 + 226, maxH = 188;
      const gap = 10;
      const cw = (W - 76 - n * gap) / (n + 0.4);
      const els = [t.el];
      els.push(<g key="axis">{D.line(30, baseY, W - 30, baseY, { stroke: '#d8d4cd', sw: 1.4 })}</g>);
      let cum = 0;
      IT.forEach((it, i) => {
        const c = A(i);
        const x = 40 + i * (cw + gap);
        const y0 = baseY - (maxH * cum) / tot;
        cum += vs[i];
        const y1 = baseY - (maxH * cum) / tot;
        if (i > 0) els.push(<g key={'cn' + i}>{D.line(x - gap - 2, y0, x + cw * 0.6, y0, { stroke: '#c9c4bb', sw: 1.2, dash: '3 4' })}</g>);
        els.push(
          <g key={'it' + i}>
            {D.box(x, y1, cw, Math.max(8, y0 - y1), { fill: c.p, stroke: c.p, rx: 4, fillOpacity: pal.multi ? 0.92 : 0.5 + (0.45 * i) / Math.max(1, n - 1) })}
            {it.value ? D.ctext(x + cw / 2, y1 - 12, it.value, { size: 10.5, weight: 700, fill: c.p, maxW: cw + 16, maxLines: 1 }) : null}
            {D.ctext(x + cw / 2, baseY + 17, it.label, { size: 10, weight: 600, fill: c.deep, maxW: cw + gap - 2, maxLines: 2 })}
          </g>
        );
      });
      return { h: baseY + 50, el: els };
    },
  };

  D9.heatgrid = {
    name: 'Heat grid',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const vs = seriesOf(IT), max = Math.max(...vs), min = Math.min(...vs);
      const cols = Math.min(n, n <= 4 ? 2 : n <= 9 ? 3 : 4);
      const rows = Math.ceil(n / cols);
      const gap = 10, ch = 92;
      const cw = (W - 48 - (cols - 1) * gap) / cols;
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const x = 24 + (i % cols) * (cw + gap);
        const y = t.y0 + Math.floor(i / cols) * (ch + gap);
        const f = max === min ? 0.6 : 0.18 + (0.78 * (vs[i] - min)) / (max - min);
        const dark = f > 0.52;
        els.push(
          <g key={'it' + i}>
            {D.box(x, y, cw, ch, { fill: c.p, stroke: c.p, rx: 10, fillOpacity: f })}
            {D.ctext(x + cw / 2, y + ch / 2 - 12, it.label, { size: 12.5, weight: 700, fill: dark ? '#fff' : c.deep, maxW: cw - 20, maxLines: 2 })}
            {it.value ? D.ctext(x + cw / 2, y + ch / 2 + 18, it.value, { size: 13, weight: 700, fill: dark ? 'rgba(255,255,255,0.85)' : c.p, maxW: cw - 20, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: t.y0 + rows * (ch + gap) - gap + 26, el: els };
    },
  };

  D9.checklist = {
    name: 'Checklist',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items;
      const rowH = 54;
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const y = t.y0 + i * rowH + rowH / 2 - 6;
        els.push(
          <g key={'it' + i}>
            {D.box(32, y - 13, 26, 26, { fill: c.soft, stroke: c.p, rx: 8 })}
            {D.path(`M${38.5} ${y}L${44} ${y + 5.5}L${52.5} ${y - 6}`, { fill: 'none', stroke: c.p, sw: 2.6 })}
            {D.ctext(76, y - (it.detail ? 9 : 0), it.label, { size: 14, weight: 600, fill: c.deep, anchor: 'start', maxW: 480, maxLines: 1 })}
            {it.detail ? D.ctext(76, y + 13, it.detail, { size: 11, fill: GREY, anchor: 'start', maxW: 520, maxLines: 1 }) : null}
            {it.value ? D.ctext(W - 32, y, it.value, { size: 12.5, weight: 700, fill: c.p, anchor: 'end', maxW: 100, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: t.y0 + IT.length * rowH + 16, el: els };
    },
  };

  D9.proscons = {
    name: 'Pros & cons',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items;
      const pros = IT.filter((_, i) => i % 2 === 0), cons = IT.filter((_, i) => i % 2 === 1);
      const rows = Math.max(pros.length, cons.length, 1);
      const rowH = 52, hh = 50;
      const colW = 330, lx = 24, rx = 366;
      const bodyH = rows * rowH + 16;
      const els = [t.el];
      [[lx, '+', 'Pros', pros, 0], [rx, '−', 'Cons', cons, 1]].forEach(([x, glyph, head, list, side]) => {
        const c = A(side);
        els.push(
          <g key={'col' + side}>
            {D.box(x, t.y0, colW, hh + bodyH, { fill: '#fff', stroke: c.mid, rx: 14 })}
            {D.box(x, t.y0, colW, hh, { fill: side === 0 ? c.p : c.soft, stroke: c.p, rx: 14 })}
            {D.ctext(x + colW / 2, t.y0 + hh / 2, glyph + '  ' + head, { size: 14.5, weight: 700, fill: side === 0 ? '#fff' : c.deep, maxW: colW - 40, maxLines: 1 })}
          </g>
        );
        list.forEach((it, k) => {
          const gi = side === 0 ? k * 2 : k * 2 + 1;
          const ic = A(gi);
          const y = t.y0 + hh + 16 + k * rowH + rowH / 2 - 6;
          els.push(
            <g key={'it' + gi}>
              {D.circle(x + 26, y, 9, { fill: ic.soft, stroke: ic.p, sw: 1.4 })}
              {D.ctext(x + 26, y, glyph, { size: 12, weight: 700, fill: ic.p })}
              {D.ctext(x + 44, y - (it.detail ? 8 : 0), it.label, { size: 12, weight: 600, fill: ic.deep, anchor: 'start', maxW: colW - 64, maxLines: 1 })}
              {it.detail ? D.ctext(x + 44, y + 12, it.detail, { size: 10, fill: GREY, anchor: 'start', maxW: colW - 64, maxLines: 1 }) : null}
            </g>
          );
        });
      });
      return { h: t.y0 + hh + bodyH + 24, el: els };
    },
  };

  D9.agenda = {
    name: 'Agenda',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const rowH = 64;
      const railX = 150;
      const els = [t.el];
      els.push(<g key="rail">{D.line(railX, t.y0 - 2, railX, t.y0 + n * rowH - 18, { stroke: '#d8d4cd', sw: 2 })}</g>);
      IT.forEach((it, i) => {
        const c = A(i);
        const y = t.y0 + i * rowH + 16;
        els.push(
          <g key={'it' + i}>
            {D.ctext(railX - 24, y, it.value || String(i + 1).padStart(2, '0'), { size: 13, weight: 700, fill: c.p, anchor: 'end', maxW: 110, maxLines: 1 })}
            {D.circle(railX, y, 7, { fill: '#fff', stroke: c.p, sw: 2.4 })}
            {D.ctext(railX + 28, y - (it.detail ? 9 : 0), it.label, { size: 14, weight: 600, fill: c.deep, anchor: 'start', maxW: 470, maxLines: 1 })}
            {it.detail ? D.ctext(railX + 28, y + 13, it.detail, { size: 11, fill: GREY, anchor: 'start', maxW: 500, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: t.y0 + n * rowH + 8, el: els };
    },
  };

  D9.dial = {
    name: 'Dial',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const vs = seriesOf(IT);
      const R = 168, r = 134;
      const cx = 360, cy = t.y0 + R + 34;
      const per = 180 / n;
      let maxI = 0;
      vs.forEach((v, i) => { if (v > vs[maxI]) maxI = i; });
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const a1 = 180 + i * per + 1.5, a2 = 180 + (i + 1) * per - 1.5;
        els.push(<g key={'seg' + i}>{D.path(ringSeg(cx, cy, R, r, a1, a2), { fill: c.p, stroke: '#fff', sw: 1.4, fillOpacity: i === maxI ? 0.95 : 0.3 })}</g>);
        const mid = (a1 + a2) / 2;
        const [lx, ly] = polar(cx, cy, R + 32, mid);
        els.push(
          <g key={'it' + i}>
            {D.ctext(lx, ly - (it.value ? 8 : 0), it.label, { size: 11.5, weight: 600, fill: c.deep, maxW: 112, maxLines: 2 })}
            {it.value ? D.ctext(lx, ly + 12, it.value, { size: 10.5, weight: 700, fill: c.p, maxW: 100, maxLines: 1 }) : null}
          </g>
        );
      });
      const needleA = 180 + maxI * per + per / 2;
      const [nx, ny] = polar(cx, cy, r - 20, needleA);
      els.push(<g key="needle">{D.line(cx, cy, nx, ny, { stroke: window.GlyphDraw.INK, sw: 3 })}{D.circle(cx, cy, 9, { fill: window.GlyphDraw.INK, stroke: window.GlyphDraw.INK })}</g>);
      return { h: cy + 26, el: els };
    },
  };

  D9.segments = {
    name: 'Segments',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const vs = seriesOf(IT);
      const tot = vs.reduce((a, b) => a + b, 0) || 1;
      const x0 = 40, x1 = W - 40;
      const span = x1 - x0, bh = 56;
      const by = t.y0 + 112;
      const els = [t.el];
      const raw = vs.map((v) => Math.max(26, (span * v) / tot));
      const scale = span / raw.reduce((a, b) => a + b, 0);
      const ws = raw.map((w) => w * scale);
      // labels live in evenly-spaced slots per row so they can never collide
      const variant = spec.variant || 'alternate';
      const upFn = (i) => (variant === 'above' ? true : variant === 'below' ? false : i % 2 === 0);
      const upIdx = IT.map((_, i) => i).filter((i) => upFn(i));
      const dnIdx = IT.map((_, i) => i).filter((i) => !upFn(i));
      const labelX = [];
      upIdx.forEach((i, k) => { labelX[i] = x0 + (span / upIdx.length) * (k + 0.5); });
      dnIdx.forEach((i, k) => { labelX[i] = x0 + (span / Math.max(1, dnIdx.length)) * (k + 0.5); });
      let x = x0;
      IT.forEach((it, i) => {
        const c = A(i);
        const sw = ws[i];
        const up = upFn(i);
        const mx = x + sw / 2, lx = labelX[i];
        const lw = span / Math.max(1, up ? upIdx.length : dnIdx.length) - 14;
        const narrow = !(sw > 54 && it.value);
        els.push(<g key={'lead' + i}>{D.path(`M${mx.toFixed(1)} ${up ? by - 4 : by + bh + 4} L${lx.toFixed(1)} ${up ? by - 30 : by + bh + 30}`, { fill: 'none', stroke: c.mid, sw: 1.2 })}</g>);
        els.push(
          <g key={'it' + i}>
            {D.box(x, by, sw - 3, bh, { fill: c.p, stroke: c.p, rx: i === 0 ? 10 : 3, fillOpacity: pal.multi ? 0.94 : 0.4 + (0.55 * (n - i)) / n })}
            {!narrow ? D.ctext(mx, by + bh / 2, it.value, { size: 12, weight: 700, fill: '#fff', maxW: sw - 12, maxLines: 1 }) : null}
            {D.ctext(lx, up ? by - 56 : by + bh + 48, narrow && it.value ? it.label + ' · ' + it.value : it.label, { size: 11.5, weight: 600, fill: c.deep, maxW: lw, maxLines: 1 })}
            {it.detail ? D.ctext(lx, up ? by - 41 : by + bh + 63, it.detail, { size: 9.5, fill: GREY, maxW: lw, maxLines: 1 }) : null}
          </g>
        );
        x += sw;
      });
      return { h: by + bh + (dnIdx.length ? 86 : 30), el: els };
    },
  };
  D9.segments.variants = [
    { id: 'alternate', name: 'Alternate' },
    { id: 'above', name: 'Labels above' },
    { id: 'below', name: 'Labels below' },
  ];

  D9.ribbon = {
    name: 'Ribbon',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const rowH = 62, bh = 48, notch = 18;
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const y = t.y0 + i * rowH;
        const x = 96, w = W - 96 - 36 - i * 8;
        els.push(
          <g key={'it' + i}>
            {D.poly([[x, y], [x + w, y], [x + w - notch, y + bh / 2], [x + w, y + bh], [x, y + bh]], { fill: pal.multi || i === 0 ? c.p : c.soft, stroke: c.p })}
            {D.circle(52, y + bh / 2, 19, { fill: '#fff', stroke: c.p, sw: 2 })}
            {D.ctext(52, y + bh / 2, String(i + 1), { size: 14, weight: 700, fill: c.p })}
            {D.line(71, y + bh / 2, x, y + bh / 2, { stroke: c.mid, sw: 1.4 })}
            {D.ctext(x + 22, y + bh / 2 - (it.detail ? 9 : 0), it.label, { size: 13, weight: 700, fill: pal.multi || i === 0 ? '#fff' : c.deep, anchor: 'start', maxW: w - notch - 40, maxLines: 1 })}
            {it.detail ? D.ctext(x + 22, y + bh / 2 + 13, it.detail, { size: 10.5, fill: pal.multi || i === 0 ? 'rgba(255,255,255,0.78)' : GREY, anchor: 'start', maxW: w - notch - 40, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: t.y0 + n * rowH + 8, el: els };
    },
  };

  // ---------- catalog: categories + flat order ----------
  const CATEGORIES = [
    { name: 'Flow & process', types: ['flow', 'chevron', 'steps', 'snake', 'metro', 'filmstrip', 'journey', 'ringchain', 'cycle', 'gridcycle', 'semicircle', 'timeline', 'milestones', 'gantt', 'tree', 'fishbone', 'bracket', 'ribbon', 'cascade'] },
    { name: 'Lists & boards', types: ['list', 'cards', 'kanban', 'checklist', 'agenda', 'sticky', 'bento', 'shelf', 'table', 'rowtable', 'matrix', 'honeycomb', 'puzzle', 'puzzlering'] },
    { name: 'Charts & data', types: ['stats', 'ringcards', 'bars', 'columns', 'linechart', 'area', 'donut', 'pie', 'radial', 'gauge', 'gaugerow', 'lollipop', 'bullet', 'pictobar', 'slope', 'waterfall', 'segments', 'dial', 'heatgrid'] },
    { name: 'Relationships', types: ['spokes', 'mindmap', 'hub', 'burst', 'infohub', 'sidehub', 'orbit', 'nested', 'venn', 'overlap', 'bowtie', 'ripple', 'comparison', 'versus', 'proscons', 'diverge', 'converge', 'lens', 'balance', 'target'] },
    { name: 'Metaphors', types: ['funnel', 'sidefunnel', 'funnelarrows', 'discfunnel', 'horn', 'cone', 'pyramid', 'iceberg', 'bulb', 'pencil', 'rocket', 'hourglass', 'mountain', 'stairs', 'ladder', 'pillars', 'bridge', 'gears', 'gearring'] },
  ];
  window.TYPE_CATEGORIES = CATEGORIES;
  window.TYPE_ORDER = CATEGORIES.flatMap((c) => c.types);
})();
