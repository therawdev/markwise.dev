// Glyph — diagram renderers, part A: flow, list, timeline, stats, funnel, pyramid
(function () {
  const { GREY, palAt } = window.GlyphDraw;
  const I = window.GlyphIcons;
  window.DIAGRAMS = window.DIAGRAMS || {};
  const D9 = window.DIAGRAMS;
  const W = 720;

  function statVal(it, i) {
    if (it.value) return String(it.value);
    const m = ((it.label || '') + ' ' + (it.detail || '')).match(/[$€£]?\d[\d,.]*\s*[%kKmMbBxX+]?/);
    return m ? m[0].trim() : String(i + 1).padStart(2, '0');
  }

  D9.flow = {
    name: 'Flow',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const variant = spec.variant || 'snake';
      const rows = variant === 'row' ? 1 : Math.max(1, Math.ceil(n / 4));
      const cols = Math.ceil(n / rows);
      const gap = 52, boxH = 100, rowGap = 50;
      const bw = (W - 48 - (cols - 1) * gap) / cols;
      const els = [t.el];
      const pos = [];
      IT.forEach((it, i) => {
        const c = A(i);
        const r = Math.floor(i / cols);
        const jIdx = i % cols;
        const col = variant === 'rows' || r % 2 === 0 ? jIdx : cols - 1 - jIdx;
        const x = 24 + col * (bw + gap);
        const y = t.y0 + r * (boxH + rowGap);
        pos.push({ x, y, r, col });
        const solid = i === 0;
        // icon sits centered above the label so it never overlaps the (centered) text
        els.push(
          <g key={'it' + i}>
            {D.box(x, y, bw, boxH, { fill: solid ? c.p : c.soft, stroke: c.p, rx: 10 })}
            {I.draw(x + bw / 2, y + 21, 21, I.nameFor(it), solid ? '#fff' : c.deep, 2)}
            {D.ctext(x + bw / 2, y + (it.detail ? 54 : 60), it.label, { size: 14, weight: 600, fill: solid ? '#fff' : c.deep, maxW: bw - 18, maxLines: 2 })}
            {it.detail ? D.ctext(x + bw / 2, y + 82, it.detail, { size: 10.5, fill: solid ? 'rgba(255,255,255,0.78)' : GREY, maxW: bw - 18, maxLines: 1 }) : null}
          </g>
        );
      });
      for (let i = 0; i < n - 1; i++) {
        const a = pos[i], b = pos[i + 1];
        const ac = A(i).p;
        if (a.r === b.r) {
          const dir = b.col > a.col ? 1 : -1;
          const x1 = dir > 0 ? a.x + bw : a.x;
          const x2 = dir > 0 ? b.x : b.x + bw;
          els.push(<g key={'a' + i}>{D.arrow(x1 + dir * 7, a.y + boxH / 2, x2 - dir * 7, b.y + boxH / 2, { stroke: ac, sw: 2 })}</g>);
        } else {
          els.push(<g key={'a' + i}>{D.arrow(a.x + bw / 2, a.y + boxH + 7, b.x + bw / 2, b.y - 7, { stroke: ac, sw: 2 })}</g>);
        }
      }
      return { h: t.y0 + rows * boxH + (rows - 1) * rowGap + 26, el: els };
    },
  };
  D9.flow.variants = [
    { id: 'snake', name: 'Snake' },
    { id: 'rows', name: 'Rows' },
    { id: 'row', name: 'Single row' },
  ];

  D9.list = {
    name: 'List',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items;
      const variant = spec.variant || 'one';
      const cols = variant === 'two' ? 2 : 1;
      const ch = 62, gap = 13, cgap = 16;
      const cw = (W - 48 - (cols - 1) * cgap) / cols;
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const x = 24 + (i % cols) * (cw + cgap);
        const y = t.y0 + Math.floor(i / cols) * (ch + gap);
        els.push(
          <g key={'it' + i}>
            {D.box(x, y, cw, ch, { fill: '#fff', stroke: c.mid, rx: 12 })}
            {D.circle(x + 32, y + ch / 2, 16, { fill: c.p, stroke: c.p })}
            {D.ctext(x + 32, y + ch / 2, String(i + 1), { size: 13.5, weight: 700, fill: '#fff' })}
            {D.ctext(x + 64, y + ch / 2 - (it.detail ? 9 : 0), it.label, { size: cols === 2 ? 13 : 15, weight: 600, fill: c.deep, anchor: 'start', maxW: cw - 64 - (it.value ? 96 : 34), maxLines: 1 })}
            {it.detail ? D.ctext(x + 64, y + ch / 2 + 13, it.detail, { size: cols === 2 ? 10.5 : 11.5, fill: GREY, anchor: 'start', maxW: cw - 90, maxLines: 1 }) : null}
            {it.value ? D.ctext(x + cw - 18, y + ch / 2, it.value, { size: cols === 2 ? 12.5 : 14, weight: 700, fill: c.p, anchor: 'end', maxW: 92, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: t.y0 + Math.ceil(IT.length / cols) * (ch + gap) + 13, el: els };
    },
  };
  D9.list.variants = [
    { id: 'one', name: 'Single column' },
    { id: 'two', name: 'Two columns' },
  ];

  D9.timeline = {
    name: 'Timeline',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const variant = spec.variant || 'alternate';
      const upF = (i) => (variant === 'above' ? true : variant === 'below' ? false : i % 2 === 0);
      const ly = t.y0 + 96;
      const x0 = 64, x1 = W - 64;
      const els = [t.el];
      els.push(<g key="ln">{D.arrow(x0 - 24, ly, x1 + 28, ly, { stroke: A(0).mid, sw: 2.5, head: 11 })}</g>);
      IT.forEach((it, i) => {
        const c = A(i);
        const x = n === 1 ? (x0 + x1) / 2 : x0 + (i * (x1 - x0)) / (n - 1);
        const up = upF(i);
        const ty = up ? ly - 34 : ly + 44;
        els.push(
          <g key={'it' + i}>
            {D.line(x, ly, x, up ? ly - 22 : ly + 22, { stroke: c.mid, sw: 1.5 })}
            {D.circle(x, ly, 7, { fill: c.p, stroke: c.p })}
            {it.value ? D.ctext(x, up ? ly - 78 : ly + 88, it.value, { size: 12, weight: 700, fill: c.p, maxW: 120, maxLines: 1 }) : null}
            {D.ctext(x, up ? ty - 22 : ty + 12, it.label, { size: 13.5, weight: 600, fill: c.deep, maxW: 128, maxLines: 2 })}
            {it.detail ? D.ctext(x, up ? ty + 6 : ty + 42, it.detail, { size: 10.5, fill: GREY, maxW: 128, maxLines: 2 }) : null}
          </g>
        );
      });
      return { h: ly + (IT.some((_, i) => !upF(i)) ? 130 : 44), el: els };
    },
  };
  D9.timeline.variants = [
    { id: 'alternate', name: 'Alternate' },
    { id: 'above', name: 'Labels above' },
    { id: 'below', name: 'Labels below' },
  ];

  D9.stats = {
    name: 'Stats',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const M = !!pal.multi;
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const gap = 14;
      const variant = spec.variant || 'auto';
      const cols = variant === 'stack' ? Math.min(n, 2) : variant === 'row' ? n : Math.min(n, 5);
      const rows = Math.ceil(n / cols);
      const cw = (W - 48 - (cols - 1) * gap) / cols;
      const ch = 122;
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const x = 24 + (i % cols) * (cw + gap);
        const ry = t.y0 + Math.floor(i / cols) * (ch + gap);
        const v = statVal(it, i);
        const vs = v.length > 7 ? 21 : v.length > 4 ? 26 : 31;
        els.push(
          <g key={'it' + i}>
            {D.box(x, ry, cw, ch, { fill: M || i === 0 ? c.soft : '#fff', stroke: c.mid, rx: 14 })}
            {D.ctext(x + cw / 2, ry + 40, v, { size: vs, weight: 700, fill: c.p, maxW: cw - 14, maxLines: 1 })}
            {D.ctext(x + cw / 2, ry + 76, it.label, { size: 12.5, weight: 600, fill: c.deep, maxW: cw - 16, maxLines: 2 })}
            {it.detail && cols <= 4 ? D.ctext(x + cw / 2, ry + 104, it.detail, { size: 10.5, fill: GREY, maxW: cw - 16, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: t.y0 + rows * (ch + gap) - gap + 26, el: els };
    },
  };

  D9.funnel = {
    name: 'Funnel',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const M = !!pal.multi;
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const cx = 280, sh = 58, gy = 9;
      const topW = 480, botW = 190;
      const wAt = (k) => topW - ((topW - botW) * k) / Math.max(1, n - 0.2);
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const y = t.y0 + i * (sh + gy);
        const w1 = wAt(i), w2 = wAt(i + 0.85);
        const op = M ? 0.88 : 0.16 + (0.56 * i) / Math.max(1, n - 1);
        const dark = op > 0.42;
        els.push(
          <g key={'it' + i}>
            {D.poly([[cx - w1 / 2, y], [cx + w1 / 2, y], [cx + w2 / 2, y + sh], [cx - w2 / 2, y + sh]], { fill: c.p, fillOpacity: op, stroke: c.p })}
            {I.draw(cx - topW / 2 - 22, y + sh / 2, 22, I.nameFor(it), c.p, 2)}
            {D.ctext(cx, y + sh / 2, it.label, { size: 13.5, weight: 600, fill: dark ? '#fff' : c.deep, maxW: Math.min(w1, w2) - 10, maxLines: 2 })}
            {D.line(cx + w1 / 2 + 10, y + sh / 2, cx + topW / 2 + 26, y + sh / 2, { stroke: c.mid, sw: 1.2 })}
            {it.value ? D.ctext(cx + topW / 2 + 38, y + sh / 2 - (it.detail ? 10 : 0), it.value, { size: 14, weight: 700, fill: c.p, anchor: 'start', maxW: 130, maxLines: 1 }) : null}
            {it.detail ? D.ctext(cx + topW / 2 + 38, y + sh / 2 + (it.value ? 12 : 0), it.detail, { size: 10.5, fill: GREY, anchor: 'start', maxW: 150, maxLines: 2 }) : null}
          </g>
        );
      });
      return { h: t.y0 + n * (sh + gy) + 18, el: els };
    },
  };

  D9.pyramid = {
    name: 'Pyramid',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const M = !!pal.multi;
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const cx = 300, sh = 56, gy = 7;
      const variant = spec.variant || 'point';
      const topW = variant === 'flat' ? 190 : 76, botW = 560;
      const wAt0 = (k) => topW + ((botW - topW) * k) / Math.max(1, n);
      const wAt = variant === 'inverted' ? (k) => wAt0(n - k) : wAt0;
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const y = t.y0 + i * (sh + gy);
        const w1 = wAt(i), w2 = wAt(i + 1);
        const op = M ? 0.88 : 0.62 - (0.45 * i) / Math.max(1, n - 1);
        const dark = op > 0.42;
        els.push(
          <g key={'it' + i}>
            {D.poly([[cx - w1 / 2, y], [cx + w1 / 2, y], [cx + w2 / 2, y + sh], [cx - w2 / 2, y + sh]], { fill: c.p, fillOpacity: op, stroke: c.p })}
            {D.ctext(cx, y + sh / 2, it.label, { size: 13.5, weight: 600, fill: dark ? '#fff' : c.deep, maxW: Math.max(w1, w2) - 10, maxLines: 2 })}
            {it.detail ? (
              <g>
                {D.line(cx + w2 / 2 + 8, y + sh / 2, cx + botW / 2 + 22, y + sh / 2, { stroke: c.mid, sw: 1.2 })}
                {D.ctext(cx + botW / 2 + 32, y + sh / 2, it.detail, { size: 10.5, fill: GREY, anchor: 'start', maxW: 120, maxLines: 3 })}
              </g>
            ) : null}
          </g>
        );
      });
      return { h: t.y0 + n * (sh + gy) + 18, el: els };
    },
  };
  D9.pyramid.variants = [
    { id: 'point', name: 'Pointed' },
    { id: 'flat', name: 'Flat top' },
    { id: 'inverted', name: 'Inverted' },
  ];
  D9.stats.variants = [
    { id: 'auto', name: 'Auto grid' },
    { id: 'stack', name: 'Two-up' },
    { id: 'row', name: 'Single row' },
  ];
})();
