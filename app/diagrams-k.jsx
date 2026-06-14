// Glyph — diagram renderers, part K: snake, metro, filmstrip, sticky, bento, shelf
(function () {
  const { GREY, INK, palAt } = window.GlyphDraw;
  const I = window.GlyphIcons;
  window.DIAGRAMS = window.DIAGRAMS || {};
  const D9 = window.DIAGRAMS;
  const W = 720;

  // ---- snake: serpentine path with numbered stops ----
  D9.snake = {
    name: 'Serpentine',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const xs = [130, 360, 590];
      const pos = (i) => {
        const row = Math.floor(i / 3);
        const col = row % 2 === 0 ? i % 3 : 2 - (i % 3);
        return [xs[col], t.y0 + 56 + row * 150, row];
      };
      let d = '';
      for (let i = 0; i < n; i++) {
        const [x, y] = pos(i);
        if (i === 0) { d = `M${x} ${y}`; continue; }
        const [px, py] = pos(i - 1);
        if (py === y) d += `L${x} ${y}`;
        else {
          const dir = px > 360 ? 1 : -1;
          d += `C${px + dir * 115} ${py} ${x + dir * 115} ${y} ${x} ${y}`;
        }
      }
      const els = [t.el, <g key="path">{D.path(d, { fill: 'none', stroke: GREY, sw: 3.5 })}</g>];
      IT.forEach((it, i) => {
        const c = A(i);
        const [x, y] = pos(i);
        els.push(
          <g key={'it' + i}>
            {D.circle(x, y, 26, { fill: c.soft, stroke: c.p, sw: 2.2 })}
            {D.ctext(x, y, String(i + 1), { size: 15, weight: 700, fill: c.deep })}
            {D.ctext(x, y + 46, it.label, { size: 12, weight: 700, fill: c.deep, maxW: 190, maxLines: 1 })}
            {it.detail ? D.ctext(x, y + 68, it.detail, { size: 9.5, fill: GREY, maxW: 190, maxLines: 2 }) : null}
          </g>
        );
      });
      const rows = Math.ceil(n / 3);
      return { h: t.y0 + 56 + (rows - 1) * 150 + 96, el: els };
    },
  };

  // ---- metro: transit line with stations and alternating callouts ----
  D9.metro = {
    name: 'Metro line',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const cy = t.y0 + 122;
      const x0 = 78, x1 = 642;
      const step = n > 1 ? (x1 - x0) / (n - 1) : 0;
      const els = [t.el];
      for (let i = 0; i < n - 1; i++) {
        els.push(<g key={'seg' + i}>{D.line(x0 + i * step, cy, x0 + (i + 1) * step, cy, { stroke: A(i + 1).p, sw: 8 })}</g>);
      }
      IT.forEach((it, i) => {
        const c = A(i);
        const x = n === 1 ? W / 2 : x0 + i * step;
        const up = i % 2 === 0;
        const s = up ? -1 : 1;
        const term = i === 0 || i === n - 1;
        const maxW = Math.min(step + 30, 200);
        els.push(
          <g key={'it' + i}>
            {D.circle(x, cy, term ? 15 : 11, { fill: '#fff', stroke: c.p, sw: 4 })}
            {D.line(x, cy + s * 18, x, cy + s * 36, { stroke: GREY, sw: 1.2 })}
            {D.ctext(x, cy + s * (up ? 84 : 50), it.label, { size: 12, weight: 700, fill: c.deep, maxW, maxLines: 1 })}
            {it.detail ? D.ctext(x, cy + s * (up ? 62 : 72), it.detail, { size: 9.5, fill: GREY, maxW, maxLines: 2 }) : null}
            {it.value ? D.ctext(x, cy + s * (up ? 104 : 96), it.value, { size: 10, weight: 700, fill: c.p, maxW, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: cy + 124, el: els };
    },
  };

  // ---- filmstrip: dark strip with sprocket holes and frames ----
  D9.filmstrip = {
    name: 'Filmstrip',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items;
      const stripH = 150, gap = 18;
      const els = [t.el];
      let y = t.y0;
      for (let s = 0; s < IT.length; s += 4) {
        const band = IT.slice(s, s + 4);
        const k = band.length;
        els.push(<g key={'strip' + s}>{D.box(24, y, 672, stripH, { fill: INK, stroke: INK, rx: 8 })}</g>);
        for (let hx = 44; hx < 680; hx += 52) {
          els.push(<g key={'h' + s + '_' + hx}>{D.box(hx, y + 8, 18, 10, { fill: '#fff', stroke: '#fff', rx: 3 })}{D.box(hx, y + stripH - 18, 18, 10, { fill: '#fff', stroke: '#fff', rx: 3 })}</g>);
        }
        const fw = (672 - 56 - (k - 1) * 16) / k;
        band.forEach((it, j) => {
          const i = s + j;
          const c = A(i);
          const x = 24 + 28 + j * (fw + 16);
          els.push(
            <g key={'it' + i}>
              {D.box(x, y + 26, fw, stripH - 52, { fill: '#fff', stroke: '#fff', rx: 4 })}
              {D.text(x + 12, y + 46, String(i + 1).padStart(2, '0'), { size: 11, weight: 700, fill: c.p, maxW: 40, maxLines: 1 })}
              {it.value ? D.ctext(x + fw - 12, y + 44, it.value, { size: 10, weight: 700, fill: c.deep, anchor: 'end', maxW: fw - 60, maxLines: 1 }) : null}
              {D.text(x + 12, y + 68, it.label, { size: 12, weight: 700, fill: c.deep, maxW: fw - 24, maxLines: 2 })}
              {it.detail ? D.text(x + 12, y + 104, it.detail, { size: 9, fill: GREY, maxW: fw - 24, maxLines: 1 }) : null}
            </g>
          );
        });
        y += stripH + gap;
      }
      return { h: y - gap + 12, el: els };
    },
  };

  // ---- sticky: wall of tilted sticky notes with tape ----
  D9.sticky = {
    name: 'Sticky notes',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const sw = 200, sh = 158, gx = 28, gy = 28;
      const rots = [-2.4, 1.8, -1.2, 2.6, -2, 1.4];
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const col = i % 3, row = Math.floor(i / 3);
        const x = 32 + col * (sw + gx);
        const y = t.y0 + 8 + row * (sh + gy);
        const cx = x + sw / 2, cyc = y + sh / 2;
        els.push(
          <g key={'it' + i} transform={`rotate(${rots[i % 6]} ${cx} ${cyc})`}>
            {D.box(x, y, sw, sh, { fill: c.soft, stroke: c.p, sw: 1, rx: 3 })}
            {D.poly([[x + sw - 26, y + sh], [x + sw, y + sh - 26], [x + sw, y + sh], ], { fill: c.mid, stroke: c.p, sw: 0.8 })}
            {D.box(cx - 26, y - 7, 52, 15, { fill: GREY, stroke: 'none', rx: 2, fillOpacity: 0.25 })}
            {I ? I.draw(x + 22, y + 24, 20, I.nameFor(it), c.p, 2) : null}
            {D.ctext(cx, y + 46, it.label, { size: 13, weight: 700, fill: c.deep, maxW: sw - 32, maxLines: 2 })}
            {it.detail ? D.ctext(cx, y + 94, it.detail, { size: 10, fill: GREY, maxW: sw - 34, maxLines: 3 }) : null}
            {it.value ? D.ctext(cx, y + sh - 22, it.value, { size: 11, weight: 700, fill: c.deep, maxW: sw - 40, maxLines: 1 }) : null}
          </g>
        );
      });
      const rows = Math.ceil(n / 3);
      return { h: t.y0 + 8 + rows * (sh + gy) - gy + 20, el: els };
    },
  };

  // ---- bento: featured tile plus supporting grid ----
  D9.bento = {
    name: 'Bento grid',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const els = [t.el];
      if (n <= 2) {
        const w = n === 1 ? 672 : 330;
        IT.forEach((it, i) => {
          const c = A(i);
          const x = 24 + i * 342;
          els.push(
            <g key={'it' + i}>
              {D.box(x, t.y0, w, 200, { fill: c.p, stroke: c.p, rx: 16, fillOpacity: 0.08 })}
              {I ? I.draw(x + w - 30, t.y0 + 32, 24, I.nameFor(it), c.p, 2) : null}
              {D.text(x + 24, t.y0 + 42, it.label, { size: 16, weight: 700, fill: c.deep, maxW: w - 48, maxLines: 2 })}
              {it.detail ? D.text(x + 24, t.y0 + 86, it.detail, { size: 11, fill: GREY, maxW: w - 48, maxLines: 3 }) : null}
              {it.value ? D.text(x + 24, t.y0 + 170, it.value, { size: 18, weight: 700, fill: c.p, maxW: w - 48, maxLines: 1 }) : null}
            </g>
          );
        });
        return { h: t.y0 + 220, el: els };
      }
      const rest = IT.slice(1);
      const rows = Math.ceil(rest.length / 2);
      const bh = Math.max(232, rows * 122 - 12);
      const big = IT[0], bc = A(0);
      els.push(
        <g key="big">
          {D.box(24, t.y0, 332, bh, { fill: bc.p, stroke: bc.p, rx: 16, fillOpacity: 0.1 })}
          {I ? I.draw(326, t.y0 + 36, 28, I.nameFor(big), bc.p, 2) : null}
          {big.value ? D.text(48, t.y0 + 56, big.value, { size: 26, weight: 800, fill: bc.p, maxW: 280, maxLines: 1 }) : null}
          {D.text(48, t.y0 + (big.value ? 96 : 52), big.label, { size: 17, weight: 700, fill: bc.deep, maxW: 284, maxLines: 2 })}
          {big.detail ? D.text(48, t.y0 + (big.value ? 138 : 94), big.detail, { size: 11, fill: GREY, maxW: 284, maxLines: 4 }) : null}
        </g>
      );
      rest.forEach((it, j) => {
        const c = A(j + 1);
        const x = 368 + (j % 2) * 170;
        const y = t.y0 + Math.floor(j / 2) * 122;
        els.push(
          <g key={'it' + j}>
            {D.box(x, y, 158, 110, { fill: c.p, stroke: c.p, rx: 14, fillOpacity: 0.08 })}
            {I && !it.value ? I.draw(x + 158 - 24, y + 24, 18, I.nameFor(it), c.p, 2) : null}
            {D.text(x + 16, y + 30, it.label, { size: 12, weight: 700, fill: c.deep, maxW: it.value ? 84 : 110, maxLines: 1 })}
            {it.value ? D.ctext(x + 158 - 14, y + 26, it.value, { size: 11, weight: 700, fill: c.p, anchor: 'end', maxW: 54, maxLines: 1 }) : null}
            {it.detail ? D.text(x + 16, y + 54, it.detail, { size: 9.5, fill: GREY, maxW: 128, maxLines: 3 }) : null}
          </g>
        );
      });
      return { h: t.y0 + bh + 18, el: els };
    },
  };

  // ---- shelf: book spines on a shelf ----
  D9.shelf = {
    name: 'Bookshelf',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const bw = 64;
      const step = Math.min(86, (640 - bw) / Math.max(1, n - 1));
      const yb = t.y0 + 238;
      const hts = [214, 190, 202, 178, 208, 186];
      const els = [t.el];
      const hasBelow = IT.some((it) => it.detail || it.value);
      IT.forEach((it, i) => {
        const c = A(i);
        const bh = hts[i % 6];
        const x = 40 + i * step;
        const cx = x + bw / 2;
        const cyS = yb - bh / 2;
        const tilt = i === n - 1 && n > 2 ? 7 : 0;
        els.push(
          <g key={'it' + i} transform={tilt ? `rotate(${tilt} ${x + bw} ${yb})` : undefined}>
            {D.box(x, yb - bh, bw, bh, { fill: c.p, stroke: c.p, rx: 4, fillOpacity: 0.15 })}
            {D.box(x, yb - bh + 12, bw, 6, { fill: c.p, stroke: c.p })}
            {D.box(x, yb - bh + 24, bw, 6, { fill: c.p, stroke: c.p })}
            <g transform={`rotate(-90 ${cx} ${cyS})`}>
              {D.ctext(cx, cyS + 4, it.label, { size: 12, weight: 700, fill: c.deep, maxW: bh - 56, maxLines: 1 })}
            </g>
          </g>
        );
        if (it.value) els.push(<g key={'v' + i}>{D.ctext(cx, yb + 26, it.value, { size: 10.5, weight: 700, fill: c.deep, maxW: step - 8, maxLines: 1 })}</g>);
        if (it.detail) els.push(<g key={'d' + i}>{D.ctext(cx, yb + (it.value ? 48 : 30), it.detail, { size: 9, fill: GREY, maxW: step - 6, maxLines: 3 })}</g>);
      });
      els.push(<g key="shelf">{D.box(26, yb, 668, 9, { fill: GREY, stroke: GREY, rx: 3, fillOpacity: 0.5 })}</g>);
      return { h: yb + (hasBelow ? 86 : 30), el: els };
    },
  };
})();
