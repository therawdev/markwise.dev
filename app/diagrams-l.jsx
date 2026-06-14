// Glyph — diagram renderers, part L: lollipop, bullet, pictobar, overlap, bowtie, ripple, rocket, hourglass
(function () {
  const { GREY, palAt, seriesOf } = window.GlyphDraw;
  const I = window.GlyphIcons;
  window.DIAGRAMS = window.DIAGRAMS || {};
  const D9 = window.DIAGRAMS;
  const W = 720;

  // ---- lollipop: stems with value heads ----
  D9.lollipop = {
    name: 'Lollipop',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const vals = seriesOf(IT);
      const max = Math.max(...vals, 1);
      const rowH = 54;
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const cy = t.y0 + 16 + i * rowH;
        const tip = 178 + (vals[i] / max) * 408;
        els.push(
          <g key={'it' + i}>
            {D.line(178, cy, 626, cy, { stroke: c.mid, sw: 1 })}
            {D.ctext(158, cy, it.label, { size: 12, weight: 700, fill: c.deep, anchor: 'end', maxW: 140, maxLines: 2 })}
            {D.line(178, cy, tip, cy, { stroke: c.p, sw: 3.5 })}
            {D.circle(tip, cy, 13, { fill: c.soft, stroke: c.p, sw: 2.5 })}
            {it.value ? D.text(tip + 22, cy + 4, it.value, { size: 11.5, weight: 700, fill: c.deep, maxW: 88, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: t.y0 + 16 + (n - 1) * rowH + 44, el: els };
    },
  };

  // ---- bullet: thin measure bars inside thick tracks ----
  D9.bullet = {
    name: 'Bullet bars',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const vals = seriesOf(IT);
      const max = Math.max(...vals, 1);
      const rowH = 58;
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const cy = t.y0 + 18 + i * rowH;
        const len = (vals[i] / max) * 440;
        els.push(
          <g key={'it' + i}>
            {D.ctext(158, cy, it.label, { size: 12, weight: 700, fill: c.deep, anchor: 'end', maxW: 140, maxLines: 2 })}
            {D.box(178, cy - 11, 440, 22, { fill: c.soft, stroke: c.mid, sw: 0.8, rx: 5 })}
            {D.box(178, cy - 4.5, Math.max(8, len), 9, { fill: c.p, stroke: c.p, rx: 4 })}
            {D.line(178 + len, cy - 15, 178 + len, cy + 15, { stroke: c.deep, sw: 2 })}
            {it.value ? D.ctext(696, cy, it.value, { size: 11.5, weight: 700, fill: c.deep, anchor: 'end', maxW: 70, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: t.y0 + 18 + (n - 1) * rowH + 46, el: els };
    },
  };

  // ---- pictobar: unit dots, filled by share of max ----
  D9.pictobar = {
    name: 'Unit dots',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const vals = seriesOf(IT);
      const max = Math.max(...vals, 1);
      const rowH = 52;
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const cy = t.y0 + 14 + i * rowH;
        const count = Math.max(1, Math.round((vals[i] / max) * 10));
        els.push(
          <g key={'it' + i}>
            {D.ctext(158, cy, it.label, { size: 12, weight: 700, fill: c.deep, anchor: 'end', maxW: 140, maxLines: 2 })}
            {Array.from({ length: 10 }).map((_, k) => (
              <g key={k}>
                {k < count
                  ? D.circle(188 + k * 32, cy, 10, { fill: c.p, stroke: c.p })
                  : D.circle(188 + k * 32, cy, 10, { fill: 'none', stroke: c.mid, sw: 1.4 })}
              </g>
            ))}
            {it.value ? D.ctext(696, cy, it.value, { size: 11.5, weight: 700, fill: c.deep, anchor: 'end', maxW: 70, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: t.y0 + 14 + (n - 1) * rowH + 42, el: els };
    },
  };

  // ---- overlap: chain of intersecting circles ----
  D9.overlap = {
    name: 'Overlap chain',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const r = Math.min(86, 306 / Math.max(1.4 * n - 0.4, 1.4) * 1.4);
      const s = 1.42 * r;
      const x0 = W / 2 - ((n - 1) * s) / 2;
      const cy = t.y0 + r + 26;
      const hasD = IT.some((it) => it.detail);
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const cx = x0 + i * s;
        const dy = i % 2 === 0 ? cy + r + 30 : cy + r + 74;
        els.push(
          <g key={'it' + i}>
            {D.circle(cx, cy, r, { fill: c.p, stroke: c.p, sw: 1.8, fillOpacity: 0.16 })}
            {D.ctext(cx, cy, it.label, { size: 12.5, weight: 700, fill: c.deep, maxW: r * 1.2, maxLines: 3 })}
            {it.detail ? (
              <g>
                {D.line(cx, cy + r + 5, cx, dy - 14, { stroke: GREY, sw: 1 })}
                {D.ctext(cx, dy, it.detail, { size: 9.5, fill: GREY, maxW: s + 8, maxLines: 2 })}
              </g>
            ) : null}
            {it.value ? D.ctext(cx, cy + (r > 50 ? 26 : r - 8), it.value, { size: 10.5, weight: 700, fill: c.p, maxW: r, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: cy + r + (hasD ? 100 : 30), el: els };
    },
  };

  // ---- bowtie: inputs converge to a knot, outputs fan out ----
  D9.bowtie = {
    name: 'Bowtie',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const nL = Math.ceil(n / 2), nR = n - nL;
      const rowH = 66;
      const bodyH = Math.max(nL, nR, 2) * rowH;
      const cx = 360, cy = t.y0 + bodyH / 2;
      const hubC = A(n);
      const short = (spec.title || '').split(/\s+/).slice(0, 4).join(' ');
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const left = i < nL;
        const k = left ? i : i - nL;
        const rows = left ? nL : nR;
        const cyR = cy + (k - (rows - 1) / 2) * rowH;
        const bx = left ? 24 : 478;
        els.push(
          <g key={'it' + i}>
            {left
              ? D.line(244, cyR, 304, cy, { stroke: GREY, sw: 1.4 })
              : D.line(416, cy, 476, cyR, { stroke: GREY, sw: 1.4 })}
            {D.box(bx, cyR - 26, 218, 52, { fill: c.soft, stroke: c.p, rx: 10 })}
            {I ? I.draw(bx + 26, cyR, 20, I.nameFor(it), c.p, 2) : null}
            {D.ctext(bx + 124, cyR - (it.detail ? 9 : 0), it.label, { size: 12, weight: 700, fill: c.deep, maxW: 162, maxLines: 1 })}
            {it.detail ? D.ctext(bx + 124, cyR + 12, it.detail, { size: 9.5, fill: GREY, maxW: 162, maxLines: 1 }) : null}
          </g>
        );
      });
      els.push(
        <g key="knot">
          {D.circle(cx, cy, 56, { fill: hubC.soft, stroke: hubC.p, sw: 2 })}
          {D.ctext(cx, cy, short, { size: 12, weight: 700, fill: hubC.deep, maxW: 88, maxLines: 3 })}
        </g>
      );
      return { h: t.y0 + bodyH + 16, el: els };
    },
  };

  // ---- ripple: effects radiating from a core ----
  D9.ripple = {
    name: 'Ripple',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const maxR = 52 + (n - 1) * 34;
      const ccx = 226, ccy = t.y0 + maxR + 16;
      const coreC = A(n);
      const els = [t.el, <g key="core">{D.circle(ccx, ccy, 18, { fill: coreC.soft, stroke: coreC.p, sw: 2 })}</g>];
      IT.forEach((it, i) => {
        const c = A(i);
        const r = 52 + i * 34;
        const ang = (-64 + i * 18) * Math.PI / 180;
        const dx = ccx + r * Math.cos(ang), dy = ccy + r * Math.sin(ang);
        const rowCy = t.y0 + 30 + i * 64;
        els.push(
          <g key={'it' + i}>
            {D.circle(ccx, ccy, r, { fill: 'none', stroke: c.p, sw: 1.8 })}
            {D.line(dx, dy, 452, rowCy, { stroke: GREY, sw: 1 })}
            {D.circle(dx, dy, 6, { fill: c.p, stroke: c.p })}
            {D.circle(452, rowCy, 3, { fill: GREY, stroke: GREY })}
            {D.text(466, rowCy - 1, it.label, { size: 12, weight: 700, fill: c.deep, maxW: 224, maxLines: 1 })}
            {it.detail ? D.text(466, rowCy + 18, it.detail, { size: 9.5, fill: GREY, maxW: 224, maxLines: 2 }) : null}
          </g>
        );
      });
      return { h: Math.max(ccy + maxR, t.y0 + 30 + (n - 1) * 64 + 30) + 22, el: els };
    },
  };

  // ---- rocket: ascent trajectory toward a target ----
  D9.rocket = {
    name: 'Trajectory',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const dn = Math.max(1, n - 1);
      const px = (i) => 64 + i * (460 / dn);
      const py = (i) => t.y0 + 308 - i * (208 / dn);
      const tx = 622, ty = t.y0 + 76;
      const els = [t.el];
      [62, 44, 26].forEach((r, k) => {
        els.push(<g key={'ring' + k}>{D.circle(tx, ty, r, { fill: GREY, stroke: 'none', fillOpacity: 0.09 + k * 0.025 })}</g>);
      });
      for (let i = 0; i < n - 1; i++) {
        els.push(<g key={'ln' + i}>{D.line(px(i), py(i), px(i + 1), py(i + 1), { stroke: GREY, sw: 4 })}</g>);
      }
      const lx = px(n - 1), ly = py(n - 1);
      const ang = Math.atan2(ty - ly, tx - lx);
      const ex = tx - 14 * Math.cos(ang), ey = ty - 14 * Math.sin(ang);
      els.push(
        <g key="arrow">
          {D.line(lx, ly, ex - 8 * Math.cos(ang), ey - 8 * Math.sin(ang), { stroke: GREY, sw: 4 })}
          {D.poly([
            [ex - 16 * Math.cos(ang - 0.45), ey - 16 * Math.sin(ang - 0.45)],
            [ex, ey],
            [ex - 16 * Math.cos(ang + 0.45), ey - 16 * Math.sin(ang + 0.45)],
          ], { fill: GREY, stroke: GREY })}
        </g>
      );
      IT.forEach((it, i) => {
        const c = A(i);
        const x = n === 1 ? 340 : px(i), y = n === 1 ? t.y0 + 200 : py(i);
        els.push(
          <g key={'it' + i}>
            {D.circle(x, y, 21, { fill: c.soft, stroke: c.p, sw: 2.2 })}
            {D.ctext(x, y, String(i + 1), { size: 13, weight: 700, fill: c.deep })}
            {D.ctext(x, y + 42, it.label, { size: 11.5, weight: 700, fill: c.deep, maxW: 150, maxLines: 1 })}
            {it.detail ? D.ctext(x, y + 64, it.detail, { size: 9.5, fill: GREY, maxW: 150, maxLines: 2 }) : null}
          </g>
        );
      });
      return { h: t.y0 + 308 + 100, el: els };
    },
  };

  // ---- hourglass: inputs narrow to a waist, then expand into outcomes ----
  D9.hourglass = {
    name: 'Hourglass',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const nT = Math.ceil(n / 2), nB = n - nT;
      const cx = 332;
      const layerH = 56, gap = 4;
      const els = [t.el];
      const wT = (k) => 320 - ((320 - 132) * k) / Math.max(1, nT);
      const wB = (k) => 132 + ((300 - 132) * k) / Math.max(1, nB);
      els.push(<g key="capT">{D.box(cx - 178, t.y0 - 4, 356, 8, { fill: GREY, stroke: GREY, rx: 3, fillOpacity: 0.5 })}</g>);
      const drawLayer = (it, i, y, w1, w2) => {
        const c = A(i);
        const cy = y + layerH / 2;
        els.push(
          <g key={'it' + i}>
            {D.poly([[cx - w1 / 2, y], [cx + w1 / 2, y], [cx + w2 / 2, y + layerH], [cx - w2 / 2, y + layerH]], { fill: c.p, stroke: c.p, fillOpacity: 0.16 })}
            {D.ctext(cx, cy, it.label, { size: 12, weight: 700, fill: c.deep, maxW: Math.min(w1, w2) - 18, maxLines: 2 })}
            {it.detail ? D.ctext(cx + 178 + 90, cy, it.detail, { size: 9.5, fill: GREY, maxW: 172, maxLines: 3 }) : null}
            {it.detail ? D.line(cx + Math.max(w1, w2) / 2 + 8, cy, cx + 170, cy, { stroke: GREY, sw: 1, dash: '3 5' }) : null}
          </g>
        );
      };
      for (let i = 0; i < nT; i++) drawLayer(IT[i], i, t.y0 + 8 + i * (layerH + gap), wT(i), wT(i + 1));
      const waistY = t.y0 + 8 + nT * (layerH + gap) + 4;
      [-10, 2, -3].forEach((ox, k) => {
        els.push(<g key={'sand' + k}>{D.circle(cx + ox, waistY + 6 + k * 7, 2.6, { fill: GREY, stroke: GREY })}</g>);
      });
      const botY = waistY + 30;
      for (let j = 0; j < nB; j++) drawLayer(IT[nT + j], nT + j, botY + j * (layerH + gap), wB(j), wB(j + 1));
      const endY = nB > 0 ? botY + nB * (layerH + gap) : waistY + 26;
      els.push(<g key="capB">{D.box(cx - 178, endY + 2, 356, 8, { fill: GREY, stroke: GREY, rx: 3, fillOpacity: 0.5 })}</g>);
      return { h: endY + 26, el: els };
    },
  };
  // ---- burst: central cog radiating solid icon nodes with colored radial labels ----
  D9.burst = {
    name: 'Icon burst',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const R = n <= 6 ? 140 : 152;
      const cx = 360, cy = t.y0 + R + 96;
      const Ic = window.GlyphIcons;
      const noFill = !!(D.cfg && D.cfg.noFill);
      const els = [t.el];
      IT.forEach((it, i) => {
        const rad = ((-90 + (i * 360) / n) * Math.PI) / 180;
        els.push(<g key={'ln' + i}>{D.line(cx + 54 * Math.cos(rad), cy + 54 * Math.sin(rad), cx + (R - 33) * Math.cos(rad), cy + (R - 33) * Math.sin(rad), { stroke: A(i).mid, sw: 1.6 })}</g>);
      });
      els.push(
        <g key="core">
          {D.circle(cx, cy, 48, { fill: GREY, stroke: GREY, fillOpacity: 0.13 })}
          {Ic ? Ic.draw(cx, cy, 46, 'gear', GREY, 1.4) : null}
        </g>
      );
      IT.forEach((it, i) => {
        const c = A(i);
        const rad = ((-90 + (i * 360) / n) * Math.PI) / 180;
        const x = cx + R * Math.cos(rad), y = cy + R * Math.sin(rad);
        const cosA = Math.cos(rad), sinA = Math.sin(rad);
        els.push(
          <g key={'it' + i}>
            {D.circle(x, y, 29, { fill: c.p, stroke: c.p })}
            {Ic ? Ic.draw(x, y, 28, it.icon || (it.label || '') + ' ' + (it.detail || ''), noFill ? c.p : '#fff', 2) : null}
          </g>
        );
        const side = cosA > 0.38 ? 1 : cosA < -0.38 ? -1 : 0;
        if (side !== 0) {
          const lx = x + side * 42;
          const anchor = side > 0 ? 'start' : 'end';
          els.push(
            <g key={'tx' + i}>
              {D.ctext(lx, y - (it.detail ? 13 : 0), it.label, { size: 12.5, weight: 700, fill: c.p, anchor, maxW: 158, maxLines: 2 })}
              {it.detail ? D.ctext(lx, y + 19, it.detail, { size: 9.5, fill: GREY, anchor, maxW: 158, maxLines: 3 }) : null}
            </g>
          );
        } else {
          const above = sinA < 0;
          els.push(
            <g key={'tx' + i}>
              {D.ctext(x, above ? y - (it.detail ? 84 : 52) : y + 52, it.label, { size: 12.5, weight: 700, fill: c.p, maxW: 200, maxLines: 1 })}
              {it.detail ? D.ctext(x, above ? y - 58 : y + 80, it.detail, { size: 9.5, fill: GREY, maxW: 200, maxLines: 2 }) : null}
            </g>
          );
        }
      });
      return { h: cy + R + 112, el: els };
    },
  };
})();
