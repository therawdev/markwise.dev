// Glyph — diagram renderers, part G: Napkin-style types — spokes, nested rings, gear ring, puzzle ring, bulb, horn, lens
(function () {
  const { GREY, INK, polar, palAt, ringSeg, hashStr } = window.GlyphDraw;
  const I = window.GlyphIcons;
  window.DIAGRAMS = window.DIAGRAMS || {};
  const D9 = window.DIAGRAMS;
  const W = 720;

  // ---- spokes: hub circle left, icon-pill cards right with elbow connectors ----
  D9.spokes = {
    name: 'Spokes',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const variant = spec.variant;
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;

      if (variant === 'split') {
        const right = IT.map((it, i) => [it, i]).filter(([, i]) => i % 2 === 0);
        const left  = IT.map((it, i) => [it, i]).filter(([, i]) => i % 2 === 1);
        const rows = Math.max(right.length, left.length);
        const rowH = Math.min(82, Math.max(58, 470 / Math.max(1, rows)));
        const pillH = Math.min(64, rowH - 8);
        const icoR = pillH / 2 - 2;
        const h = Math.max(rows * rowH + 70, 250);
        const cy = h / 2, cx = 360;
        const hubR = 52;
        // pill dimensions per side
        const pillW = 196, pillXR = cx + 88, pillXL = cx - 88 - pillW;
        const els = [t.el];
        els.push(
          <g key="hub">
            {D.circle(cx, cy, hubR, { fill: '#fff', stroke: A(0).p, sw: 6 })}
            {I.draw(cx, cy - (hubR > 44 ? 12 : 0), Math.min(28, hubR * 0.6), spec.title, A(0).deep, 2)}
            {hubR > 44 ? D.ctext(cx, cy + 18, spec.title, { size: 11, weight: 700, fill: A(0).deep, maxW: hubR * 1.6, maxLines: 2 }) : null}
          </g>
        );
        function spokeSide(list, dir) {
          const pillX = dir > 0 ? pillXR : pillXL;
          const edgeX = dir > 0 ? pillX : pillX + pillW;
          list.forEach(([it, gi], k) => {
            const c = A(gi);
            const y = cy + (k - (list.length - 1) / 2) * rowH;
            const sx = cx + dir * hubR, sy = cy;
            const bendX = dir > 0 ? pillX - 40 : pillX + pillW + 40;
            els.push(
              <g key={'ln' + gi}>
                {D.path(`M${sx.toFixed(1)} ${sy.toFixed(1)} L${bendX} ${y} L${edgeX} ${y}`, { fill: 'none', stroke: c.mid, sw: 1.6 })}
                {D.circle(sx, sy, 3.4, { fill: c.p, stroke: '#fff', sw: 1.2 })}
                {D.circle(bendX, y, 3.4, { fill: c.p, stroke: '#fff', sw: 1.2 })}
              </g>
            );
            const iconX = dir > 0 ? pillX + 4 : pillX + pillW - 4;
            const textX = dir > 0 ? pillX + icoR + 26 : pillX + pillW - icoR - 26;
            const anchor = dir > 0 ? 'start' : 'end';
            const textMaxW = pillW - icoR - 50;
            els.push(
              <g key={'it' + gi}>
                {D.box(pillX, y - pillH / 2, pillW, pillH, { fill: c.soft, stroke: c.p, rx: pillH / 2 })}
                {D.circle(iconX, y, icoR + 5, { fill: '#fff', stroke: c.p, sw: 3.5 })}
                {I.draw(iconX, y, icoR + 1, (it.label || '') + ' ' + (it.detail || ''), c.deep, 2)}
                {D.ctext(textX, y - (it.detail ? 10 : 0), it.label + (it.value ? '  ·  ' + it.value : ''), { size: 12.5, weight: 700, fill: c.deep, anchor, maxW: textMaxW, maxLines: 1 })}
                {it.detail ? D.ctext(textX, y + 13, it.detail, { size: 10, fill: c.deep === '#1d1b18' ? GREY : c.deep, anchor, maxW: textMaxW, maxLines: 1 }) : null}
              </g>
            );
          });
        }
        spokeSide(right, 1);
        spokeSide(left, -1);
        return { h, el: els };
      }

      const rowH = Math.min(82, Math.max(58, 470 / n));
      const pillH = Math.min(64, rowH - 8);
      const y0 = t.y0 + 6;
      const bodyH = n * rowH;
      const hubX = 102, hubY = y0 + bodyH / 2, hubR = Math.min(60, bodyH / 2.2 + 22);
      const pillX = 252, pillW = W - pillX - 30, icoR = pillH / 2 - 2;
      const els = [t.el];
      els.push(
        <g key="hub">
          {D.circle(hubX, hubY, hubR, { fill: '#fff', stroke: A(0).p, sw: 6 })}
          {I.draw(hubX, hubY - (hubR > 44 ? 12 : 0), Math.min(30, hubR * 0.6), spec.title, A(0).deep, 2)}
          {hubR > 44 ? D.ctext(hubX, hubY + 20, spec.title, { size: 11.5, weight: 700, fill: A(0).deep, maxW: hubR * 1.5, maxLines: 2 }) : null}
        </g>
      );
      IT.forEach((it, i) => {
        const c = A(i);
        const y = y0 + i * rowH + rowH / 2;
        const f = n === 1 ? 0 : (i - (n - 1) / 2) / ((n - 1) / 2);
        const [sx, sy] = [hubX + hubR * Math.cos(Math.asin(Math.max(-0.9, Math.min(0.9, f * 0.85)))) * 1, hubY + hubR * Math.max(-0.9, Math.min(0.9, f * 0.85))];
        const bendX = pillX - 56;
        els.push(
          <g key={'ln' + i}>
            {D.path(`M${sx.toFixed(1)} ${sy.toFixed(1)} L${bendX} ${y} L${pillX - icoR + 4} ${y}`, { fill: 'none', stroke: c.mid, sw: 1.6 })}
            {D.circle(sx, sy, 3.4, { fill: c.p, stroke: '#fff', sw: 1.2 })}
            {D.circle(bendX, y, 3.4, { fill: c.p, stroke: '#fff', sw: 1.2 })}
          </g>
        );
        els.push(
          <g key={'it' + i}>
            {D.box(pillX, y - pillH / 2, pillW, pillH, { fill: c.soft, stroke: c.p, rx: pillH / 2 })}
            {D.circle(pillX + 4, y, icoR + 5, { fill: '#fff', stroke: c.p, sw: 3.5 })}
            {I.draw(pillX + 4, y, icoR + 1, (it.label || '') + ' ' + (it.detail || ''), c.deep, 2)}
            {D.ctext(pillX + icoR + 26, y - (it.detail ? 10 : 0), it.label + (it.value ? '  ·  ' + it.value : ''), { size: 13.5, weight: 700, fill: c.deep, anchor: 'start', maxW: pillW - icoR - 50, maxLines: 1 })}
            {it.detail ? D.ctext(pillX + icoR + 26, y + 13, it.detail, { size: 10.5, fill: c.deep === '#1d1b18' ? GREY : c.deep, anchor: 'start', maxW: pillW - icoR - 50, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: y0 + bodyH + 18, el: els };
    },
  };
  D9.spokes.variants = [
    { id: 'radial', name: 'Hub & spokes' },
    { id: 'split', name: 'Two sides' },
  ];

  // ---- nested: concentric circles sharing a base, leader lines to a left list ----
  D9.nested = {
    name: 'Nested rings',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const Rmax = Math.min(165, 80 + n * 14), Rmin = Math.max(30, Rmax - n * 26);
      const cx = 470;
      const botY = t.y0 + 12 + 2 * Rmax;
      const els = [t.el];
      const Rof = (i) => (n === 1 ? Rmax : Rmax - (i * (Rmax - Rmin)) / (n - 1));
      IT.forEach((it, i) => {
        const c = A(i);
        const R = Rof(i);
        els.push(<g key={'ring' + i}>{D.circle(cx, botY - R, R, { fill: c.p, fillOpacity: 0.16, stroke: c.p, sw: 1.6 })}</g>);
      });
      IT.forEach((it, i) => {
        const c = A(i);
        const R = Rof(i);
        const topY = botY - 2 * R;
        const inner = i === n - 1;
        const ly = inner ? botY - R : topY + 17;
        els.push(
          <g key={'it' + i}>
            {D.ctext(cx, ly, it.label, { size: inner ? 12 : 11.5, weight: 700, fill: c.deep, maxW: inner ? R * 1.6 : 150, maxLines: inner ? 3 : 1 })}
            {it.detail || it.value ? (
              <g>
                {D.path(`M${cx - 78} ${ly} L${cx - 150} ${ly} L${cx - 168} ${t.y0 + 26 + i * 44}`, { fill: 'none', stroke: c.mid, sw: 1.1, dash: '2 3' })}
                {D.ctext(176, t.y0 + 18 + i * 44, (it.detail || it.label) + (it.value ? '  ·  ' + it.value : ''), { size: 11, weight: 600, fill: c.deep, anchor: 'end', maxW: 165, maxLines: 2 })}
              </g>
            ) : null}
          </g>
        );
      });
      return { h: botY + 26, el: els };
    },
  };

  // ---- gearring: gear wheel with colored tooth segments, icons inside, radial labels ----
  D9.gearring = {
    name: 'Gear wheel',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const R = 122, r = 56;
      const cx = 360, cy = t.y0 + R + 64;
      const per = 360 / n;
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const a1 = -90 + i * per + 1.5, a2 = -90 + (i + 1) * per - 1.5;
        const teeth = Math.max(2, Math.round(per / 26));
        const tg = [];
        for (let k = 0; k < teeth; k++) {
          const a = a1 + ((k + 0.5) * (a2 - a1)) / teeth;
          const [x1, y1] = polar(cx, cy, R - 4, a);
          const [x2, y2] = polar(cx, cy, R + 13, a);
          tg.push(<g key={'t' + k}>{D.line(x1, y1, x2, y2, { stroke: c.p, sw: 15 })}</g>);
        }
        els.push(<g key={'seg' + i}>{tg}{D.path(ringSeg(cx, cy, R, r, a1, a2), { fill: c.p, stroke: '#fff', sw: 2 })}</g>);
      });
      els.push(<g key="core">{D.circle(cx, cy, r - 8, { fill: '#fff', stroke: '#d8d4cd', sw: 1.6 })}{I.draw(cx, cy, 30, spec.title, INK, 1.8)}</g>);
      IT.forEach((it, i) => {
        const c = A(i);
        const mid = -90 + (i + 0.5) * per;
        const [ix, iy] = polar(cx, cy, (R + r) / 2 + 4, mid);
        els.push(<g key={'ico' + i}>{I.draw(ix, iy, 22, (it.label || '') + ' ' + (it.detail || ''), '#fff', 2)}</g>);
        const [lx, ly] = polar(cx, cy, R + 48, mid);
        const side = Math.cos((mid * Math.PI) / 180);
        const anchor = Math.abs(side) < 0.3 ? 'middle' : side > 0 ? 'start' : 'end';
        els.push(
          <g key={'it' + i}>
            {D.ctext(lx, ly - (it.value ? 8 : 0), it.label, { size: 12, weight: 700, fill: c.deep, anchor, maxW: 130, maxLines: 2 })}
            {it.value ? D.ctext(lx, ly + 13, it.value, { size: 10.5, weight: 700, fill: c.p, anchor, maxW: 110, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: cy + R + 72, el: els };
    },
  };

  // ---- puzzlering: circular puzzle with tab knobs + center hub, legend right ----
  D9.puzzlering = {
    name: 'Puzzle ring',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const R = 124, r = 54;
      const cx = 196, cy = t.y0 + R + 16;
      const per = 360 / n;
      const m = (R + r) / 2;
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const a1 = -90 + i * per, a2 = -90 + (i + 1) * per;
        els.push(<g key={'seg' + i}>{D.path(ringSeg(cx, cy, R, r, a1 + 0.6, a2 - 0.6), { fill: c.p, fillOpacity: 0.88, stroke: '#fff', sw: 2.5 })}</g>);
      });
      IT.forEach((it, i) => {
        const c = A(i);
        const [tx, ty] = polar(cx, cy, m, -90 + (i + 1) * per);
        els.push(<g key={'tab' + i}>{D.circle(tx, ty, 10.5, { fill: c.p, stroke: '#fff', sw: 2.5 })}</g>);
        const mid = -90 + (i + 0.5) * per;
        const [ix, iy] = polar(cx, cy, m, mid);
        const short = (it.label || '').split(/\s+/).slice(0, 2).join(' ');
        els.push(<g key={'sl' + i}>{per > 40 ? D.ctext(ix, iy, short, { size: 10, weight: 700, fill: '#fff', maxW: 64, maxLines: 2 }) : null}</g>);
      });
      els.push(<g key="core">{D.circle(cx, cy, r - 6, { fill: '#fff', stroke: '#d8d4cd', sw: 1.6 })}{I.draw(cx, cy, 30, spec.title, INK, 1.8)}</g>);
      IT.forEach((it, i) => {
        const c = A(i);
        const y = t.y0 + 22 + i * Math.min(44, Math.max(34, (2 * R) / n + 6));
        els.push(
          <g key={'it' + i}>
            {I.draw(376, y, 20, (it.label || '') + ' ' + (it.detail || ''), c.p, 2)}
            {D.ctext(396, y - (it.detail ? 8 : 0), it.label + (it.value ? '  ·  ' + it.value : ''), { size: 12.5, weight: 700, fill: c.deep, anchor: 'start', maxW: 295, maxLines: 1 })}
            {it.detail ? D.ctext(396, y + 12, it.detail, { size: 10, fill: GREY, anchor: 'start', maxW: 295, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: Math.max(cy + R + 22, t.y0 + 22 + n * Math.min(44, Math.max(34, (2 * R) / n + 6)) + 8), el: els };
    },
  };

  // ---- bulb: lightbulb sliced into colored bands, icon+label blocks both sides ----
  D9.bulb = {
    name: 'Lightbulb',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const cx = 360, R = 102;
      const bCy = t.y0 + 26 + R;
      const bandTop = bCy - R, bandBot = bCy + 116;
      const clipId = 'bulbclip' + (hashStr(spec.title || 'b') % 99991);
      const els = [t.el];
      els.push(
        <clipPath id={clipId} key="clip">
          <circle cx={cx} cy={bCy} r={R - 1} />
          <rect x={cx - 31} y={bCy + 58} width={62} height={58} rx={6} />
        </clipPath>
      );
      const span = (bandBot - bandTop) / n;
      IT.forEach((it, i) => {
        const c = A(i);
        els.push(
          <g key={'band' + i} clipPath={`url(#${clipId})`}>
            <rect x={cx - R - 4} y={bandTop + i * span} width={2 * R + 8} height={span + 1} fill={c.p} fillOpacity={pal.multi ? 0.9 : 0.4 + (0.5 * i) / Math.max(1, n - 1)} />
            {i > 0 ? <line x1={cx - R - 4} x2={cx + R + 4} y1={bandTop + i * span} y2={bandTop + i * span} stroke="#fff" strokeWidth={2.5} /> : null}
          </g>
        );
      });
      els.push(
        <g key="outline">
          {D.circle(cx, bCy, R, { fill: 'none', stroke: '#3a362f', sw: 2 })}
          {D.path(`M${cx - 31} ${bCy + 95} L${cx - 31} ${bCy + 116} L${cx + 31} ${bCy + 116} L${cx + 31} ${bCy + 95}`, { fill: 'none', stroke: '#3a362f', sw: 2 })}
          {D.line(cx - 26, bCy + 130, cx + 26, bCy + 130, { stroke: '#9b968d', sw: 7 })}
          {D.line(cx - 21, bCy + 143, cx + 21, bCy + 143, { stroke: '#9b968d', sw: 7 })}
          {D.line(cx - 14, bCy + 155, cx + 14, bCy + 155, { stroke: '#9b968d', sw: 7 })}
        </g>
      );
      const rows = Math.ceil(n / 2);
      const step = Math.max(86, (bandBot - t.y0) / rows + 8);
      IT.forEach((it, i) => {
        const c = A(i);
        const left = i % 2 === 0;
        const k = Math.floor(i / 2);
        const y = t.y0 + 34 + k * step;
        const tx = left ? 232 : 488;
        const ix = left ? 208 : 464;
        const anchor = left ? 'end' : 'start';
        const txx = left ? ix - 34 : ix + 34;
        els.push(
          <g key={'it' + i}>
            {I.draw(ix, y, 26, (it.label || '') + ' ' + (it.detail || ''), c.p, 1.9)}
            {D.ctext(txx, y - 4, it.label + (it.value ? ' · ' + it.value : ''), { size: 13.5, weight: 700, fill: c.p, anchor, maxW: 168, maxLines: 2 })}
            {it.detail ? D.ctext(txx, y + 18, it.detail, { size: 10.5, fill: GREY, anchor, maxW: 168, maxLines: 2 }) : null}
          </g>
        );
      });
      return { h: Math.max(bCy + 172, t.y0 + 34 + rows * step), el: els };
    },
  };

  // ---- horn: horizontal funnel narrowing left→right with stage labels ----
  D9.horn = {
    name: 'Horn',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const cy = t.y0 + 138;
      const x0 = 138, x1 = 568;
      const h0 = 212, h1 = 56;
      const hAt = (f) => h0 + (h1 - h0) * Math.pow(f, 0.85);
      const rxAt = (h) => 8 + 13 * (h / h0);
      const els = [t.el];
      els.push(<g key="mouth">{D.path(`M${x0} ${cy - h0 / 2} A${rxAt(h0)} ${h0 / 2} 0 0 0 ${x0} ${cy + h0 / 2} A${rxAt(h0)} ${h0 / 2} 0 0 0 ${x0} ${cy - h0 / 2} Z`, { fill: A(0).soft, stroke: A(0).p, sw: 1.6 })}</g>);
      IT.forEach((it, i) => {
        const c = A(i);
        const fa = i / n, fb = (i + 1) / n;
        const xa = x0 + fa * (x1 - x0), xb = x0 + fb * (x1 - x0);
        const ha = hAt(fa), hb = hAt(fb);
        const d = `M${xa} ${cy - ha / 2} L${xb} ${cy - hb / 2} A${rxAt(hb)} ${hb / 2} 0 0 1 ${xb} ${cy + hb / 2} L${xa} ${cy + ha / 2} A${rxAt(ha)} ${ha / 2} 0 0 0 ${xa} ${cy - ha / 2} Z`;
        els.push(<g key={'seg' + i}>{D.path(d, { fill: c.p, fillOpacity: 0.85, stroke: '#fff', sw: 2 })}</g>);
        const xm = (xa + xb) / 2, hm = hAt((fa + fb) / 2);
        if (xb - xa > 52 && hm > 64) els.push(<g key={'ico' + i}>{I.draw(xm + rxAt(hm) / 2, cy, Math.min(26, hm * 0.32), (it.label || '') + ' ' + (it.detail || ''), '#fff', 2)}</g>);
        const up = i % 2 === 0;
        const ly = up ? cy - h0 / 2 - 40 : cy + h0 / 2 + 44;
        const edgeY = up ? cy - hm / 2 - 6 : cy + hm / 2 + 6;
        els.push(
          <g key={'it' + i}>
            {D.arrow(xm, up ? ly + 14 : ly - 16, xm, edgeY, { stroke: c.deep, sw: 1.4 })}
            {D.ctext(xm, up ? ly - 6 : ly + 4, it.label, { size: 12, weight: 700, fill: c.deep, maxW: Math.max(96, xb - xa + 26), maxLines: 2 })}
            {it.value ? D.ctext(xm, up ? ly - 6 + 17 : ly + 21, it.value, { size: 10.5, weight: 700, fill: c.p, maxW: 100, maxLines: 1 }) : null}
          </g>
        );
      });
      els.push(<g key="endlab">{D.ctext(x1 + 26, cy, spec.items[n - 1] && spec.items[n - 1].detail ? spec.items[n - 1].detail : 'Result', { size: 11.5, weight: 700, fill: GREY, anchor: 'start', maxW: 120, maxLines: 3 })}</g>);
      return { h: cy + h0 / 2 + 92, el: els };
    },
  };

  // ---- lens: items converge through a lens to one outcome (uses connector settings) ----
  D9.lens = {
    name: 'Lens',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const rowH = Math.min(66, Math.max(46, 420 / n));
      const y0 = t.y0 + 10;
      const bodyH = n * rowH;
      const cyMid = y0 + bodyH / 2;
      const lensX = 408, lensRy = bodyH / 2 + 24;
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const y = y0 + i * rowH + rowH / 2;
        els.push(<g key={'lead' + i}>{D.line(258, y, lensX - 24, y, { stroke: c.p, sw: 1.7 })}</g>);
      });
      els.push(
        <g key="lens">
          <ellipse cx={lensX + 10} cy={cyMid} rx={19} ry={lensRy} fill="none" stroke="#b9b4ab" strokeWidth={1.4} />
          <ellipse cx={lensX} cy={cyMid} rx={19} ry={lensRy} fill="#d8d4cd" fillOpacity={0.35} stroke="#9b968d" strokeWidth={1.6} />
        </g>
      );
      IT.forEach((it, i) => {
        const c = A(i);
        const y = y0 + i * rowH + rowH / 2;
        const ty = cyMid + (i - (n - 1) / 2) * 13;
        els.push(<g key={'conv' + i}>{D.arrow(lensX + 22, y + (cyMid - y) * 0.12, 584, ty, { stroke: c.p, sw: 1.7 })}</g>);
        els.push(
          <g key={'it' + i}>
            {I.draw(232, y, 25, (it.label || '') + ' ' + (it.detail || ''), c.p, 1.9)}
            {D.ctext(206, y - (it.detail && rowH > 52 ? 8 : 0), it.label + (it.value ? ' · ' + it.value : ''), { size: 13, weight: 600, fill: c.deep, anchor: 'end', maxW: 168, maxLines: 1 })}
            {it.detail && rowH > 52 ? D.ctext(206, y + 13, it.detail, { size: 10, fill: GREY, anchor: 'end', maxW: 168, maxLines: 1 }) : null}
          </g>
        );
      });
      els.push(
        <g key="targ">
          {D.poly([[612, cyMid - 13], [638, cyMid - 2], [616, cyMid + 11], [614, cyMid + 2]], { fill: '#fff', stroke: INK, sw: 1.8 })}
          {D.ctext(648, cyMid, spec.title, { size: 12.5, weight: 700, fill: INK, anchor: 'start', maxW: 66, maxLines: 4 })}
        </g>
      );
      return { h: Math.max(y0 + bodyH + 20, cyMid + lensRy + 16), el: els };
    },
  };
})();
