// Glyph — diagram renderers, part I: infohub, semicircle, ringflow, rowtable, sidefunnel
(function () {
  const { GREY, arcPath, palAt } = window.GlyphDraw;
  window.DIAGRAMS = window.DIAGRAMS || {};
  const D9 = window.DIAGRAMS;
  const W = 720;
  const rad = (a) => (a * Math.PI) / 180;
  const pt = (cx, cy, r, a) => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];

  // ---- infohub: central topic card wired to numbered info banners on the right ----
  D9.infohub = {
    name: 'Info hub',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const variant = spec.variant;
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const short = (spec.title || '').split(/\s+/).slice(0, 6).join(' ');

      if (variant === 'split') {
        const right = IT.map((it, i) => [it, i]).filter(([, i]) => i % 2 === 0);
        const left  = IT.map((it, i) => [it, i]).filter(([, i]) => i % 2 === 1);
        const rows = Math.max(right.length, left.length);
        const rowH = 84, gap = 14;
        const bodyH = Math.max(rows * (rowH + gap) - gap, 168);
        const h = bodyH + 70;
        const cy = h / 2, cx = 360;
        const hubC = A(n);
        const hubW = 160, hubH = Math.min(160, bodyH - 8);
        const hubX = cx - hubW / 2, hubY = cy - hubH / 2;
        const bannerW = 226;
        const bannerXR = cx + hubW / 2 + 24;
        const bannerXL = cx - hubW / 2 - 24 - bannerW;
        const els = [t.el];
        function infohubSide(list, dir) {
          const bannerX = dir > 0 ? bannerXR : bannerXL;
          const bannerCx = bannerX + bannerW / 2;
          const hubEdgeX = dir > 0 ? cx + hubW / 2 : cx - hubW / 2;
          list.forEach(([it, gi], k) => {
            const c = A(gi);
            const y = cy + (k - (list.length - 1) / 2) * (rowH + gap);
            const itemCy = y + rowH / 2;
            const sy = hubY + 24 + (k * (hubH - 48)) / Math.max(1, list.length - 1);
            const vx = dir > 0 ? hubEdgeX + 14 + (k % 3) * 8 : hubEdgeX - 14 - (k % 3) * 8;
            els.push(
              <g key={'cn' + gi}>
                {D.path(`M${hubEdgeX} ${sy}L${vx} ${sy}L${vx} ${itemCy}L${dir > 0 ? bannerX - 4 : bannerX + bannerW + 4} ${itemCy}`, { fill: 'none', stroke: GREY, sw: 1.4 })}
                {D.circle(hubEdgeX + dir * 4, sy, 4.5, { fill: c.p, stroke: c.p })}
                {D.circle(dir > 0 ? bannerX - 7 : bannerX + bannerW + 7, itemCy, 4.5, { fill: c.p, stroke: c.p })}
              </g>
            );
            const icoX = dir > 0 ? bannerX + 20 : bannerX + bannerW - 20;
            const textX = dir > 0 ? bannerX + 48 : bannerX + bannerW - 48;
            const anchor = dir > 0 ? 'start' : 'end';
            const textMaxW = bannerW - 72;
            els.push(
              <g key={'it' + gi}>
                {D.box(bannerX, y, bannerW, rowH, { fill: c.soft, stroke: c.p, rx: 12 })}
                {D.box(dir > 0 ? bannerX + 4 : bannerX + bannerW - 4 - 52, y + 10, 52, rowH - 20, { fill: '#fff', stroke: c.p, rx: 10 })}
                {window.GlyphIcons
                  ? window.GlyphIcons.draw(icoX, y + rowH / 2, 26, (it.label || '') + ' ' + (it.detail || ''), c.p, 1.9)
                  : D.ctext(icoX, y + rowH / 2, String(gi + 1).padStart(2, '0'), { size: 14, weight: 700, fill: c.deep })}
                {D.text(textX, y + 30, it.label, { size: 12.5, weight: 700, fill: c.deep, maxW: textMaxW, maxLines: 1 })}
                {it.detail ? D.text(textX, y + 52, it.detail, { size: 10, fill: GREY, maxW: textMaxW, maxLines: 2 }) : null}
              </g>
            );
          });
        }
        infohubSide(right, 1);
        infohubSide(left, -1);
        els.push(
          <g key="hub">
            {D.box(hubX, hubY, hubW, hubH, { fill: hubC.p, stroke: hubC.p, rx: 6, fillOpacity: 0.16 })}
            {D.box(hubX + 14, hubY + 14, hubW - 28, hubH - 28, { fill: '#fff', stroke: hubC.p, rx: 4 })}
            {D.ctext(cx, cy, short, { size: 12, weight: 700, fill: hubC.deep, maxW: hubW - 44, maxLines: 5 })}
          </g>
        );
        return { h, el: els };
      }

      const rowH = 84, gap = 14;
      const bodyH = n * (rowH + gap) - gap;
      const els = [t.el];
      const hubC = A(n);
      const hubW = 190, hubH = Math.min(168, bodyH - 8);
      const hubX = 30, hubY = t.y0 + bodyH / 2 - hubH / 2;
      const hubR = hubX + hubW;
      IT.forEach((it, i) => {
        const c = A(i);
        const y = t.y0 + i * (rowH + gap);
        const cy = y + rowH / 2;
        const sy = hubY + 24 + (i * (hubH - 48)) / Math.max(1, n - 1);
        const vx = 246 + (i % 3) * 14;
        els.push(
          <g key={'cn' + i}>
            {D.path(`M${hubR} ${sy}L${vx} ${sy}L${vx} ${cy}L290 ${cy}`, { fill: 'none', stroke: GREY, sw: 1.4 })}
            {D.circle(hubR + 4, sy, 4.5, { fill: c.p, stroke: c.p })}
            {D.circle(287, cy, 4.5, { fill: c.p, stroke: c.p })}
          </g>
        );
        els.push(
          <g key={'it' + i}>
            {D.box(300, y + 10, 62, rowH - 20, { fill: '#fff', stroke: c.p, rx: 10 })}
            {window.GlyphIcons
              ? window.GlyphIcons.draw(331, cy, 30, (it.label || '') + ' ' + (it.detail || ''), c.p, 1.9)
              : D.ctext(331, cy, String(i + 1).padStart(2, '0'), { size: 15, weight: 700, fill: c.deep })}
            {D.box(374, y, W - 24 - 374, rowH, { fill: c.soft, stroke: c.p, rx: 12 })}
            {D.text(396, y + 30, it.label, { size: 13.5, weight: 700, fill: c.deep, maxW: W - 24 - 418, maxLines: 1 })}
            {it.detail ? D.text(396, y + 53, it.detail, { size: 10.5, fill: GREY, maxW: W - 24 - 418, maxLines: 2 }) : null}
          </g>
        );
      });
      els.push(
        <g key="hub">
          {D.box(hubX, hubY, hubW, hubH, { fill: hubC.p, stroke: hubC.p, rx: 6, fillOpacity: 0.16 })}
          {D.box(hubX + 16, hubY + 16, hubW - 32, hubH - 32, { fill: '#fff', stroke: hubC.p, rx: 4 })}
          {D.ctext(hubX + hubW / 2, hubY + hubH / 2, short, { size: 13, weight: 700, fill: hubC.deep, maxW: hubW - 52, maxLines: 4 })}
        </g>
      );
      return { h: t.y0 + bodyH + 20, el: els };
    },
  };
  D9.infohub.variants = [
    { id: 'hub-right', name: 'Hub left' },
    { id: 'split', name: 'Two sides' },
  ];

  // ---- semicircle: petal cards fanned under a half-circle arc ----
  D9.semicircle = {
    name: 'Semi circle',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const cx = W / 2, cy = t.y0 + 26, R = 128;
      const dist = R + 116;
      const chord = 2 * dist * Math.sin(Math.PI / (2 * Math.max(2, n)));
      const bw = Math.min(152, chord - 8), bh = 102;
      const els = [t.el, <g key="arc">{D.path(arcPath(cx, cy, R, 0, 180), { fill: 'none', stroke: GREY, sw: 2 })}</g>];
      IT.forEach((it, i) => {
        const c = A(i);
        const ang = 180 - ((i + 0.5) * 180) / n;
        const [dx, dy] = pt(cx, cy, R, ang);
        const [gx, gy] = pt(cx, cy, R + 44, ang);
        const [bx, by] = pt(cx, cy, dist, ang);
        els.push(
          <g key={'it' + i}>
            {D.line(dx, dy, gx, gy, { stroke: c.mid, sw: 1.6 })}
            {D.box(bx - bw / 2, by - bh / 2, bw, bh, { fill: c.p, stroke: c.p, rx: 20, fillOpacity: 0.14 })}
            {D.circle(dx, dy, 7, { fill: c.p, stroke: c.p })}
            {D.circle(gx, gy, 15, { fill: '#fff', stroke: c.p, sw: 1.8 })}
            {D.ctext(gx, gy, String(i + 1), { size: 12, weight: 700, fill: c.deep })}
            {D.ctext(bx, by - (it.detail ? 16 : 0), it.label, { size: 12.5, weight: 700, fill: c.deep, maxW: bw - 24, maxLines: 2 })}
            {it.detail ? D.ctext(bx, by + 20, it.detail, { size: 10, fill: GREY, maxW: bw - 22, maxLines: 2 }) : null}
          </g>
        );
      });
      return { h: cy + dist + bh / 2 + 22, el: els };
    },
  };

  // ---- ringchain: chained rings with alternating label pills + dashed pointers ----
  D9.ringchain = {
    name: 'Ring chain',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const dn = Math.max(1, n - 1);
      const m = 84;
      const step = (W - 2 * m) / dn;
      const r = Math.max(28, Math.min(44, step / 2 - 8));
      const cy = t.y0 + 160;
      const els = [t.el];
      for (let i = 0; i < n - 1; i++) {
        els.push(<g key={'ln' + i}>{D.line(m + i * step + r, cy, m + (i + 1) * step - r, cy, { stroke: A(i).mid, sw: 10 })}</g>);
      }
      IT.forEach((it, i) => {
        const c = A(i);
        const x = n === 1 ? W / 2 : m + i * step;
        const top = i % 2 === 0;
        const pw = Math.min(150, step + 8), ph = 30;
        const pillY = top ? t.y0 + 58 : cy + r + 22;
        const txtW = Math.min(step + 26, 184);
        const a1 = top ? pillY + ph + 6 : pillY - 6;
        const a2 = top ? cy - r - 12 : cy + r + 12;
        els.push(
          <g key={'it' + i}>
            {D.circle(x, cy, r, { fill: '#fff', stroke: c.p, sw: 10 })}
            {D.circle(x, cy, r - 11, { fill: c.soft, stroke: c.p, sw: 1.2 })}
            {D.ctext(x, cy, String(i + 1), { size: 16, weight: 700, fill: c.deep })}
            {D.box(x - pw / 2, pillY, pw, ph, { fill: c.soft, stroke: c.p, rx: 15 })}
            {D.ctext(x, pillY + ph / 2, it.label, { size: 11.5, weight: 700, fill: c.deep, maxW: pw - 18, maxLines: 1 })}
            {D.line(x, a1, x, a2, { stroke: GREY, sw: 1.3, dash: '4 5' })}
            {D.poly(top ? [[x - 5, a2 - 8], [x + 5, a2 - 8], [x, a2]] : [[x - 5, a2 + 8], [x + 5, a2 + 8], [x, a2]], { fill: GREY, stroke: GREY })}
            {it.detail ? D.ctext(x, top ? t.y0 + 26 : pillY + ph + 28, it.detail, { size: 10, fill: GREY, maxW: txtW, maxLines: 3 }) : null}
          </g>
        );
      });
      return { h: cy + r + 22 + 30 + 58, el: els };
    },
  };

  // ---- rowtable: arrow row-tags on a spine + description / metric cells ----
  D9.rowtable = {
    name: 'Row table',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const variant = spec.variant;
      const rowH = 76, gap = 12;
      const els = [t.el];

      if (variant === 'split') {
        // Two-column split: left half [24..352], right half [368..W-24]
        const half = Math.ceil(n / 2);
        const sides = [IT.slice(0, half), IT.slice(half)];
        const colX = [24, 368];
        const colW = 344; // width available per side
        // tag shape fits in ~220px wide space; desc cell fills the rest
        const tagW = 178, tagInset = 12;
        const dxOff = tagW + tagInset; // offset from colX to detail box
        const dw = colW - dxOff;
        sides.forEach((sideItems, si) => {
          const ox = colX[si];
          const sn = sideItems.length;
          const cy0 = t.y0 + rowH / 2;
          const cyN = t.y0 + (sn - 1) * (rowH + gap) + rowH / 2;
          const spineX = ox + 2;
          if (sn > 1) els.push(<g key={'spine' + si}>{D.line(spineX, cy0, spineX, cyN, { stroke: GREY, sw: 1.4 })}</g>);
          sideItems.forEach((it, j) => {
            const gi = si === 0 ? j : half + j;
            const c = A(gi);
            const y = t.y0 + j * (rowH + gap), cy = y + rowH / 2;
            els.push(
              <g key={'it' + gi}>
                {D.poly([[ox - 5, cy], [ox, cy - 5], [ox + 5, cy], [ox, cy + 5]], { fill: GREY, stroke: GREY })}
                {D.line(ox + 5, cy, ox + 14, cy, { stroke: GREY, sw: 1.2 })}
                {D.poly([[ox + 14, y + 8], [ox + tagW - 26, y + 8], [ox + tagW, cy], [ox + tagW - 26, y + rowH - 8], [ox + 14, y + rowH - 8]], { fill: c.soft, stroke: c.p })}
                {D.ctext(ox + tagW / 2, cy, it.label, { size: 11, weight: 700, fill: c.deep, maxW: tagW - 34, maxLines: 2 })}
                {D.box(ox + dxOff, y + 4, dw, rowH - 8, { fill: '#fff', stroke: c.mid, rx: 8 })}
                {D.ctext(ox + dxOff + dw / 2, cy, it.detail || '—', { size: 10, fill: GREY, maxW: dw - 18, maxLines: 3 })}
              </g>
            );
          });
        });
        const tallSide = half;
        return { h: t.y0 + tallSide * (rowH + gap) - gap + 18, el: els };
      }

      // Default single-column layout
      const hasVal = IT.some((it) => it.value);
      const cy0 = t.y0 + rowH / 2;
      const cyN = t.y0 + (n - 1) * (rowH + gap) + rowH / 2;
      if (n > 1) els.push(<g key="spine">{D.line(22, cy0, 22, cyN, { stroke: GREY, sw: 1.4 })}</g>);
      const dx = 256;
      const dw = hasVal ? 286 : W - 24 - dx;
      const vx = dx + dw + 14, vw = W - 24 - vx;
      IT.forEach((it, i) => {
        const c = A(i);
        const y = t.y0 + i * (rowH + gap), cy = y + rowH / 2;
        els.push(
          <g key={'it' + i}>
            {D.poly([[17, cy], [22, cy - 5], [27, cy], [22, cy + 5]], { fill: GREY, stroke: GREY })}
            {D.line(27, cy, 36, cy, { stroke: GREY, sw: 1.2 })}
            {D.poly([[36, y + 8], [214, y + 8], [240, cy], [214, y + rowH - 8], [36, y + rowH - 8]], { fill: c.soft, stroke: c.p })}
            {D.ctext(130, cy, it.label, { size: 12.5, weight: 700, fill: c.deep, maxW: 158, maxLines: 2 })}
            {D.box(dx, y + 4, dw, rowH - 8, { fill: '#fff', stroke: c.mid, rx: 8 })}
            {D.ctext(dx + dw / 2, cy, it.detail || '—', { size: 11, fill: GREY, maxW: dw - 26, maxLines: 3 })}
            {hasVal ? D.box(vx, y + 4, vw, rowH - 8, { fill: c.p, stroke: c.p, rx: 8, fillOpacity: 0.12 }) : null}
            {hasVal ? D.ctext(vx + vw / 2, cy, it.value || '—', { size: 11.5, weight: 700, fill: c.deep, maxW: vw - 20, maxLines: 2 }) : null}
          </g>
        );
      });
      return { h: t.y0 + n * (rowH + gap) - gap + 18, el: els };
    },
  };
  D9.rowtable.variants = [
    { id: 'normal', name: 'Single column' },
    { id: 'split', name: 'Two columns' },
  ];

  // ---- sidefunnel: funnel layers with numbered callouts on the left ----
  D9.sidefunnel = {
    name: 'Funnel callouts',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const intake = (spec.variant || 'plain') === 'intake';
      const fx = 532;
      const topY = t.y0 + (intake ? 86 : 8);
      const layerH = 62, lgap = 5;
      const wTop = 300, wBot = 96;
      const wAt = (k) => wTop - ((wTop - wBot) * k) / n;
      const els = [t.el];
      if (intake) {
        [-118, -70, -22, 26, 74, 118].forEach((ox, k) => {
          const c = A(k);
          els.push(<g key={'dt' + k}>{D.circle(fx + ox, topY - 58 + (k % 2) * 20, 10, { fill: c.p, stroke: c.p })}</g>);
        });
        els.push(<g key="rim">{D.box(fx - wTop / 2 - 14, topY - 16, wTop + 28, 10, { fill: GREY, stroke: GREY, rx: 5 })}</g>);
      }
      IT.forEach((it, i) => {
        const c = A(i);
        const y = topY + i * (layerH + lgap);
        const cy = y + layerH / 2;
        const tw = wAt(i), bw2 = wAt(i + 1);
        const hasV = !!it.value, hasD = !!it.detail;
        const ly = hasD && hasV ? cy - 18 : hasD || hasV ? cy - 12 : cy;
        els.push(
          <g key={'it' + i}>
            {D.poly([[fx - tw / 2, y], [fx + tw / 2, y], [fx + bw2 / 2, y + layerH], [fx - bw2 / 2, y + layerH]], { fill: c.p, stroke: c.p })}
            {D.circle(316, cy, 14, { fill: '#fff', stroke: c.p, sw: 1.8 })}
            {D.ctext(316, cy, String(i + 1), { size: 11.5, weight: 700, fill: c.deep })}
            {D.line(334, cy, fx - (tw + bw2) / 4 + 12, cy, { stroke: GREY, sw: 1.2, dash: '3 5' })}
            {D.ctext(294, ly, it.label, { size: 12.5, weight: 700, fill: c.deep, anchor: 'end', maxW: 264, maxLines: 1 })}
            {hasD ? D.ctext(294, ly + 19, it.detail, { size: 9.5, fill: GREY, anchor: 'end', maxW: 264, maxLines: 2 }) : null}
            {hasV ? D.ctext(294, ly + (hasD ? 40 : 21), it.value, { size: 10.5, weight: 700, fill: c.deep, anchor: 'end', maxW: 264, maxLines: 1 }) : null}
          </g>
        );
      });
      const b = topY + n * (layerH + lgap) - lgap;
      els.push(<g key="spout">{D.poly([[fx - 20, b], [fx + 20, b], [fx + 20, b + 22], [fx, b + 32], [fx - 20, b + 22]], { fill: A(n - 1).p, stroke: A(n - 1).p })}</g>);
      return { h: b + 42, el: els };
    },
  };
  D9.sidefunnel.variants = [
    { id: 'plain', name: 'Funnel + callouts' },
    { id: 'intake', name: 'With intake dots' },
  ];

  // ---- cone: inverted pyramid with numbered caption bars on the left ----
  D9.cone = {
    name: 'Inverted cone',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const rowH = 70, gap = 6;
      const H = n * (rowH + gap) - gap;
      const axisX = 538, halfW = 158;
      const hw = (y) => halfW * Math.max(0, 1 - (y - t.y0) / H);
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const y = t.y0 + i * (rowH + gap);
        const cy = y + rowH / 2;
        const h1 = hw(y), h2 = hw(y + rowH);
        const bx = 70, bw = axisX - h1 - 10 - bx;
        els.push(
          <g key={'it' + i}>
            {D.poly([[axisX - h1, y], [axisX + h1, y], [axisX + h2, y + rowH], [axisX - h2, y + rowH]], { fill: c.p, stroke: c.p })}
            {D.box(bx, y + 6, bw, rowH - 12, { fill: c.soft, stroke: c.p, rx: 8 })}
            {D.circle(bx, cy, 17, { fill: '#fff', stroke: c.p, sw: 1.8 })}
            {D.ctext(bx, cy, String(i + 1).padStart(2, '0'), { size: 11.5, weight: 700, fill: c.deep })}
            {D.text(bx + 30, y + 28, it.label, { size: 12.5, weight: 700, fill: c.deep, maxW: bw - 44 - (it.value ? 76 : 0), maxLines: 1 })}
            {it.detail ? D.text(bx + 30, y + 49, it.detail, { size: 10, fill: GREY, maxW: bw - 44, maxLines: 2 }) : null}
            {it.value ? D.ctext(bx + bw - 14, y + 24, it.value, { size: 11, weight: 700, fill: c.deep, anchor: 'end', maxW: 90, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: t.y0 + H + 18, el: els };
    },
  };
})();
