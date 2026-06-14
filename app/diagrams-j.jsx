// Glyph — diagram renderers, part J: funnelarrows, discfunnel, sidehub, gaugerow, pencil
(function () {
  const { GREY, arcPath, palAt, numOf } = window.GlyphDraw;
  const I = window.GlyphIcons;
  window.DIAGRAMS = window.DIAGRAMS || {};
  const D9 = window.DIAGRAMS;
  const W = 720;

  function pctOf(it, items, i) {
    const m = String(it.value || '').match(/(\d+\.?\d*)\s*%/);
    if (m) return Math.min(100, parseFloat(m[1]));
    const v = numOf(it);
    if (v != null) {
      const vs = items.map(numOf).filter((x) => x != null);
      const max = Math.max(...vs, 1);
      return Math.max(8, Math.min(100, (v / max) * 100));
    }
    return 70;
  }

  // ---- funnelarrows: grey cone with alternating arrow banners + side notes ----
  D9.funnelarrows = {
    name: 'Arrow funnel',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const fx = 370;
      const topY = t.y0 + 12;
      const rowGap = 80;
      const bottomY = topY + 56 + n * rowGap + 14;
      const els = [t.el];
      els.push(
        <g key="cone">
          {D.poly([[fx - 196, topY + 28], [fx + 196, topY + 28], [fx + 30, bottomY], [fx - 30, bottomY]], { fill: GREY, stroke: 'none', fillOpacity: 0.1 })}
          {D.ellipse(fx, topY + 26, 200, 24, { fill: GREY, stroke: 'none', fillOpacity: 0.16 })}
        </g>
      );
      IT.forEach((it, i) => {
        const c = A(i);
        const cy = topY + 82 + i * rowGap;
        const w = Math.max(150, 380 - i * 44);
        const b1 = fx - w / 2, b2 = fx + w / 2;
        const left = i % 2 === 0;
        const tip = left ? b1 - 26 : b2 + 26;
        const body = left
          ? [[tip, cy], [b1, cy - 33], [b1, cy - 23], [b2, cy - 23], [b2, cy + 23], [b1, cy + 23], [b1, cy + 33]]
          : [[tip, cy], [b2, cy - 33], [b2, cy - 23], [b1, cy - 23], [b1, cy + 23], [b2, cy + 23], [b2, cy + 33]];
        const sx = left ? 30 : W - 30;
        const gapA = left ? 24 : tip + 32;
        const gapB = left ? tip - 32 : W - 24;
        const cxT = (gapA + gapB) / 2, mw = Math.max(60, gapB - gapA - 6);
        // shift the band label away from the icon side so they don't collide on narrow bands
        const labelCx = fx + (left ? 20 : -20);
        const labelMaxW = Math.max(72, w - 74);
        els.push(
          <g key={'it' + i}>
            {D.poly(body, { fill: c.soft, stroke: c.p })}
            {D.ctext(labelCx, cy, it.label, { size: 13, weight: 700, fill: c.deep, maxW: labelMaxW, maxLines: 2 })}
            {D.line(tip + (left ? -4 : 4), cy, sx, cy, { stroke: c.p, sw: 1.4 })}
            {D.poly([[sx - 5, cy], [sx, cy - 5], [sx + 5, cy], [sx, cy + 5]], { fill: c.p, stroke: c.p })}
            {it.value ? D.ctext(cxT, cy - 28, it.value, { size: 12, weight: 700, fill: c.deep, maxW: mw, maxLines: 1 }) : null}
            {it.detail ? D.ctext(cxT, cy + (it.value ? 14 : 0) - 14, it.detail, { size: 10, fill: GREY, maxW: mw, maxLines: it.value ? 2 : 3 }) : null}
          </g>
        );
        const icoX = left ? b1 + 22 : b2 - 22;
        els.push(<g key={'ico' + i}>{D.circle(icoX, cy, 14, { fill: c.p, stroke: '#fff', sw: 1.5 })}{I.draw(icoX, cy, 16, I.nameFor(it), '#fff', 2)}</g>);
      });
      return { h: bottomY + 18, el: els };
    },
  };

  // ---- discfunnel: stacked 3D discs (or grey cone + slanted banners) + numbered legend ----
  D9.discfunnel = {
    name: 'Disc funnel',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const banners = (spec.variant || 'discs') === 'banners';
      const rowH = 86;
      const els = [t.el];
      if (banners) {
        const fx = 190;
        const bottomY = t.y0 + n * rowH + 6;
        els.push(
          <g key="cone">
            {D.poly([[fx - 148, t.y0 + 30], [fx + 148, t.y0 + 30], [fx + 22, bottomY], [fx - 22, bottomY]], { fill: GREY, stroke: 'none', fillOpacity: 0.12 })}
            {D.ellipse(fx, t.y0 + 28, 152, 20, { fill: GREY, stroke: 'none', fillOpacity: 0.2 })}
          </g>
        );
        IT.forEach((it, i) => {
          const c = A(i);
          const y = t.y0 + 30 + i * rowH;
          const cy = y + 30;
          els.push(
            <g key={'it' + i}>
              {D.circle(fx, cy, 16, { fill: '#fff', stroke: c.p, sw: 1.8 })}
              {D.ctext(fx, cy, String(i + 1), { size: 12, weight: 700, fill: c.deep })}
              {D.poly([[384, y], [624, y], [600, y + 60], [360, y + 60]], { fill: c.soft, stroke: c.p })}
              {D.text(404, y + 26, it.label, { size: 12.5, weight: 700, fill: c.deep, maxW: 180, maxLines: 1 })}
              {it.detail ? D.text(404, y + 46, it.detail, { size: 10, fill: GREY, maxW: 180, maxLines: 1 }) : null}
              {D.text(636, y + 52, String(i + 1), { size: 44, weight: 800, fill: c.mid, maxW: 70, maxLines: 1 })}
            </g>
          );
          els.push(<g key={'ico' + i}>{D.circle(fx, cy, 16, { fill: c.p, stroke: '#fff', sw: 1.8 })}{I.draw(fx, cy, 16, I.nameFor(it), '#fff', 2)}</g>);
        });
        return { h: bottomY + 20, el: els };
      }
      const cx = 205;
      IT.forEach((it, i) => {
        const c = A(i);
        const y = t.y0 + i * rowH + 6;
        const cy = y + 36;
        const rx = Math.max(60, 168 - (i * 108) / Math.max(1, n - 1));
        els.push(
          <g key={'it' + i}>
            {D.box(cx - rx, y + 18, 2 * rx, 30, { fill: c.p, stroke: c.p, rx: 2 })}
            {D.ellipse(cx, y + 48, rx, 15, { fill: c.p, stroke: c.p })}
            {D.ellipse(cx, y + 18, rx, 15, { fill: c.mid, stroke: c.p })}
            {D.text(396, cy + 8, String(i + 1).padStart(2, '0'), { size: 22, weight: 800, fill: c.p, maxW: 50, maxLines: 1 })}
            {D.text(446, cy - 4, it.label, { size: 12.5, weight: 700, fill: c.deep, maxW: it.value ? 170 : 244, maxLines: 1 })}
            {it.value ? D.ctext(690, cy - 4, it.value, { size: 12, weight: 700, fill: c.deep, anchor: 'end', maxW: 80, maxLines: 1 }) : null}
            {it.detail ? D.text(446, cy + 17, it.detail, { size: 10, fill: GREY, maxW: 244, maxLines: 2 }) : null}
            {D.line(392, y + 74, 684, y + 74, { stroke: c.p, sw: 2 })}
            {D.poly([[684, y + 69], [690, y + 74], [684, y + 79], [678, y + 74]], { fill: c.p, stroke: c.p })}
          </g>
        );
        els.push(<g key={'ico' + i}>{I.draw(cx, y + 18, 16, I.nameFor(it), '#fff', 2)}</g>);
      });
      return { h: t.y0 + n * rowH + 16, el: els };
    },
  };
  D9.discfunnel.variants = [
    { id: 'discs', name: '3D discs' },
    { id: 'banners', name: 'Cone + banners' },
  ];

  // ---- sidehub: orbited core with numbered callouts in two side columns ----
  D9.sidehub = {
    name: 'Hub callouts',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const nL = Math.ceil(n / 2), nR = n - nL;
      const rowGap = 104;
      const bodyH = Math.max(320, Math.max(nL, nR) * rowGap);
      const cx = 360, cy = t.y0 + bodyH / 2;
      const hubC = A(n);
      const short = (spec.title || '').split(/\s+/).slice(0, 6).join(' ');
      const els = [t.el];
      els.push(
        <g key="hub">
          {D.circle(cx, cy, 122, { fill: 'none', stroke: GREY, sw: 1.4 })}
          {D.circle(cx, cy, 84, { fill: hubC.soft, stroke: hubC.p, sw: 2 })}
          {D.ctext(cx, cy, short, { size: 13, weight: 700, fill: hubC.deep, maxW: 130, maxLines: 4 })}
        </g>
      );
      IT.forEach((it, i) => {
        const ang = -90 + (i * 360) / n;
        const ox = cx + 122 * Math.cos((ang * Math.PI) / 180);
        const oy = cy + 122 * Math.sin((ang * Math.PI) / 180);
        els.push(
          <g key={'od' + i}>
            {D.circle(ox, oy, 16, { fill: '#fff', stroke: A(i).p, sw: 1.6 })}
            {I ? I.draw(ox, oy, 18, I.nameFor(it), A(i).p, 2) : null}
          </g>
        );
      });
      IT.forEach((it, i) => {
        const c = A(i);
        const left = i < nL;
        const k = left ? i : i - nL;
        const rows = left ? nL : nR;
        const cyR = cy + (k - (rows - 1) / 2) * rowGap;
        const bx = left ? 56 : 664;
        els.push(
          <g key={'it' + i}>
            {D.circle(bx, cyR, 22, { fill: c.soft, stroke: c.p, sw: 1.8 })}
            {D.ctext(bx, cyR, String(i + 1).padStart(2, '0'), { size: 13, weight: 700, fill: c.deep })}
            {left ? D.text(92, cyR - 7, it.label, { size: 12.5, weight: 700, fill: c.deep, maxW: 142, maxLines: 1 })
                  : D.ctext(628, cyR - 7, it.label, { size: 12.5, weight: 700, fill: c.deep, anchor: 'end', maxW: 142, maxLines: 1 })}
            {it.detail ? (left
              ? D.text(92, cyR + 14, it.detail, { size: 10, fill: GREY, maxW: 142, maxLines: 2 })
              : D.ctext(628, cyR + 14, it.detail, { size: 10, fill: GREY, anchor: 'end', maxW: 142, maxLines: 2 })) : null}
          </g>
        );
      });
      return { h: t.y0 + bodyH + 16, el: els };
    },
  };

  // ---- gaugerow: open C-gauges, one per stat, label + detail below ----
  D9.gaugerow = {
    name: 'Gauge row',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const cols = Math.min(n, 4);
      const cw = (W - 48) / cols;
      const R = Math.min(62, cw / 2 - 28);
      const rowH = 2 * R + 132;
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const col = i % cols, row = Math.floor(i / cols);
        const cx = 24 + col * cw + cw / 2;
        const cy = t.y0 + R + 26 + row * rowH;
        const pct = pctOf(it, IT, i);
        const sweep = Math.max(18, (320 * pct) / 100);
        els.push(
          <g key={'it' + i}>
            {D.path(arcPath(cx, cy, R, -90, 230), { fill: 'none', stroke: c.soft, sw: 16 })}
            {D.path(arcPath(cx, cy, R, -90, -90 + sweep), { fill: 'none', stroke: c.p, sw: 16 })}
            {D.ctext(cx, cy, it.value || Math.round(pct) + '%', { size: 20, weight: 700, fill: c.deep, maxW: R * 1.5, maxLines: 1 })}
            {D.ctext(cx, cy + R + 32, it.label, { size: 12.5, weight: 700, fill: c.deep, maxW: cw - 26, maxLines: 1 })}
            {it.detail ? D.ctext(cx, cy + R + 60, it.detail, { size: 10, fill: GREY, maxW: cw - 28, maxLines: 3 }) : null}
          </g>
        );
      });
      return { h: t.y0 + Math.ceil(n / cols) * rowH + 4, el: els };
    },
  };

  // ---- pencil: pencil spine with banner rows ----
  D9.pencil = {
    name: 'Pencil list',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const variant = spec.variant;
      const rowH = 62, gap = 16;
      const els = [t.el];

      if (variant === 'split') {
        // Two pencil columns: left [0..half-1], right [half..n-1]
        const half = Math.ceil(n / 2);
        const sides = [IT.slice(0, half), IT.slice(half)];
        // Left pencil: px=24, right pencil: px=368; pw narrower to fit in half
        const pw = 40;
        const sideOrigins = [24, 368];
        const bannerOffX = pw + 14; // banner x offset from pencil origin
        const bannerW = 328 - bannerOffX - 4; // banner width per side
        sides.forEach((sideItems, si) => {
          const sn = sideItems.length;
          if (sn === 0) return;
          const ox = sideOrigins[si];
          const globalIdx = si === 0 ? 0 : half;
          const capC = A(globalIdx + sn);
          const rowsBottom = t.y0 + 44 + sn * (rowH + gap) - gap + 12;
          const bx = ox + bannerOffX;
          els.push(
            <g key={'pencil' + si}>
              {D.box(ox, t.y0 + 32, pw / 2, rowsBottom - t.y0 - 32, { fill: GREY, stroke: GREY, rx: 0, fillOpacity: 0.18 })}
              {D.box(ox + pw / 2, t.y0 + 32, pw / 2, rowsBottom - t.y0 - 32, { fill: GREY, stroke: GREY, rx: 0, fillOpacity: 0.32 })}
              {D.box(ox, t.y0, pw, 34, { fill: capC.p, stroke: capC.p, rx: 8 })}
              {D.box(ox, t.y0 + 44, pw, 5, { fill: '#fff', stroke: 'none' })}
              {D.box(ox, t.y0 + 56, pw, 5, { fill: '#fff', stroke: 'none' })}
              {D.poly([[ox, rowsBottom], [ox + pw, rowsBottom], [ox + pw / 2, rowsBottom + 36]], { fill: GREY, stroke: GREY, fillOpacity: 0.16 })}
              {D.poly([[ox + pw / 2 - 8, rowsBottom + 22], [ox + pw / 2 + 8, rowsBottom + 22], [ox + pw / 2, rowsBottom + 36]], { fill: GREY, stroke: GREY })}
            </g>
          );
          sideItems.forEach((it, j) => {
            const gi = globalIdx + j;
            const c = A(gi);
            const y = t.y0 + 44 + j * (rowH + gap);
            const cy = y + rowH / 2;
            const oneLine = !it.detail;
            const circX = bx + 22;
            const textX = bx + 42;
            const textMaxW = bannerW - 52;
            els.push(
              <g key={'it' + gi}>
                {D.box(bx, y, bannerW, rowH, { fill: c.soft, stroke: c.p, rx: 10 })}
                {D.text(textX, oneLine ? cy + 5 : y + 26, it.label, { size: 11, weight: 700, fill: c.deep, maxW: it.value ? textMaxW - 52 : textMaxW, maxLines: 1 })}
                {it.detail ? D.text(textX, y + 47, it.detail, { size: 9.5, fill: GREY, maxW: it.value ? textMaxW - 52 : textMaxW, maxLines: 1 }) : null}
                {it.value ? D.ctext(bx + bannerW - 8, cy, it.value, { size: 10.5, weight: 700, fill: c.deep, anchor: 'end', maxW: 60, maxLines: 1 }) : null}
              </g>
            );
            els.push(<g key={'ico' + gi}>{D.circle(circX, cy, 12, { fill: c.p, stroke: '#fff', sw: 1.6 })}{I.draw(circX, cy, 14, I.nameFor(it), '#fff', 2)}</g>);
          });
        });
        // Height determined by taller side (left, which has ceil(n/2) items)
        const tallBottom = t.y0 + 44 + half * (rowH + gap) - gap + 12;
        return { h: tallBottom + 50, el: els };
      }

      // Default single-column layout
      const px = 96, pw = 56;
      const capC = A(n);
      const rowsBottom = t.y0 + 44 + n * (rowH + gap) - gap + 12;
      els.push(
        <g key="pencil">
          {D.box(px, t.y0 + 32, pw / 2, rowsBottom - t.y0 - 32, { fill: GREY, stroke: GREY, rx: 0, fillOpacity: 0.18 })}
          {D.box(px + pw / 2, t.y0 + 32, pw / 2, rowsBottom - t.y0 - 32, { fill: GREY, stroke: GREY, rx: 0, fillOpacity: 0.32 })}
          {D.box(px, t.y0, pw, 34, { fill: capC.p, stroke: capC.p, rx: 8 })}
          {D.box(px, t.y0 + 44, pw, 5, { fill: '#fff', stroke: 'none' })}
          {D.box(px, t.y0 + 56, pw, 5, { fill: '#fff', stroke: 'none' })}
          {D.poly([[px, rowsBottom], [px + pw, rowsBottom], [px + pw / 2, rowsBottom + 42]], { fill: GREY, stroke: GREY, fillOpacity: 0.16 })}
          {D.poly([[px + pw / 2 - 10, rowsBottom + 27], [px + pw / 2 + 10, rowsBottom + 27], [px + pw / 2, rowsBottom + 42]], { fill: GREY, stroke: GREY })}
        </g>
      );
      IT.forEach((it, i) => {
        const c = A(i);
        const y = t.y0 + 44 + i * (rowH + gap);
        const cy = y + rowH / 2;
        const oneLine = !it.detail;
        els.push(
          <g key={'it' + i}>
            {D.box(140, y, 556, rowH, { fill: c.soft, stroke: c.p, rx: 12 })}
            {D.text(202, oneLine ? cy + 5 : y + 26, it.label, { size: 12.5, weight: 700, fill: c.deep, maxW: it.value ? 380 : 466, maxLines: 1 })}
            {it.detail ? D.text(202, y + 47, it.detail, { size: 10.5, fill: GREY, maxW: it.value ? 380 : 466, maxLines: 1 }) : null}
            {it.value ? D.ctext(676, cy, it.value, { size: 12, weight: 700, fill: c.deep, anchor: 'end', maxW: 84, maxLines: 1 }) : null}
          </g>
        );
        els.push(<g key={'ico' + i}>{D.circle(174, cy, 14, { fill: c.p, stroke: '#fff', sw: 1.6 })}{I.draw(174, cy, 16, I.nameFor(it), '#fff', 2)}</g>);
      });
      return { h: rowsBottom + 56, el: els };
    },
  };
  D9.pencil.variants = [
    { id: 'normal', name: 'Single column' },
    { id: 'split', name: 'Two columns' },
  ];
})();
