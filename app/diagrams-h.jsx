// Glyph — diagram renderers, part H: ringcards, cascade, milestones, gridcycle, table, versus
(function () {
  const { GREY, polar, arcPath, palAt, numOf } = window.GlyphDraw;
  window.DIAGRAMS = window.DIAGRAMS || {};
  const D9 = window.DIAGRAMS;
  const W = 720;

  // ---- ringcards: colored cards, each with a progress ring + label + detail ----
  function pctOf(it, items) {
    const m = String(it.value || '').match(/(\d+\.?\d*)\s*%/);
    if (m) return Math.min(100, parseFloat(m[1]));
    const v = numOf(it);
    if (v == null) return 100;
    const vs = items.map(numOf).filter((x) => x != null);
    const max = Math.max(...vs, 1);
    return Math.max(8, Math.min(100, (v / max) * 100));
  }

  D9.ringcards = {
    name: 'Ring cards',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const variant = spec.variant || 'top';
      const gap = 14;
      const cols = Math.min(n, 4);
      const rows = Math.ceil(n / cols);
      const cw = (W - 48 - (cols - 1) * gap) / cols;
      const hasDetail = IT.some((it) => it.detail);
      const ch = hasDetail ? 226 : 192;
      const rr = 36;
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const x = 24 + (i % cols) * (cw + gap);
        const y = t.y0 + Math.floor(i / cols) * (ch + gap);
        const pct = pctOf(it, IT);
        const ringCy = variant === 'bottom' ? y + ch - rr - 24 : y + rr + 26;
        const textY0 = variant === 'bottom' ? y + 30 : y + 2 * rr + 48;
        const cx = x + cw / 2;
        els.push(
          <g key={'it' + i}>
            {D.box(x, y, cw, ch, { fill: c.soft, stroke: c.p, rx: 16 })}
            {D.circle(cx, ringCy, rr, { fill: 'none', stroke: c.mid, sw: 7 })}
            {pct >= 99.5
              ? D.circle(cx, ringCy, rr, { fill: 'none', stroke: c.p, sw: 7 })
              : D.path(arcPath(cx, ringCy, rr, -90, -90 + (360 * pct) / 100), { fill: 'none', stroke: c.p, sw: 7 })}
            {D.ctext(cx, ringCy, it.value || Math.round(pct) + '%', { size: 14, weight: 700, fill: c.deep, maxW: rr * 1.6, maxLines: 1 })}
            {D.ctext(cx, textY0 + 16, it.label, { size: 12.5, weight: 700, fill: c.deep, maxW: cw - 22, maxLines: 3 })}
            {it.detail ? D.ctext(cx, textY0 + 62, it.detail, { size: 10, fill: GREY, maxW: cw - 22, maxLines: 3 }) : null}
          </g>
        );
      });
      return { h: t.y0 + rows * (ch + gap) - gap + 24, el: els };
    },
  };
  D9.ringcards.variants = [
    { id: 'top', name: 'Ring on top' },
    { id: 'bottom', name: 'Ring below' },
  ];

  // ---- cascade: left-pointing banners with a descending stair of value tags ----
  D9.cascade = {
    name: 'Cascade',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const hasTags = IT.some((it) => it.value);
      const rowH = 72, bh = 56;
      const lx = 196, rxE = hasTags ? 470 : W - 36;
      const tagW = 168, tagH = 40, tagX = W - 36 - tagW;
      const bodyH = n * rowH;
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const y = t.y0 + i * rowH;
        const my = y + bh / 2;
        if (hasTags && it.value) {
          const ty = t.y0 + bodyH - (n - i) * (tagH + 6);
          els.push(
            <g key={'slab' + i}>
              {D.poly([[rxE, y + 4], [tagX, ty + 2], [tagX, ty + tagH - 2], [rxE, y + bh - 4]], { fill: c.p, stroke: 'none', fillOpacity: 0.1 })}
            </g>
          );
          els.push(
            <g key={'tag' + i}>
              {D.box(tagX, ty, tagW, tagH, { fill: c.soft, stroke: c.p, rx: 6 })}
              {D.ctext(tagX + tagW / 2, ty + tagH / 2, it.value, { size: 11.5, weight: 700, fill: c.deep, maxW: tagW - 18, maxLines: 1 })}
            </g>
          );
        }
        els.push(
          <g key={'it' + i}>
            {D.poly([[lx + 24, y], [rxE, y], [rxE, y + bh], [lx + 24, y + bh], [lx, my]], { fill: c.p, stroke: c.p, fillOpacity: 0.16 })}
            {D.ctext(lx + 24 + (rxE - lx - 24) / 2, my, it.label, { size: 13.5, weight: 700, fill: c.deep, maxW: rxE - lx - 56, maxLines: 2 })}
            {it.detail ? D.ctext(lx - 16, my, it.detail, { size: 10.5, fill: GREY, anchor: 'end', maxW: 164, maxLines: 3 }) : null}
          </g>
        );
      });
      return { h: t.y0 + bodyH + 16, el: els };
    },
  };

  // ---- milestones: vertical numbered chain, labels alternating sides ----
  D9.milestones = {
    name: 'Milestones',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const cx = 340;
      const gap = Math.max(96, Math.min(120, 460 / n + 50));
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const cy = t.y0 + 34 + i * gap;
        if (i < n - 1) els.push(<g key={'ln' + i}>{D.line(cx, cy + 28, cx, cy + gap - 28, { stroke: c.mid, sw: 9 })}</g>);
        const right = i % 2 === 0;
        const tx = right ? cx + 78 : cx - 78;
        const anchor = right ? 'start' : 'end';
        els.push(
          <g key={'it' + i}>
            {D.circle(cx, cy, 27, { fill: '#fff', stroke: c.p, sw: 2.2 })}
            {D.circle(cx, cy, 17, { fill: c.soft, stroke: c.p, sw: 1.6 })}
            {D.ctext(cx, cy, String(i + 1), { size: 14, weight: 700, fill: c.deep })}
            {D.line(right ? cx + 30 : cx - 30, cy, right ? cx + 64 : cx - 64, cy, { stroke: c.p, sw: 1.6 })}
            {D.circle(right ? cx + 66 : cx - 66, cy, 3, { fill: c.p, stroke: c.p })}
            {D.ctext(tx, cy - (it.detail ? 11 : 0), it.label, { size: 13.5, weight: 700, fill: c.deep, anchor, maxW: 250, maxLines: 2 })}
            {it.detail ? D.ctext(tx, cy + 15, it.detail, { size: 10.5, fill: GREY, anchor, maxW: 250, maxLines: 2 }) : null}
            {it.value ? (
              <g>
                {D.line(right ? cx - 30 : cx + 30, cy, right ? cx - 58 : cx + 58, cy, { stroke: c.mid, sw: 1.6 })}
                {D.circle(right ? cx - 60 : cx + 60, cy, 3, { fill: c.mid, stroke: c.mid })}
                {D.ctext(right ? cx - 72 : cx + 72, cy, it.value, { size: 11, weight: 600, fill: GREY, anchor: right ? 'end' : 'start', maxW: 150, maxLines: 1 })}
              </g>
            ) : null}
          </g>
        );
      });
      return { h: t.y0 + 34 + (n - 1) * gap + 56, el: els };
    },
  };

  // ---- gridcycle: snaking grid of tinted cells with arrows, looping back ----
  D9.gridcycle = {
    name: 'Grid cycle',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const cols = n <= 4 ? 2 : 3;
      const rows = Math.ceil(n / cols);
      const gw = (W - 48) / cols, gh = 138;
      const pos = (i) => {
        const r = Math.floor(i / cols);
        const k = r % 2 === 0 ? i % cols : cols - 1 - (i % cols);
        return [24 + k * gw, t.y0 + r * gh, r, k];
      };
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const [x, y] = pos(i);
        els.push(
          <g key={'it' + i}>
            {D.box(x, y, gw, gh, { fill: c.p, stroke: c.p, rx: 2, fillOpacity: 0.1 })}
            {D.text(x + 22, y + 36, String(i + 1), { size: 15, weight: 700, fill: c.p, maxW: 60, maxLines: 1 })}
            {D.text(x + 22, y + 62, it.label, { size: 13, weight: 700, fill: c.deep, maxW: gw - 44, maxLines: 2 })}
            {it.detail ? D.text(x + 22, y + 96, it.detail, { size: 10.5, fill: GREY, maxW: gw - 44, maxLines: 2 }) : null}
          </g>
        );
      });
      // arrows between consecutive cells + loop back to start
      const arr = (x, y, dir, c) => {
        const s = 11;
        const pts = dir === 'r' ? [[x - s, y - s], [x + s * 0.9, y], [x - s, y + s]]
          : dir === 'l' ? [[x + s, y - s], [x - s * 0.9, y], [x + s, y + s]]
          : dir === 'd' ? [[x - s, y - s], [x + s, y - s], [x, y + s * 0.9]]
          : [[x - s, y + s], [x + s, y + s], [x, y - s * 0.9]];
        return D.poly(pts, { fill: '#fff', stroke: c.p, sw: 2 });
      };
      for (let i = 0; i < n - 1; i++) {
        const [x1, y1, r1, k1] = pos(i);
        const [, , r2] = pos(i + 1);
        const c = A(i + 1);
        if (r1 === r2) {
          const goingR = r1 % 2 === 0;
          els.push(<g key={'a' + i}>{arr(goingR ? x1 + gw : x1, y1 + gh / 2, goingR ? 'r' : 'l', c)}</g>);
        } else {
          els.push(<g key={'a' + i}>{arr(x1 + gw / 2, y1 + gh, 'd', c)}</g>);
        }
      }
      if (n > cols) {
        const [x0, y0, r0, k0] = pos(0);
        const [, , rl, kl] = pos(n - 1);
        if (kl === k0 && rl === r0 + 1) {
          els.push(<g key="loop">{arr(x0 + gw / 2, y0 + gh, 'u', A(0))}</g>);
        }
      }
      return { h: t.y0 + rows * gh + 22, el: els };
    },
  };

  // ---- table: attribute columns with header + description rows ----
  D9.table = {
    name: 'Table',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items;
      const gap = 12;
      const els = [t.el];
      const hasVal = IT.some((it) => it.value);
      let y = t.y0;
      for (let s = 0; s < IT.length; s += 4) {
        const band = IT.slice(s, s + 4);
        const bn = band.length;
        const cw = (W - 48 - (bn - 1) * gap) / bn;
        const hh = 50, dh = 104, vh = 40;
        band.forEach((it, k) => {
          const i = s + k;
          const c = A(i);
          const x = 24 + k * (cw + gap);
          els.push(
            <g key={'it' + i}>
              {D.box(x, y, cw, hh, { fill: c.soft, stroke: c.p, rx: 10 })}
              {D.ctext(x + cw / 2, y + hh / 2, it.label, { size: 13.5, weight: 700, fill: c.deep, maxW: cw - 20, maxLines: 1 })}
              {D.box(x, y + hh + 8, cw, dh, { fill: c.p, stroke: c.p, rx: 10, fillOpacity: 0.07 })}
              {D.ctext(x + cw / 2, y + hh + 8 + dh / 2, it.detail || '—', { size: 11, fill: c.deep, maxW: cw - 22, maxLines: 4 })}
              {hasVal ? D.box(x, y + hh + dh + 24, cw, vh, { fill: '#fff', stroke: c.mid, rx: 10 }) : null}
              {hasVal ? D.ctext(x + cw / 2, y + hh + dh + 24 + vh / 2, it.value || '—', { size: 12, weight: 700, fill: c.p, maxW: cw - 20, maxLines: 1 }) : null}
            </g>
          );
        });
        y += hh + 8 + dh + (hasVal ? 24 + vh : 0) + 22;
      }
      return { h: y + 2, el: els };
    },
  };

  // ---- versus: two large tinted panels facing off across a VS medallion ----
  D9.versus = {
    name: 'Versus',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items;
      const a = IT[0] || { label: 'Option A' }, b = IT[1] || { label: 'Option B' };
      const rest = IT.slice(2);
      const L = [], R = [];
      rest.forEach((it, i) => (i % 2 === 0 ? L : R).push(it));
      const rows = Math.max(L.length, R.length);
      const ph = 180 + rows * 30;
      const pw = 326, lx = 24, rx = W - 24 - pw;
      const cy = t.y0 + ph / 2;
      const els = [t.el];
      [[lx, a, L, 0], [rx, b, R, 1]].forEach(([x, head, list, side]) => {
        const c = A(side);
        els.push(
          <g key={'p' + side}>
            {D.box(x, t.y0, pw, ph, { fill: c.p, stroke: c.p, rx: 4, fillOpacity: 0.12 })}
            {D.ctext(x + pw / 2, t.y0 + 52, head.label, { size: 17, weight: 700, fill: c.p, maxW: pw - 60, maxLines: 2 })}
            {head.detail ? D.ctext(x + pw / 2, t.y0 + 88, head.detail, { size: 11.5, fill: c.deep, maxW: pw - 70, maxLines: 2 }) : null}
          </g>
        );
        list.forEach((it, k) => {
          const gi = 2 + (side === 0 ? k * 2 : k * 2 + 1);
          const y = t.y0 + 128 + k * 30;
          els.push(
            <g key={'it' + gi}>
              {D.circle(x + 30, y, 3.5, { fill: c.p, stroke: c.p })}
              {D.ctext(x + 44, y, it.label + (it.detail ? ' — ' + it.detail : ''), { size: 11, fill: c.deep, anchor: 'start', maxW: pw - 64, maxLines: 1 })}
            </g>
          );
        });
      });
      els.push(
        <g key="vs">
          {D.circle(W / 2, cy, 36, { fill: '#fff', stroke: GREY, sw: 2 })}
          {D.circle(W / 2, cy, 29, { fill: '#f2f0ec', stroke: GREY, sw: 1.2 })}
          {D.ctext(W / 2, cy, 'VS', { size: 17, weight: 700, fill: GREY })}
        </g>
      );
      return { h: t.y0 + ph + 24, el: els };
    },
  };
})();
