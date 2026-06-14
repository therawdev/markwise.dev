// Glyph — diagram renderers, part E: iceberg, mountain, stairs, balance, pillars, bridge, puzzle, gears, ladder, journey
(function () {
  const { GREY, polar, palAt } = window.GlyphDraw;
  const I = window.GlyphIcons;
  window.DIAGRAMS = window.DIAGRAMS || {};
  const D9 = window.DIAGRAMS;
  const W = 720;

  D9.iceberg = {
    name: 'Iceberg',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const nAbove = Math.max(1, Math.round(n / 3));
      const above = IT.slice(0, nAbove), below = IT.slice(nAbove);
      const rowsBelow = below.length;
      const wy = t.y0 + 96;
      const h = Math.max(wy + 150 + rowsBelow * 10, wy + 40 + rowsBelow * 40);
      const c0 = A(0);
      const els = [t.el];
      els.push(<g key="berg-top">{D.poly([[130, wy], [172, wy - 58], [206, wy - 92], [246, wy - 44], [272, wy]], { fill: c0.soft, stroke: c0.p, sw: 1.8 })}</g>);
      els.push(<g key="berg-bot">{D.poly([[128, wy], [274, wy], [312, wy + 64], [236, wy + 142], [152, wy + 128], [102, wy + 58]], { fill: c0.p, fillOpacity: 0.22, stroke: c0.p, sw: 1.6, dash: '5 4' })}</g>);
      els.push(<g key="water">{D.line(36, wy, W - 36, wy, { stroke: '#9fb6c8', sw: 2, dash: '8 6' })}</g>);
      els.push(<g key="wlab">{D.ctext(W - 92, wy - 12, 'visible', { size: 10, weight: 700, fill: GREY, maxW: 100, maxLines: 1 })}{D.ctext(W - 86, wy + 18, 'beneath', { size: 10, weight: 700, fill: GREY, maxW: 100, maxLines: 1 })}</g>);
      above.forEach((it, k) => {
        const c = A(k);
        const y = wy - 70 + k * 34;
        els.push(
          <g key={'it' + k}>
            {D.ctext(390, y, it.label + (it.value ? '  ·  ' + it.value : ''), { size: 12.5, weight: 600, fill: c.deep, anchor: 'start', maxW: 288, maxLines: 1 })}
          </g>
        );
        els.push(<g key={'ico' + k}>{I.draw(366, y, 18, I.nameFor(it), c.p, 2)}</g>);
      });
      below.forEach((it, k) => {
        const gi = nAbove + k;
        const c = A(gi);
        const y = wy + 36 + k * 40;
        els.push(
          <g key={'it' + gi}>
            {D.ctext(390, y - (it.detail ? 8 : 0), it.label + (it.value ? '  ·  ' + it.value : ''), { size: 12.5, weight: 600, fill: c.deep, anchor: 'start', maxW: 288, maxLines: 1 })}
            {it.detail ? D.ctext(390, y + 12, it.detail, { size: 10, fill: GREY, anchor: 'start', maxW: 288, maxLines: 1 }) : null}
          </g>
        );
        els.push(<g key={'ico' + gi}>{I.draw(366, y, 18, I.nameFor(it), c.p, 2)}</g>);
      });
      return { h, el: els };
    },
  };

  D9.mountain = {
    name: 'Mountain',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const baseY = t.y0 + 246, topY = t.y0 + 48;
      const xs0 = 78, xs1 = 588;
      const xAt = (i) => xs0 + (n === 1 ? 0.5 : i / (n - 1)) * (xs1 - xs0);
      const yAt = (i) => baseY + (n === 1 ? 0.5 : i / (n - 1)) * (topY - baseY);
      const els = [t.el];
      const ridge = IT.map((_, i) => [xAt(i), yAt(i)]);
      // filled ascent under the ridge + baseline
      els.push(<g key="fill">{D.path('M' + xs0 + ' ' + baseY + ' L' + ridge.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') + ' L' + ridge[ridge.length - 1][0].toFixed(1) + ' ' + baseY + ' Z', { fill: A(0).p, fillOpacity: 0.12, stroke: 'none' })}</g>);
      els.push(<g key="ridge">{D.path('M' + ridge.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L'), { fill: 'none', stroke: A(0).p, sw: 2.2 })}</g>);
      els.push(<g key="base">{D.line(xs0 - 14, baseY, xs1 + 14, baseY, { stroke: '#d8d4cd', sw: 1.4 })}</g>);
      // summit flag on the last (highest) node
      const sx = xAt(n - 1), sy = yAt(n - 1);
      els.push(<g key="flag">{D.line(sx, sy - 6, sx, sy - 34, { stroke: A(n - 1).deep, sw: 1.8 })}{D.poly([[sx, sy - 34], [sx + 22, sy - 28], [sx, sy - 22]], { fill: A(n - 1).p, stroke: A(n - 1).p })}</g>);
      IT.forEach((it, i) => {
        const c = A(i);
        const x = xAt(i), y = yAt(i);
        els.push(
          <g key={'it' + i}>
            {D.line(x, y, x, baseY, { stroke: c.mid, sw: 1.2, dash: '3 4' })}
            {it.value ? D.ctext(x, y - (i === n - 1 ? 44 : 15), it.value, { size: 11, weight: 700, fill: c.p, maxW: 110, maxLines: 1 }) : null}
            {D.circle(x, y, 5, { fill: c.p, stroke: '#fff', sw: 2 })}
            {D.ctext(x, baseY + 20, it.label, { size: 11.5, weight: 600, fill: c.deep, maxW: Math.max(94, (xs1 - xs0) / n - 6), maxLines: 2 })}
          </g>
        );
      });
      return { h: baseY + 54, el: els };
    },
  };

  D9.stairs = {
    name: 'Stairs',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const sh = Math.min(46, 220 / n);
      const baseY = t.y0 + 64 + n * sh;
      const sw = (W - 70) / (n + 0.6);
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const x = 36 + i * sw;
        const y = baseY - (i + 1) * sh;
        els.push(
          <g key={'it' + i}>
            {D.box(x, y, sw, (i + 1) * sh, { fill: c.p, stroke: c.p, rx: 3, fillOpacity: pal.multi ? 0.9 : 0.3 + (0.6 * i) / Math.max(1, n - 1) })}
            {D.ctext(x + sw / 2, y - 18 - (it.value ? 14 : 0), it.label, { size: 11.5, weight: 600, fill: c.deep, maxW: sw + 14, maxLines: 2 })}
            {it.value ? D.ctext(x + sw / 2, y - 16, it.value, { size: 10.5, weight: 700, fill: c.p, maxW: sw + 8, maxLines: 1 }) : null}
          </g>
        );
      });
      els.push(<g key="base">{D.line(28, baseY, W - 28, baseY, { stroke: '#d8d4cd', sw: 1.6 })}</g>);
      return { h: baseY + 24, el: els };
    },
  };

  D9.balance = {
    name: 'Balance',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items;
      const L = IT.filter((_, i) => i % 2 === 0), R = IT.filter((_, i) => i % 2 === 1);
      const rows = Math.max(L.length, R.length);
      const pillH = 30, pillGap = 8;
      const py = t.y0 + 64 + rows * (pillH + pillGap);
      const cx = 360, lx = 184, rx = 536;
      const tilt = 9;
      const yL = py + tilt, yR = py - tilt;
      const els = [t.el];
      els.push(<g key="fulcrum">{D.poly([[cx - 34, py + 78], [cx + 34, py + 78], [cx, py + 6]], { fill: '#e4e1da', stroke: '#b9b4ab', sw: 1.6 })}</g>);
      els.push(<g key="beam">{D.line(lx, yL, rx, yR, { stroke: '#7a756c', sw: 3.5 })}</g>);
      [[lx, yL, L, 0], [rx, yR, R, 1]].forEach(([px, pyy, list, side]) => {
        els.push(<g key={'pan' + side}>{D.line(px, pyy, px - 30, pyy + 26, { stroke: '#b9b4ab', sw: 1.4 })}{D.line(px, pyy, px + 30, pyy + 26, { stroke: '#b9b4ab', sw: 1.4 })}{D.path(`M${px - 40} ${pyy + 26} A 40 16 0 0 0 ${px + 40} ${pyy + 26}`, { fill: '#efece7', stroke: '#b9b4ab', sw: 1.6 })}</g>);
        list.forEach((it, k) => {
          const gi = side === 0 ? k * 2 : k * 2 + 1;
          const c = A(gi);
          const y = pyy - 12 - (list.length - k) * (pillH + pillGap);
          els.push(
            <g key={'it' + gi}>
              {D.box(px - 86, y, 172, pillH, { fill: c.soft, stroke: c.p, rx: 15 })}
              {I.draw(px - 70, y + pillH / 2, 17, I.nameFor(it), c.p, 2)}
              {D.ctext(px + 8, y + pillH / 2, it.label + (it.value ? ' · ' + it.value : ''), { size: 11, weight: 600, fill: c.deep, maxW: 128, maxLines: 1 })}
            </g>
          );
        });
      });
      return { h: py + 102, el: els };
    },
  };

  D9.pillars = {
    name: 'Pillars',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const gap = 14;
      const pw = Math.min(96, (W - 96 - (n - 1) * gap) / n);
      const totW = n * pw + (n - 1) * gap;
      const x0 = (W - totW) / 2;
      const roofY = t.y0 + 8, pillY = roofY + 64, pillH = 150;
      const baseY = pillY + pillH;
      const els = [t.el];
      els.push(<g key="pediment">{D.poly([[x0 - 26, roofY + 34], [W - x0 + 26, roofY + 34], [360, roofY - 12]], { fill: A(0).soft, stroke: A(0).p, sw: 1.6 })}</g>);
      els.push(<g key="arch">{D.box(x0 - 26, roofY + 40, totW + 52, 18, { fill: A(0).p, stroke: A(0).p, rx: 3 })}</g>);
      els.push(<g key="base">{D.box(x0 - 26, baseY + 4, totW + 52, 16, { fill: '#e4e1da', stroke: '#b9b4ab', rx: 3 })}</g>);
      IT.forEach((it, i) => {
        const c = A(i);
        const x = x0 + i * (pw + gap);
        els.push(
          <g key={'it' + i}>
            {D.box(x, pillY, pw, pillH, { fill: c.soft, stroke: c.p, rx: 6 })}
            {D.box(x - 5, pillY - 8, pw + 10, 10, { fill: c.p, stroke: c.p, rx: 3 })}
            {I.draw(x + pw / 2, pillY + 26, 22, I.nameFor(it), c.p, 2)}
            {D.ctext(x + pw / 2, pillY + pillH / 2 + 14 - (it.value ? 10 : 0), it.label, { size: 11.5, weight: 600, fill: c.deep, maxW: pw - 10, maxLines: 4 })}
            {it.value ? D.ctext(x + pw / 2, pillY + pillH - 20, it.value, { size: 11, weight: 700, fill: c.p, maxW: pw - 8, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: baseY + 44, el: els };
    },
  };

  D9.bridge = {
    name: 'Bridge',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const deckY = t.y0 + 150;
      const bankW = 56, sag = 118;
      const x0 = 28 + bankW + 30, x1 = W - 28 - bankW - 30;
      const xAt = (i) => x0 + (n === 1 ? 0.5 : i / (n - 1)) * (x1 - x0);
      const cableY = (f) => deckY - 4 * sag * f * (1 - f);
      const els = [t.el];
      // piers + deck
      els.push(<g key="bankL">{D.box(28, deckY - 4, bankW, 76, { fill: '#e4e1da', stroke: '#b9b4ab', rx: 6 })}</g>);
      els.push(<g key="bankR">{D.box(W - 28 - bankW, deckY - 4, bankW, 76, { fill: '#e4e1da', stroke: '#b9b4ab', rx: 6 })}</g>);
      els.push(<g key="deck">{D.line(28, deckY, W - 28, deckY, { stroke: A(0).p, sw: 3 })}</g>);
      // suspension cable (sampled parabola so hangers meet it exactly)
      let cd = 'M' + x0.toFixed(1) + ' ' + deckY;
      for (let s = 1; s <= 28; s++) { const f = s / 28; cd += ' L' + (x0 + f * (x1 - x0)).toFixed(1) + ' ' + cableY(f).toFixed(1); }
      els.push(<g key="cable">{D.path(cd, { fill: 'none', stroke: A(0).p, sw: 2 })}</g>);
      IT.forEach((it, i) => {
        const c = A(i);
        const f = n === 1 ? 0.5 : i / (n - 1);
        const x = xAt(i);
        els.push(<g key={'h' + i}>{D.line(x, cableY(f), x, deckY, { stroke: c.mid, sw: 1.3 })}</g>);
        els.push(
          <g key={'it' + i}>
            {D.circle(x, deckY, 7, { fill: c.p, stroke: '#fff', sw: 2 })}
            {D.ctext(x, deckY + 24, it.label, { size: 11.5, weight: 600, fill: c.deep, maxW: Math.max(96, (x1 - x0) / Math.max(1, n - 1) - 8), maxLines: 2 })}
            {it.value ? D.ctext(x, deckY + 56, it.value, { size: 10.5, weight: 700, fill: c.p, maxW: 100, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: deckY + 86, el: els };
    },
  };

  D9.puzzle = {
    name: 'Puzzle',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const cols = Math.min(n, 4);
      const rows = Math.ceil(n / cols);
      const gap = 0, ph = 104, tabR = 15;
      const pw = (W - 64) / cols;
      const els = [t.el];
      IT.forEach((it, i) => {
        const c = A(i);
        const r = Math.floor(i / cols), k = i % cols;
        const x = 32 + k * pw, y = t.y0 + r * (ph + 18);
        const last = k === cols - 1 || i === n - 1;
        els.push(
          <g key={'it' + i}>
            {D.box(x, y, pw - 2, ph, { fill: c.soft, stroke: c.p, rx: 12 })}
            {!last ? D.circle(x + pw - 2, y + ph / 2, tabR, { fill: c.soft, stroke: c.p, sw: 1.5 }) : null}
            {k > 0 ? D.circle(x, y + ph / 2, tabR, { fill: '#fff', stroke: A(i - 1).p, sw: 1.5 }) : null}
            {D.ctext(x + pw / 2, y + ph / 2 - (it.detail ? 12 : 0) + 16, it.label, { size: 12, weight: 700, fill: c.deep, maxW: pw - 52, maxLines: 2 })}
            {it.detail ? D.ctext(x + pw / 2, y + ph / 2 + 18 + 16, it.detail, { size: 9.5, fill: GREY, maxW: pw - 52, maxLines: 2 }) : null}
          </g>
        );
        els.push(<g key={'ico' + i}>{I.draw(x + pw / 2, y + 26, 18, I.nameFor(it), c.p, 2)}</g>);
      });
      return { h: t.y0 + rows * (ph + 18) + 8, el: els };
    },
  };

  D9.gears = {
    name: 'Gears',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const layouts = {
        1: [[300, t.y0 + 140, 94]],
        2: [[214, t.y0 + 142, 84], [358, t.y0 + 150, 62]],
        3: [[172, t.y0 + 124, 84], [318, t.y0 + 206, 62], [432, t.y0 + 116, 54]],
        4: [[156, t.y0 + 122, 76], [298, t.y0 + 196, 58], [300, t.y0 + 52, 48], [442, t.y0 + 146, 60]],
      };
      const geo = layouts[Math.min(n, 4)] || layouts[4];
      const main = IT.slice(0, geo.length), rest = IT.slice(geo.length);
      const els = [t.el];
      main.forEach((it, i) => {
        const c = A(i);
        const [cx, cy, R] = geo[i];
        const teeth = [];
        const nT = Math.round(R / 8);
        for (let k = 0; k < nT; k++) {
          const a = (k * 360) / nT + i * 10;
          const [tx1, ty1] = polar(cx, cy, R - 2, a);
          const [tx2, ty2] = polar(cx, cy, R + 9, a);
          teeth.push(<g key={'t' + k}>{D.line(tx1, ty1, tx2, ty2, { stroke: c.p, sw: 7 })}</g>);
        }
        els.push(
          <g key={'it' + i}>
            {teeth}
            {D.circle(cx, cy, R, { fill: c.soft, stroke: c.p, sw: 2 })}
            {D.circle(cx, cy, 13, { fill: '#fff', stroke: c.p, sw: 1.8 })}
            {I.draw(cx, cy, R > 60 ? 19 : 16, I.nameFor(it), c.p, 2)}
            {it.value ? D.ctext(cx, cy - (R > 60 ? 30 : 24), it.value, { size: 11.5, weight: 700, fill: c.p, maxW: R * 1.4, maxLines: 1 }) : null}
            {D.ctext(cx, cy + (R > 60 ? 32 : 26), it.label, { size: R > 60 ? 12.5 : 11, weight: 700, fill: c.deep, maxW: R * 1.6, maxLines: 2 })}
          </g>
        );
      });
      // overflow: a tidy legend vertically centered beside the cluster
      const lx = 540;
      const restY0 = t.y0 + 150 - ((rest.length - 1) * 40) / 2;
      rest.forEach((it, k) => {
        const gi = geo.length + k;
        const c = A(gi);
        const y = restY0 + k * 40;
        els.push(
          <g key={'it' + gi}>
            {I.draw(lx + 7, y, 17, I.nameFor(it), c.p, 2)}
            {D.ctext(lx + 24, y - (it.detail ? 8 : 0), it.label + (it.value ? '  ·  ' + it.value : ''), { size: 12, weight: 700, fill: c.deep, anchor: 'start', maxW: 150, maxLines: 1 })}
            {it.detail ? D.ctext(lx + 24, y + 12, it.detail, { size: 9.5, fill: GREY, anchor: 'start', maxW: 150, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: Math.max(t.y0 + 296, t.y0 + 150 + (rest.length * 40) / 2 + 24), el: els };
    },
  };

  D9.ladder = {
    name: 'Ladder',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const rungGap = Math.min(64, 320 / n + 24);
      const y0 = t.y0 + 16, y1 = y0 + (n - 1) * rungGap + 32;
      const rl = 250, rr = 380;
      const els = [t.el];
      els.push(<g key="rails">{D.line(rl, y0 - 10, rl, y1, { stroke: '#a9a49b', sw: 4 })}{D.line(rr, y0 - 10, rr, y1, { stroke: '#a9a49b', sw: 4 })}</g>);
      IT.forEach((it, i) => {
        const c = A(i);
        const y = y0 + 12 + i * rungGap;
        els.push(
          <g key={'it' + i}>
            {D.line(rl, y, rr, y, { stroke: c.p, sw: 5 })}
            {I.draw(rr + 22, y, 18, I.nameFor(it), c.p, 2)}
            {D.ctext(rr + 42, y - (it.detail ? 8 : 0), it.label, { size: 12.5, weight: 600, fill: c.deep, anchor: 'start', maxW: 272, maxLines: 1 })}
            {it.detail ? D.ctext(rr + 42, y + 12, it.detail, { size: 10, fill: GREY, anchor: 'start', maxW: 272, maxLines: 1 }) : null}
            {it.value ? D.ctext(rl - 22, y, it.value, { size: 11.5, weight: 700, fill: c.p, anchor: 'end', maxW: 170, maxLines: 1 }) : null}
          </g>
        );
      });
      return { h: y1 + 26, el: els };
    },
  };

  D9.journey = {
    name: 'Journey',
    render(spec, D, pal) {
      const A = (i) => palAt(pal, i);
      const t = D.title(spec.title);
      const IT = spec.items, n = IT.length;
      const cols = 3;
      const rows = Math.ceil(n / cols);
      const rowH = 116;
      const xsBase = [130, 360, 590];
      const pts = IT.map((_, i) => {
        const r = Math.floor(i / cols), k = i % cols;
        const xs = r % 2 === 0 ? xsBase : [...xsBase].reverse();
        return [xs[k], t.y0 + 38 + r * rowH];
      });
      const els = [t.el];
      let road = `M${pts[0][0]} ${pts[0][1]}`;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        if (ay === by) road += ` L${bx} ${by}`;
        else road += ` C ${ax + (ax > 360 ? 130 : -130)} ${ay + rowH / 2} ${bx + (bx > 360 ? 130 : -130)} ${by - rowH / 2} ${bx} ${by}`;
      }
      els.push(<g key="road-base">{D.path(road, { fill: 'none', stroke: '#e7e3dc', sw: 14 })}</g>);
      els.push(<g key="road-dash">{D.path(road, { fill: 'none', stroke: '#b9b4ab', sw: 1.6, dash: '8 8' })}</g>);
      IT.forEach((it, i) => {
        const c = A(i);
        const [x, y] = pts[i];
        els.push(
          <g key={'it' + i}>
            {D.circle(x, y, 15, { fill: c.p, stroke: '#fff', sw: 2.6 })}
            {D.ctext(x, y + 32, it.label, { size: 11.5, weight: 600, fill: c.deep, maxW: 150, maxLines: 2 })}
            {it.value ? D.ctext(x, y - 28, it.value, { size: 10.5, weight: 700, fill: c.p, maxW: 120, maxLines: 1 }) : null}
          </g>
        );
        els.push(<g key={'ico' + i}>{I.draw(x, y, 16, I.nameFor(it), '#fff', 2)}</g>);
      });
      return { h: t.y0 + 38 + (rows - 1) * rowH + 70, el: els };
    },
  };
})();
