// Glyph — drawing core: 10 render styles, palettes + color modes, shape factory, helpers
(function () {
  const hueSet = (h, c) => ({
    p: `oklch(0.51 ${c == null ? 0.155 : c} ${h})`,
    deep: `oklch(0.33 0.10 ${h})`,
    mid: `oklch(0.84 0.06 ${h})`,
    soft: `oklch(0.962 0.018 ${h})`,
  });
  const single = (name, h) => Object.assign({ name, hue: h }, hueSet(h));
  const multi = (name, hues) => {
    const sets = hues.map((h) => hueSet(h));
    return Object.assign({ name, multi: sets }, sets[0]);
  };
  const PALETTES = [
    single('Indigo', 262),
    single('Forest', 155),
    single('Ember', 45),
    single('Plum', 320),
    { name: 'Ink', p: '#2b2925', deep: '#1d1b18', mid: '#c9c5bd', soft: '#f2f0ec' },
    single('Lagoon', 210),
    single('Rose', 350),
    multi('Festival', [262, 30, 155, 320, 200]),
    multi('Sunset', [25, 50, 75, 350, 315]),
    multi('Tide', [250, 205, 175, 285, 155]),
  ];
  const INK_SHADES = ['#1d1b18', '#514c43', '#807a6f', '#3a362f', '#94908a'].map((g) => ({ p: g, deep: '#1d1b18', mid: '#d8d5d0', soft: '#f2f0ec' }));

  const palAt = (pal, i) => {
    if (pal._items && pal._items[i] && pal._items[i].color != null) {
      const c = pal._items[i].color;
      return c === 'ink' ? { p: '#2b2925', deep: '#1d1b18', mid: '#c9c5bd', soft: '#f2f0ec' } : hueSet(c);
    }
    return pal.multi ? pal.multi[i % pal.multi.length] : pal;
  };

  // colorMode: 'auto' | 'single' | 'multi'
  function effectivePal(base, mode) {
    const isMulti = mode === 'multi' || (mode !== 'single' && base.multi);
    if (!isMulti) return base.multi ? Object.assign({ name: base.name }, base.multi[0]) : base;
    if (base.multi) return base;
    const sets = base.hue != null
      ? [0, 72, 144, 216, 288].map((o) => hueSet((base.hue + o) % 360))
      : INK_SHADES;
    return Object.assign({ name: base.name, multi: sets }, sets[0]);
  }

  const STYLES = [
    { id: 'clean', name: 'Clean', cat: 'Minimal' },
    { id: 'soft', name: 'Soft', cat: 'Minimal' },
    { id: 'thin', name: 'Thin', cat: 'Minimal' },
    { id: 'paper', name: 'Paper', cat: 'Minimal' },
    { id: 'air', name: 'Air', cat: 'Minimal' },
    { id: 'sketch', name: 'Sketch', cat: 'Hand-drawn' },
    { id: 'marker', name: 'Marker', cat: 'Hand-drawn' },
    { id: 'crayon', name: 'Crayon', cat: 'Hand-drawn' },
    { id: 'graphite', name: 'Pencil', cat: 'Hand-drawn' },
    { id: 'brush', name: 'Brush', cat: 'Hand-drawn' },
    { id: 'serif', name: 'Serif', cat: 'Editorial' },
    { id: 'press', name: 'Press', cat: 'Editorial' },
    { id: 'newsprint', name: 'Newsprint', cat: 'Editorial' },
    { id: 'magazine', name: 'Magazine', cat: 'Editorial' },
    { id: 'vintage', name: 'Vintage', cat: 'Editorial' },
    { id: 'mono', name: 'Mono', cat: 'Technical' },
    { id: 'outline', name: 'Outline', cat: 'Technical' },
    { id: 'stitch', name: 'Stitch', cat: 'Technical' },
    { id: 'dotted', name: 'Dotted', cat: 'Technical' },
    { id: 'blueprint', name: 'Blueprint', cat: 'Technical' },
    { id: 'schematic', name: 'Schematic', cat: 'Technical' },
    { id: 'bold', name: 'Bold', cat: 'Playful' },
    { id: 'pop', name: 'Pop', cat: 'Playful' },
    { id: 'bubble', name: 'Bubble', cat: 'Playful' },
    { id: 'candy', name: 'Candy', cat: 'Playful' },
    { id: 'comic', name: 'Comic', cat: 'Playful' },
  ];
  const CFG = {
    clean: {},
    sketch: { font: "'Caveat', cursive", fszMul: 1.26, cw: 0.42, swMul: 1.2, jitter: 1 },
    bold: { swMul: 1.85, rxSmall: 4, fwAdd: 100 },
    soft: { rxMin: 14, noStrokeFill: true, swMul: 0.95 },
    mono: { font: "'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace", fszMul: 0.94, cw: 0.64, swMul: 0.85, rxZero: true, upper: true, ls: 0.4 },
    outline: { noFill: true, swMul: 1.1 },
    pop: { shadow: true, inkStroke: true, rxSmall: 6, swMul: 1.3, fwAdd: 50 },
    serif: { font: "Georgia, 'Times New Roman', serif", fszMul: 0.98, cw: 0.5, swMul: 0.8, rxSmall: 2, italicSub: true },
    marker: { jitter: 0.5, swMul: 2.1, rxMin: 12, fwAdd: 100 },
    stitch: { dash: '6 5', swMul: 1.05 },
    dotted: { dash: '0.5 7', swMul: 1.3, rxMin: 12 },
    thin: { swMul: 0.55, fszMul: 0.96, ls: 0.3, rxSmall: 3 },
    bubble: { rxMin: 24, swMul: 1.5, fwAdd: 50 },
    press: { font: "Georgia, 'Times New Roman', serif", shadow: true, rxSmall: 2, swMul: 1.1, fszMul: 0.98 },
    crayon: { jitter: 1.4, swMul: 2.4, font: "'Caveat', cursive", fszMul: 1.2, rxMin: 10 },
    paper: { noStrokeFill: true, shadow: true, shadowColor: '#dedacf', rxMin: 12, swMul: 0.9 },
    air: { noStrokeFill: true, swMul: 0.6, ls: 0.5, fszMul: 1.02, rxMin: 16 },
    graphite: { jitter: 0.9, noFill: true, swMul: 0.75, font: "'Caveat', cursive", fszMul: 1.2 },
    brush: { jitter: 0.5, swMul: 2.6, inkStroke: true, fszMul: 1.04, fwAdd: 80, rxMin: 8 },
    newsprint: { font: "Georgia, 'Times New Roman', serif", upper: true, rxZero: true, swMul: 0.9, ls: 0.5, fszMul: 0.92 },
    magazine: { font: "Georgia, 'Times New Roman', serif", inkStroke: true, swMul: 1.25, rxSmall: 0, fwAdd: 100, fszMul: 0.97 },
    vintage: { font: "Georgia, 'Times New Roman', serif", dblStroke: true, rxSmall: 2, swMul: 1, fszMul: 0.96, ls: 0.3, italicSub: true },
    blueprint: { font: "'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace", dblStroke: true, noFill: true, swMul: 0.7, rxZero: true, upper: true, ls: 0.5, fszMul: 0.9, cw: 0.64 },
    schematic: { font: "'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace", dash: '12 5', swMul: 0.9, rxSmall: 0, fszMul: 0.92, cw: 0.64 },
    candy: { rxMin: 26, swMul: 2, fwAdd: 100, shadow: true, shadowColor: '#e8e2d8' },
    comic: { font: "'Caveat', cursive", inkStroke: true, shadow: true, swMul: 1.6, fszMul: 1.22, rxSmall: 6, fwAdd: 100, jitter: 0.35 },
  };

  const INK = '#211f1c';
  const GREY = '#6f6a61';

  function mulberry(seed) {
    let t = (seed || 7) >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function polar(cx, cy, r, deg) {
    const a = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }
  function arcPath(cx, cy, r, a1, a2) {
    const [x1, y1] = polar(cx, cy, r, a1);
    const [x2, y2] = polar(cx, cy, r, a2);
    const large = a2 - a1 > 180 ? 1 : 0;
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }
  function ringSeg(cx, cy, R, r, a1, a2) {
    const [ox1, oy1] = polar(cx, cy, R, a1);
    const [ox2, oy2] = polar(cx, cy, R, a2);
    const [ix1, iy1] = polar(cx, cy, r, a2);
    const [ix2, iy2] = polar(cx, cy, r, a1);
    const large = a2 - a1 > 180 ? 1 : 0;
    return `M${ox1.toFixed(1)} ${oy1.toFixed(1)} A${R} ${R} 0 ${large} 1 ${ox2.toFixed(1)} ${oy2.toFixed(1)} L${ix1.toFixed(1)} ${iy1.toFixed(1)} A${r} ${r} 0 ${large} 0 ${ix2.toFixed(1)} ${iy2.toFixed(1)} Z`;
  }
  function numOf(it) {
    const s = (it.value || '') + ' ' + (it.label || '') + ' ' + (it.detail || '');
    const m = s.match(/(\d[\d,]*\.?\d*)/);
    return m ? parseFloat(m[1].replace(/,/g, '')) : null;
  }
  function seriesOf(items) {
    const vs = items.map(numOf);
    if (vs.every((v) => v == null)) return items.map((_, i) => items.length + 1 - i);
    const real = vs.filter((v) => v != null);
    const max = Math.max(...real);
    return vs.map((v) => (v == null ? max * 0.5 : v));
  }
  function wrapWords(str, maxChars, maxLines) {
    const words = String(str == null ? '' : str).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const w of words) {
      if (!cur || (cur + ' ' + w).length <= maxChars) cur = cur ? cur + ' ' + w : w;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (maxLines && lines.length > maxLines) {
      lines.length = maxLines;
      lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S{0,3}$/, '') + '…';
    }
    return lines.length ? lines : [''];
  }

  const CONN_DASH = { solid: undefined, dashed: '7 6', dotted: '0.5 7' };

  // ---------- decorative backdrops (behind a diagram) ----------
  function backdrop(kind, w, h, pal) {
    if (!kind || kind === 'none') return null;
    const base = pal && pal.multi ? pal.multi[0] : (pal || {});
    const accent = base.p || GREY;
    const soft = base.soft || '#f2f0ec';
    const els = [];
    if (kind === 'tint') {
      els.push(<rect key="bg" x="0" y="0" width={w} height={h} rx="16" fill={soft} />);
    } else if (kind === 'rings') {
      els.push(<rect key="bg" x="0" y="0" width={w} height={h} rx="16" fill={soft} fillOpacity="0.7" />);
      const cx = w - 92, cy = h - 30;
      for (let i = 6; i >= 1; i--) {
        els.push(<circle key={'r' + i} cx={cx} cy={cy} r={i * 52} fill="none" stroke={accent} strokeWidth="2.2" opacity={0.04 + 0.014 * (7 - i)} />);
      }
    } else if (kind === 'dots') {
      els.push(<rect key="bg" x="0" y="0" width={w} height={h} rx="16" fill={soft} fillOpacity="0.55" />);
      for (let y = 30; y < h - 12; y += 32) {
        for (let x = 30; x < w - 12; x += 32) {
          els.push(<circle key={'d' + x + '_' + y} cx={x} cy={y} r="1.7" fill={accent} opacity="0.09" />);
        }
      }
    }
    return <g key="__backdrop" style={{ pointerEvents: 'none' }}>{els}</g>;
  }

  function mk(styleId, seed, conn) {
    const C = CFG[styleId] || CFG.clean;
    const CN = conn || {};
    const connDash = CN.line ? CONN_DASH[CN.line] : undefined;
    const connSw = CN.weight || 1;
    const rnd = mulberry(seed);
    const amt = C.jitter || 0;
    const F = C.font || "'Helvetica Neue', Helvetica, Arial, sans-serif";
    const fsz = (s) => Math.round(s * (C.fszMul || 1));
    const CW = C.cw || 0.55;
    const j = (m) => (rnd() - 0.5) * (m == null ? 2.4 : m) * amt;
    const fw = (w) => Math.min(800, (w || 400) + (C.fwAdd || 0));
    const txt = (str, w) => (C.upper && (w || 400) >= 600 ? String(str == null ? '' : str).toUpperCase() : str);
    const isFilled = (f) => f && f !== 'none' && f !== '#fff' && f !== '#ffffff';
    const SH = 3.5;

    function seg(x1, y1, x2, y2) {
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
      const o = Math.min(3.4, len * 0.07) * (rnd() - 0.5) * 2 * amt;
      return `Q${(x1 + (x2 - x1) / 2 + nx * o).toFixed(1)} ${(y1 + (y2 - y1) / 2 + ny * o).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    }
    function linePath(x1, y1, x2, y2) {
      if (!amt) return `M${x1} ${y1}L${x2} ${y2}`;
      const a = [x1 + j(), y1 + j()], b = [x2 + j(), y2 + j()];
      return `M${a[0].toFixed(1)} ${a[1].toFixed(1)}` + seg(a[0], a[1], b[0], b[1]);
    }
    function polyPath(pts, close) {
      const p = pts.map(([a, b]) => [a + j(), b + j()]);
      let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
      for (let i = 1; i < p.length; i++) d += seg(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]);
      if (close) d += seg(p[p.length - 1][0], p[p.length - 1][1], p[0][0], p[0][1]) + 'Z';
      return d;
    }
    const swp = (o) => ((o && o.sw) || 1.5) * (C.swMul || 1);
    const rxFor = (o) => {
      const r = o.rx == null ? 10 : o.rx;
      if (C.rxZero) return 0;
      if (C.rxSmall != null) return r >= 18 ? r : C.rxSmall;
      if (C.rxMin != null) return r >= 18 ? r : Math.max(r, C.rxMin);
      return r;
    };
    const mapFill = (f) => (C.noFill && isFilled(f) ? '#fff' : f || 'none');
    const strokeFor = (o, fill) => {
      if (C.inkStroke && o.stroke && o.stroke !== 'none') return INK;
      if (C.noStrokeFill && isFilled(fill) && !C.noFill) return 'none';
      return o.stroke || INK;
    };
    const dashFor = (o) => o.dash || C.dash;
    const wantShadow = (o, fill) => C.shadow && isFilled(fill) && (o.fillOpacity == null || o.fillOpacity > 0.9) && o.opacity == null;

    const api = {
      F, fsz, INK, GREY, cfg: C, styleId,
      duo(c, solid) {
        if (C.noFill) return { fill: '#fff', text: c.deep, sub: GREY, stroke: c.p };
        if (solid) return { fill: c.p, text: '#fff', sub: 'rgba(255,255,255,0.78)', stroke: c.p };
        return { fill: c.soft, text: c.deep, sub: GREY, stroke: c.p };
      },
      box(x, y, w, h, o) {
        o = o || {};
        const fill = mapFill(o.fill);
        const st = strokeFor(o, o.fill);
        const sh = wantShadow(o, fill);
        const main = amt
          ? <path d={polyPath([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true)} fill={fill} stroke={st} strokeWidth={swp(o)} strokeLinejoin="round" strokeDasharray={dashFor(o)} opacity={o.opacity} fillOpacity={o.fillOpacity} />
          : <rect x={x} y={y} width={w} height={h} rx={rxFor(o)} fill={fill} stroke={st} strokeWidth={swp(o)} strokeDasharray={dashFor(o)} opacity={o.opacity} fillOpacity={o.fillOpacity} />;
        const inner = C.dblStroke && !amt && st && st !== 'none' && w > 24 && h > 24
          ? <rect x={x + 3.5} y={y + 3.5} width={w - 7} height={h - 7} rx={Math.max(0, rxFor(o) - 3)} fill="none" stroke={st} strokeWidth={swp(o) * 0.6} strokeDasharray={dashFor(o)} opacity={o.opacity} />
          : null;
        if (!sh) return inner ? <g>{main}{inner}</g> : main;
        return <g><rect x={x + SH} y={y + SH} width={w} height={h} rx={rxFor(o)} fill={C.shadowColor || INK} />{main}{inner}</g>;
      },
      poly(pts, o) {
        o = o || {};
        const fill = mapFill(o.fill);
        const st = strokeFor(o, o.fill);
        const sh = wantShadow(o, fill);
        const main = amt
          ? <path d={polyPath(pts, true)} fill={fill} stroke={st} strokeWidth={swp(o)} strokeLinejoin="round" strokeDasharray={dashFor(o)} fillOpacity={o.fillOpacity} />
          : <polygon points={pts.map((p) => p.join(',')).join(' ')} fill={fill} stroke={st} strokeWidth={swp(o)} strokeLinejoin="round" strokeDasharray={dashFor(o)} fillOpacity={o.fillOpacity} />;
        if (!sh) return main;
        return <g><polygon points={pts.map((p) => `${p[0] + SH},${p[1] + SH}`).join(' ')} fill={C.shadowColor || INK} />{main}</g>;
      },
      circle(cx, cy, r, o) {
        o = o || {};
        const fill = mapFill(o.fill);
        const st = strokeFor(o, o.fill);
        const sh = wantShadow(o, fill);
        let main;
        if (amt) {
          const rx = r * (1 + (rnd() - 0.5) * 0.06 * amt), ry = r * (1 + (rnd() - 0.5) * 0.06 * amt);
          main = <ellipse cx={cx} cy={cy} rx={rx} ry={ry} transform={`rotate(${((rnd() - 0.5) * 5 * amt).toFixed(1)} ${cx} ${cy})`} fill={fill} stroke={st} strokeWidth={swp(o)} strokeDasharray={dashFor(o)} fillOpacity={o.fillOpacity} />;
        } else {
          main = <circle cx={cx} cy={cy} r={r} fill={fill} stroke={st} strokeWidth={swp(o)} strokeDasharray={dashFor(o)} fillOpacity={o.fillOpacity} />;
        }
        const innerC = C.dblStroke && !amt && st && st !== 'none' && r > 13
          ? <circle cx={cx} cy={cy} r={r - 4} fill="none" stroke={st} strokeWidth={swp(o) * 0.6} strokeDasharray={dashFor(o)} />
          : null;
        if (!sh) return innerC ? <g>{main}{innerC}</g> : main;
        return <g><circle cx={cx + SH} cy={cy + SH} r={r} fill={C.shadowColor || INK} />{main}{innerC}</g>;
      },
      ellipse(cx, cy, rx, ry, o) {
        o = o || {};
        const fill = mapFill(o.fill);
        const st = strokeFor(o, o.fill);
        const sh = wantShadow(o, fill);
        const rot = amt ? `rotate(${((rnd() - 0.5) * 3 * amt).toFixed(1)} ${cx} ${cy})` : undefined;
        const main = <ellipse cx={cx} cy={cy} rx={rx * (amt ? 1 + (rnd() - 0.5) * 0.04 * amt : 1)} ry={ry} transform={rot} fill={fill} stroke={st} strokeWidth={swp(o)} strokeDasharray={dashFor(o)} fillOpacity={o.fillOpacity} />;
        if (!sh) return main;
        return <g><ellipse cx={cx + SH} cy={cy + SH} rx={rx} ry={ry} fill={C.shadowColor || INK} />{main}</g>;
      },
      line(x1, y1, x2, y2, o) {
        o = o || {};
        return <path d={linePath(x1, y1, x2, y2)} fill="none" stroke={o.stroke || INK} strokeWidth={swp(o)} strokeLinecap="round" strokeDasharray={dashFor(o)} />;
      },
      path(d, o) {
        o = o || {};
        return <path d={d} fill={mapFill(o.fill)} stroke={o.stroke || 'none'} strokeWidth={swp(o)} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dashFor(o)} fillOpacity={o.fillOpacity} />;
      },
      head(x2, y2, ang, stroke, sw) {
        const kind = CN.head || 'arrow';
        if (kind === 'none') return null;
        const L = 9 * (C.swMul > 1.5 ? 1.25 : 1) * Math.max(0.8, connSw);
        if (kind === 'dot') return <circle cx={x2} cy={y2} r={L * 0.42} fill={stroke} />;
        const hx = (k) => x2 - L * Math.cos(ang + k), hy = (k) => y2 - L * Math.sin(ang + k);
        if (kind === 'solid') return <path d={`M${hx(0.55).toFixed(1)} ${hy(0.55).toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}L${hx(-0.55).toFixed(1)} ${hy(-0.55).toFixed(1)}Z`} fill={stroke} stroke={stroke} strokeWidth={1} strokeLinejoin="round" />;
        return <path d={`M${hx(0.5).toFixed(1)} ${hy(0.5).toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}L${hx(-0.5).toFixed(1)} ${hy(-0.5).toFixed(1)}`} fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />;
      },
      arrow(x1, y1, x2, y2, o) {
        o = o || {};
        const a = Math.atan2(y2 - y1, x2 - x1);
        const st = o.stroke || INK;
        const sw = swp(o) * connSw;
        return (
          <g>
            <path d={linePath(x1, y1, x2, y2)} fill="none" stroke={st} strokeWidth={sw} strokeLinecap="round" strokeDasharray={connDash || dashFor(o)} />
            {api.head(x2, y2, a, st, sw)}
          </g>
        );
      },
      arcArrow(cx, cy, R, a1, a2, o) {
        o = o || {};
        const [x2, y2] = polar(cx, cy, R, a2);
        const t = (a2 * Math.PI) / 180;
        const tang = Math.atan2(Math.cos(t), -Math.sin(t));
        const Rj = amt ? R * (1 + (rnd() - 0.5) * 0.03) : R;
        const st = o.stroke || INK;
        const sw = swp(o) * connSw;
        return (
          <g>
            <path d={arcPath(cx, cy, Rj, a1, a2)} fill="none" stroke={st} strokeWidth={sw} strokeLinecap="round" strokeDasharray={connDash || dashFor(o)} />
            {api.head(x2, y2, tang, st, sw)}
          </g>
        );
      },
      lines(str, size, maxW, maxLines) {
        const maxChars = Math.max(3, Math.floor(maxW / (fsz(size) * CW)));
        return wrapWords(str, maxChars, maxLines || 2);
      },
      // wrap, shrinking the font progressively so the text fits the box — including a single word
      // longer than the column (which previously overflowed the box edge instead of shrinking)
      fitLines(str, size, maxW, maxLines) {
        const ml = maxLines || 2;
        const mcAt = (sz) => Math.max(3, Math.floor(maxW / (fsz(sz) * CW)));
        for (const mul of [1, 0.9, 0.82, 0.74, 0.66, 0.58]) {
          const mc = mcAt(size * mul);
          const ls = wrapWords(str, mc, ml);
          const overflows = ls.some((l) => String(l).length > mc); // a word wider than the column
          if (!overflows && !String(ls[ls.length - 1]).endsWith('…')) return { mul, ls };
        }
        // smallest size still overflows: truncate the over-long line so nothing spills outside the box
        const mc = mcAt(size * 0.58);
        const ls = wrapWords(str, mc, 99).map((l) => (String(l).length > mc ? String(l).slice(0, Math.max(1, mc - 1)) + '…' : l));
        return { mul: 0.58, ls };
      },
      text(x, y, str, o) {
        o = o || {};
        str = txt(str, o.weight);
        const fit = api.fitLines(str, o.size || 14, o.maxW || 240, o.maxLines || 2);
        const size = fsz((o.size || 14) * fit.mul);
        const ls = fit.ls;
        return (
          <text x={x} y={y} fontFamily={F} fontSize={size} fontWeight={fw(o.weight)} fill={o.fill || INK} textAnchor={o.anchor || 'start'} letterSpacing={C.ls || (amt ? 0.2 : o.ls)} fontStyle={C.italicSub && (o.weight || 400) < 500 ? 'italic' : undefined}>
            {ls.map((l, i) => (
              <tspan key={i} x={x} dy={i === 0 ? 0 : size * (o.lh || 1.22)}>{l}</tspan>
            ))}
          </text>
        );
      },
      // vertically-centered text block around (x, y)
      ctext(x, y, str, o) {
        o = o || {};
        str = txt(str, o.weight);
        const fit = api.fitLines(str, o.size || 14, o.maxW || 240, o.maxLines || 2);
        const size = fsz((o.size || 14) * fit.mul);
        const ls = fit.ls;
        const lh = size * (o.lh || 1.22);
        const first = y - ((ls.length - 1) * lh) / 2 + size * 0.34;
        return (
          <text x={x} y={first} fontFamily={F} fontSize={size} fontWeight={fw(o.weight)} fill={o.fill || INK} textAnchor={o.anchor || 'middle'} letterSpacing={C.ls} fontStyle={C.italicSub && (o.weight || 400) < 500 ? 'italic' : undefined}>
            {ls.map((l, i) => (
              <tspan key={i} x={x} dy={i === 0 ? 0 : lh}>{l}</tspan>
            ))}
          </text>
        );
      },
      textH(str, size, maxW, maxLines, lh) {
        const ls = api.lines(str, size, maxW, maxLines || 2);
        return ls.length * fsz(size) * (lh || 1.22);
      },
      title(str) {
        return { el: <g key="__t">{api.text(24, 42, str, { size: 19, weight: 700, fill: INK, maxW: 670, maxLines: 1 })}</g>, y0: 86 };
      },
    };
    return api;
  }

  window.GlyphDraw = { mk, PALETTES, STYLES, palAt, effectivePal, polar, arcPath, ringSeg, numOf, seriesOf, hashStr, INK, GREY, wrapWords, hueSet, backdrop };
})();
