// Glyph — diagram renderers, part D: bars, columns, linechart, area, donut, pie, radial, gauge, target, slope
(function () {
  const { GREY, polar, palAt, seriesOf, ringSeg } = window.GlyphDraw;
  window.DIAGRAMS = window.DIAGRAMS || {};
  const D9 = window.DIAGRAMS;
  const W = 720;

  D9.bars = {
    name: 'Bars',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const vs = seriesOf(IT), max = Math.max(...vs);
      const rowH = 42, labW = 172;
      const x0 = 24 + labW, span = W - 60 - x0;
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const y = t.y0 + i * rowH + rowH / 2;
        const bw = Math.max(14, (span * vs[i]) / max);
        els.push(
          <g key={'it' + i}>
            {D.ctext(24, y, it.label, { size: 12.5, weight: 600, fill: c.deep, anchor: 'start', maxW: labW - 16, maxLines: 2 })}
            {D.box(x0, y - 12, bw, 24, { fill: c.p, stroke: c.p, rx: 6, fillOpacity: pal.multi ? 0.92 : 0.55 + (0.4 * vs[i]) / max })}
            {D.ctext(x0 + bw + 10, y, it.value || '', { size: 11.5, weight: 700, fill: c.p, anchor: 'start', maxW: 70, maxLines: 1 })}
          </g>
        );
      });
      els.push(<g key="axis">{D.line(x0, t.y0 - 6, x0, t.y0 + n * rowH + 2, { stroke: '#d8d4cd', sw: 1.4 })}</g>);
      return { h: t.y0 + n * rowH + 24, el: els };
    },
  };

  D9.columns = {
    name: 'Column chart',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const vs = seriesOf(IT), max = Math.max(...vs);
      const baseY = t.y0 + 218, maxH = 180;
      const gap = Math.max(8, 26 - n);
      const cw = Math.min(86, (W - 64 - (n - 1) * gap) / n);
      const x0 = (W - (n * cw + (n - 1) * gap)) / 2;
      const els = [t.el];
      els.push(<g key="axis">{D.line(28, baseY, W - 28, baseY, { stroke: '#d8d4cd', sw: 1.4 })}</g>);
      IT.forEach((it, i) => {
        const c = A(i);
        const bh = Math.max(12, (maxH * vs[i]) / max);
        const x = x0 + i * (cw + gap);
        els.push(
          <g key={'it' + i}>
            {D.box(x, baseY - bh, cw, bh, { fill: c.p, stroke: c.p, rx: 6, fillOpacity: pal.multi ? 0.92 : 0.55 + (0.4 * vs[i]) / max })}
            {it.value ? D.ctext(x + cw / 2, baseY - bh - 14, it.value, { size: 11.5, weight: 700, fill: c.p, maxW: cw + 22, maxLines: 1 }) : null}
            {D.ctext(x + cw / 2, baseY + 18, it.label, { size: 10.5, weight: 600, fill: c.deep, maxW: cw + gap - 4, maxLines: 2 })}
          </g>
        );
      });
      return { h: baseY + 52, el: els };
    },
  };

  D9.linechart = {
    name: 'Line chart',
    render(spec, D, pal, fillArea) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const vs = seriesOf(IT), max = Math.max(...vs), min = Math.min(...vs);
      const baseY = t.y0 + 208, topY = t.y0 + 30;
      const x0 = 64, x1 = W - 64;
      const yAt = (v) => (max === min ? (baseY + topY) / 2 : baseY - ((baseY - topY) * (v - min * 0.85)) / (max - min * 0.85));
      const xAt = (i) => (n === 1 ? (x0 + x1) / 2 : x0 + (i * (x1 - x0)) / (n - 1));
      const els = [t.el];
      els.push(<g key="axis">{D.line(40, baseY, W - 40, baseY, { stroke: '#d8d4cd', sw: 1.4 })}</g>);
      const pts = IT.map((_, i) => [xAt(i), yAt(vs[i])]);
      if (fillArea) {
        const dArea = 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') + ` L${x1} ${baseY} L${x0} ${baseY} Z`;
        els.push(<g key="area">{D.path(dArea, { fill: A(0).p, fillOpacity: 0.14 })}</g>);
      }
      const dLine = 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
      els.push(<g key="line">{D.path(dLine, { fill: 'none', stroke: A(0).p, sw: 2.4 })}</g>);
      IT.forEach((it, i) => {
        const c = A(i);
        const [x, y] = pts[i];
        els.push(
          <g key={'it' + i}>
            {D.circle(x, y, 6, { fill: '#fff', stroke: c.p, sw: 2.4 })}
            {it.value ? D.ctext(x, y - 18, it.value, { size: 11, weight: 700, fill: c.p, maxW: 90, maxLines: 1 }) : null}
            {D.ctext(x, baseY + 18, it.label, { size: 10.5, weight: 600, fill: c.deep, maxW: (x1 - x0) / Math.max(1, n - 1) - 6, maxLines: 2 })}
          </g>
        );
      });
      return { h: baseY + 52, el: els };
    },
  };

  D9.area = {
    name: 'Area chart',
    render(spec, D, pal) {
      return D9.linechart.render(spec, D, pal, true);
    },
  };

  function legend(D, A, IT, x, y0, maxW) {
    const els = [];
    IT.forEach((it, i) => {
      const c = A(i);
      const y = y0 + i * 34;
      els.push(
        <g key={'it' + i}>
          {D.box(x, y - 7, 14, 14, { fill: c.p, stroke: c.p, rx: 4 })}
          {D.ctext(x + 24, y - (it.detail ? 8 : 0), it.label + (it.value ? '  ·  ' + it.value : ''), { size: 12, weight: 600, fill: c.deep, anchor: 'start', maxW: maxW, maxLines: 1 })}
          {it.detail ? D.ctext(x + 24, y + 11, it.detail, { size: 9.5, fill: GREY, anchor: 'start', maxW: maxW, maxLines: 1 }) : null}
        </g>
      );
    });
    return els;
  }

  D9.donut = {
    name: 'Donut',
    render(spec, D, pal, asPie) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const vs = seriesOf(IT);
      const tot = vs.reduce((a, b) => a + b, 0) || 1;
      const R = 118, r = asPie ? 0 : 62;
      const cx = 190, cy = t.y0 + R + 16;
      const els = [t.el];
      let a = -90;
      IT.forEach((it, i) => {
        const c = A(i);
        const sweep = Math.max(4, (360 * vs[i]) / tot) - 1.5;
        const d = asPie
          ? (() => { const [sx, sy] = polar(cx, cy, R, a); const [ex, ey] = polar(cx, cy, R, a + sweep); return `M${cx} ${cy} L${sx.toFixed(1)} ${sy.toFixed(1)} A${R} ${R} 0 ${sweep > 180 ? 1 : 0} 1 ${ex.toFixed(1)} ${ey.toFixed(1)} Z`; })()
          : ringSeg(cx, cy, R, r, a, a + sweep);
        const mid = a + sweep / 2;
        a += sweep + 1.5;
        els.push(<g key={'seg' + i}>{D.path(d, { fill: c.p, stroke: '#fff', sw: 1.5, fillOpacity: pal.multi ? 0.95 : 0.4 + (0.6 * (n - i)) / n })}</g>);
        if (sweep > 24 && it.value) {
          const [vx, vy] = polar(cx, cy, asPie ? R * 0.62 : (R + r) / 2, mid);
          els.push(<g key={'sv' + i}>{D.ctext(vx, vy, it.value, { size: 11, weight: 700, fill: '#fff', maxW: 60, maxLines: 1 })}</g>);
        }
      });
      if (!asPie) els.push(<g key="ctr">{D.ctext(cx, cy, String(IT.length) + ' parts', { size: 12, weight: 600, fill: GREY, maxW: 100, maxLines: 1 })}</g>);
      els.push(...legend(D, A, IT, 356, t.y0 + 24, 320));
      return { h: Math.max(cy + R + 22, t.y0 + 24 + n * 34 + 6), el: els };
    },
  };

  D9.pie = {
    name: 'Pie',
    render(spec, D, pal) {
      return D9.donut.render(spec, D, pal, true);
    },
  };

  D9.radial = {
    name: 'Radial bars',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const vs = seriesOf(IT), max = Math.max(...vs);
      const variant = spec.variant || 'open';
      const SPAN = variant === 'semi' ? 180 : variant === 'full' ? 332 : 262;
      const START = variant === 'semi' ? -180 : -90;
      const R0 = 32, Rmax = 158; // fixed footprint regardless of item count
      const step = (Rmax - R0) / n;
      const band = Math.min(20, step * 0.58);
      const cx = 200, cy = t.y0 + Rmax + 14;
      const arc = window.GlyphDraw.arcPath;
      const els = [t.el];
      const I = window.GlyphIcons;
      IT.forEach((it, i) => {
        const c = A(i);
        const R = Rmax - i * step - band / 2; // first item = outer ring
        const sweep = Math.max(4, (SPAN * vs[i]) / max);
        els.push(<g key={'trk' + i}>{D.path(arc(cx, cy, R, START, START + SPAN), { fill: 'none', stroke: '#efece7', sw: band })}</g>);
        els.push(<g key={'seg' + i}>{D.path(arc(cx, cy, R, START, START + sweep), { fill: 'none', stroke: c.p, sw: band })}</g>);
      });
      const legX = 424;
      els.push(...legend(D, A, IT, legX + 26, t.y0 + 26, 244));
      if (I) IT.forEach((it, i) => {
        const c = A(i);
        const ly = t.y0 + 26 + i * 34;
        els.push(<g key={'ico' + i}>{I.draw(legX + 9, ly, 19, I.nameFor(it), c.p, 2)}</g>);
      });
      const bot = variant === 'semi' ? cy + 26 : cy + Rmax + 18;
      return { h: Math.max(bot, t.y0 + 26 + n * 34 + 10), el: els };
    },
  };
  D9.radial.variants = [
    { id: 'open', name: 'Open ring' },
    { id: 'semi', name: 'Semicircle' },
    { id: 'full', name: 'Full circle' },
  ];

  D9.gauge = {
    name: 'Gauge',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const R = 172, r = 116;
      const cx = 360, cy = t.y0 + R + 30;
      const els = [t.el];
      const per = 180 / n;
      IT.forEach((it, i) => {
        const c = A(i);
        const a1 = 180 + i * per + 1, a2 = 180 + (i + 1) * per - 1;
        els.push(<g key={'seg' + i}>{D.path(ringSeg(cx, cy, R, r, a1, a2), { fill: c.p, stroke: '#fff', sw: 1.5, fillOpacity: pal.multi ? 0.95 : 0.35 + (0.62 * i) / Math.max(1, n - 1) })}</g>);
        const mid = (a1 + a2) / 2;
        const [lx, ly] = polar(cx, cy, R + 34, mid);
        const [tx, ty] = polar(cx, cy, R + 6, mid);
        const [sx, sy] = polar(cx, cy, R - 2, mid);
        els.push(<g key={'tick' + i}>{D.line(sx, sy, tx, ty, { stroke: c.mid, sw: 1.2 })}</g>);
        els.push(
          <g key={'it' + i}>
            {D.ctext(lx, ly - (it.value ? 8 : 0), it.label, { size: 11.5, weight: 600, fill: c.deep, maxW: 116, maxLines: 2 })}
            {it.value ? D.ctext(lx, ly + 12, it.value, { size: 10.5, weight: 700, fill: c.p, maxW: 100, maxLines: 1 }) : null}
          </g>
        );
      });
      els.push(<g key="base">{D.line(cx - R, cy, cx - r, cy, { stroke: '#d8d4cd', sw: 1.6 })}{D.line(cx + r, cy, cx + R, cy, { stroke: '#d8d4cd', sw: 1.6 })}</g>);
      return { h: cy + 30, el: els };
    },
  };

  D9.target = {
    name: 'Target',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const Rmax = Math.min(176, 70 + n * 26);
      const cx = 218, cy = t.y0 + Rmax + 16;
      const els = [t.el];
      const Rat = (i) => Rmax - (i * (Rmax - 34)) / n;
      IT.forEach((it, i) => {
        const c = A(i);
        const R = Rat(i);
        const op = pal.multi ? 0.85 : 0.14 + (0.46 * i) / Math.max(1, n - 1);
        // white base under each ring so translucent fills don't compound into a blob
        els.push(<g key={'ringbg' + i}>{D.circle(cx, cy, R, { fill: '#fff', stroke: 'none' })}</g>);
        els.push(<g key={'ring' + i}>{D.circle(cx, cy, R, { fill: c.p, stroke: '#fff', fillOpacity: op, sw: 2 })}</g>);
      });
      const I = window.GlyphIcons;
      IT.forEach((it, i) => {
        const c = A(i);
        const R = Rat(i);
        const Rin = i === n - 1 ? 0 : Rat(i + 1);
        const ringMidY = cy - (R + Rin) / 2;
        const lx = 430, ly = t.y0 + 26 + i * 36;
        const tx = lx + 26; // nudge text right to clear the icon
        els.push(
          <g key={'lead' + i}>
            {D.path(`M${cx} ${ringMidY} C${cx + 90} ${ringMidY} ${lx - 70} ${ly} ${lx - 14} ${ly}`, { fill: 'none', stroke: c.p, sw: 1.3 })}
            {D.circle(cx, ringMidY, 3.6, { fill: c.p, stroke: '#fff', sw: 1.4 })}
          </g>
        );
        if (I) els.push(<g key={'ico' + i}>{I.draw(lx + 9, ly, 19, I.nameFor(it), c.p, 2)}</g>);
        els.push(
          <g key={'it' + i}>
            {D.ctext(tx, ly - (it.detail ? 8 : 0), it.label + (it.value ? '  ·  ' + it.value : ''), { size: 12, weight: 600, fill: c.deep, anchor: 'start', maxW: 244, maxLines: 1 })}
            {it.detail ? D.ctext(tx, ly + 11, it.detail, { size: 9.5, fill: GREY, anchor: 'start', maxW: 244, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: Math.max(cy + Rmax + 20, t.y0 + 26 + n * 36 + 6), el: els };
    },
  };

  D9.slope = {
    name: 'Slope',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      // parse "before → after" number pairs from value/detail; fall back to a flat line
      const parseNums = (it) => (String(it.value || '').match(/-?\d[\d,]*\.?\d*/g) || []).map((s) => parseFloat(s.replace(/,/g, '')));
      const fall = seriesOf(IT);
      const pairs = IT.map((it, i) => {
        const ns = parseNums(it);
        const a = ns.length ? ns[0] : fall[i];
        return [a, ns.length > 1 ? ns[1] : a];
      });
      const all = pairs.reduce((acc, p) => acc.concat(p), []);
      const max = Math.max(...all), min = Math.min(...all);
      const x0 = 240, x1 = 490;
      const topY = t.y0 + 38, botY = t.y0 + 218;
      const yAt = (v) => (max === min ? (topY + botY) / 2 : botY - ((botY - topY) * (v - min)) / (max - min));
      // nudge labels apart so close lines stay readable
      const spread = (ys, gap) => {
        const idx = ys.map((y, i) => [y, i]).sort((p, q) => p[0] - q[0]);
        for (let k = 1; k < idx.length; k++) if (idx[k][0] - idx[k - 1][0] < gap) idx[k][0] = idx[k - 1][0] + gap;
        const out = [];
        idx.forEach(([y, i]) => { out[i] = y; });
        return out;
      };
      const yL = pairs.map((p) => yAt(p[0])), yR = pairs.map((p) => yAt(p[1]));
      const lL = spread(yL, 18), lR = spread(yR, 18);
      const rightText = (it, p) => {
        const parts = String(it.value || '').split(/\s*(?:→|->)\s*/);
        if (parts.length > 1) return parts[parts.length - 1].trim();
        return it.value || String(p[1]);
      };
      const els = [t.el];
      els.push(<g key="axes">{D.line(x0, topY - 16, x0, botY + 14, { stroke: '#d8d4cd', sw: 1.4 })}{D.line(x1, topY - 16, x1, botY + 14, { stroke: '#d8d4cd', sw: 1.4 })}</g>);
      els.push(<g key="axlab">{D.ctext(x0, botY + 34, 'Now', { size: 11, weight: 700, fill: GREY, maxW: 80, maxLines: 1 })}{D.ctext(x1, botY + 34, 'Next', { size: 11, weight: 700, fill: GREY, maxW: 80, maxLines: 1 })}</g>);
      IT.forEach((it, i) => {
        const c = A(i);
        els.push(
          <g key={'it' + i}>
            {D.line(x0, yL[i], x1, yR[i], { stroke: c.p, sw: 2.2 })}
            {D.circle(x0, yL[i], 5, { fill: c.p, stroke: '#fff', sw: 1.6 })}
            {D.circle(x1, yR[i], 5, { fill: c.p, stroke: '#fff', sw: 1.6 })}
            {D.ctext(x0 - 14, lL[i], it.label, { size: 11.5, weight: 600, fill: c.deep, anchor: 'end', maxW: 200, maxLines: 1 })}
            {D.ctext(x1 + 14, lR[i], rightText(it, pairs[i]), { size: 11.5, weight: 700, fill: c.p, anchor: 'start', maxW: 200, maxLines: 1 })}
          </g>
        );
      });
      return { h: botY + 56, el: els };
    },
  };
})();
