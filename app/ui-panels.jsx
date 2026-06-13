// Glyph — UI panels: picker overlay, edit panel, export & share modals
(function () {
  const { useState, useRef, useEffect } = React;
  const { PALETTES, STYLES } = window.GlyphDraw;

  // ---------- per-item Lucide icon picker ----------
  const COMMON_ICONS = [
    'shield', 'lock', 'key', 'eye', 'alert-triangle', 'bug', 'check-circle', 'zap',
    'rocket', 'trending-up', 'trending-down', 'target', 'flag', 'star', 'heart', 'award',
    'users', 'user', 'briefcase', 'building', 'globe', 'map-pin', 'mail', 'message-circle',
    'database', 'server', 'cpu', 'cloud', 'code', 'git-branch', 'terminal', 'settings',
    'dollar-sign', 'credit-card', 'bar-chart', 'pie-chart', 'activity', 'clock', 'calendar', 'layers',
    'lightbulb', 'search', 'file-text', 'folder', 'link', 'refresh-cw', 'wrench', 'package',
  ];
  function IconThumb({ name, color }) {
    const G = window.GlyphIcons;
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" style={{ display: 'block' }}>
        {G ? G.draw(12, 12, 24, name, color || 'currentColor', 1.8) : null}
      </svg>
    );
  }
  function IconPicker({ value, onChange }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const ref = useRef(null);
    useEffect(() => {
      if (!open) return;
      const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      document.addEventListener('mousedown', close);
      return () => document.removeEventListener('mousedown', close);
    }, [open]);
    const G = window.GlyphIcons;
    const all = (G && G.hasLucide && G.hasLucide()) ? G.lucideNames() : [];
    const list = q.trim()
      ? all.filter((n) => n.includes(q.trim().toLowerCase())).slice(0, 60)
      : COMMON_ICONS;
    return (
      <div className="icon-pick" ref={ref}>
        <button className={'icon-pick-btn' + (value ? ' set' : '')} title={value ? 'Icon: ' + value : 'Choose an icon'}
          onClick={() => setOpen((o) => !o)}>
          {value ? <IconThumb name={value} /> : <span className="icon-pick-auto">+ icon</span>}
        </button>
        {open ? (
          <div className="icon-pick-pop" onClick={(e) => e.stopPropagation()}>
            <input className="fld sm" autoFocus placeholder="Search 1000+ icons…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="icon-grid">
              <button className="icon-cell auto" title="Auto (match by label)" onClick={() => { onChange(null); setOpen(false); }}>Auto</button>
              {list.map((n) => (
                <button key={n} className={'icon-cell' + (n === value ? ' on' : '')} title={n} onClick={() => { onChange(n); setOpen(false); }}>
                  <IconThumb name={n} />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // ---------- export helpers ----------
  function svgString(el) {
    const c = el.cloneNode(true);
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    c.removeAttribute('class');
    c.removeAttribute('style');
    c.setAttribute('width', '1440');
    return new XMLSerializer().serializeToString(c);
  }
  function dl(name, blob) {
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(u), 5000);
  }
  function downloadSVG(el, name) {
    dl(name + '.svg', new Blob([svgString(el)], { type: 'image/svg+xml' }));
  }
  function downloadPNG(el, name, transparent) {
    const vb = el.viewBox.baseVal;
    const w = vb.width * 2, h = vb.height * 2;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      if (!transparent) { x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); }
      x.drawImage(img, 0, 0, w, h);
      c.toBlob((b) => dl(name + '.png', b), 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString(el));
  }
  function fileName(visual) {
    return (visual.spec.title || 'glyph-visual').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'glyph-visual';
  }
  window.GlyphExport = { svgString, downloadPNG, downloadSVG, fileName, dl };

  // ---------- small shared controls ----------
  function StyleChips({ value, onChange }) {
    const groups = [];
    STYLES.forEach((s) => {
      const cat = s.cat || 'Other';
      let g = groups.find((x) => x.name === cat);
      if (!g) { g = { name: cat, items: [] }; groups.push(g); }
      g.items.push(s);
    });
    return (
      <div className="style-groups">
        {groups.map((g) => (
          <div key={g.name} className="style-group">
            <div className="style-group-label">{g.name}</div>
            <div className="type-grid">
              {g.items.map((s) => (
                <button key={s.id} className={'chip' + (value === s.id ? ' on' : '')} onClick={() => onChange(s.id)}>{s.name}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  function swatchBg(p) {
    if (!p.multi) return p.p;
    const n = p.multi.length;
    const stops = p.multi.map((c, i) => `${c.p} ${(i * 100) / n}% ${((i + 1) * 100) / n}%`).join(', ');
    return `linear-gradient(135deg, ${stops})`;
  }
  function PaletteRow({ value, onChange }) {
    return (
      <div className="swatches">
        {PALETTES.map((p, i) => (
          <button key={i} className={'swatch' + (value === i ? ' on' : '') + (p.multi ? ' multi' : '')} title={p.name} style={{ background: swatchBg(p) }} onClick={() => onChange(i)}></button>
        ))}
      </div>
    );
  }
  const ITEM_HUES = [262, 210, 175, 155, 90, 45, 25, 350, 320, 'ink'];
  function ItemColorDots({ value, onChange }) {
    return (
      <div className="dot-row">
        <button className={'cdot auto' + (value == null ? ' on' : '')} title="Auto" onClick={() => onChange(null)}>A</button>
        {ITEM_HUES.map((h) => (
          <button
            key={h}
            className={'cdot' + (value === h ? ' on' : '')}
            style={{ background: h === 'ink' ? '#2b2925' : `oklch(0.51 0.155 ${h})` }}
            title={h === 'ink' ? 'Ink' : 'Hue ' + h}
            onClick={() => onChange(h)}
          ></button>
        ))}
      </div>
    );
  }
  function Seg({ options, value, onChange }) {
    return (
      <div className="seg">
        {options.map(([v, label]) => (
          <button key={String(v)} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>
        ))}
      </div>
    );
  }

  // ---------- picker overlay ----------
  function PickerOverlay({ picker, style, setStyle, pal, setPal, onInsert, onClose }) {
    useEffect(() => {
      const k = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', k);
      return () => window.removeEventListener('keydown', k);
    }, [onClose]);
    const loading = picker.phase === 'loading';
    const best = (picker.spec && picker.spec.best) || [];
    const cats = window.TYPE_CATEGORIES || [];
    const card = (t, i, badge) => (
      <button key={t + '-' + i} className="opt-card" onClick={() => onInsert(t)}>
        <div className="opt-head">
          <span className="opt-name">{window.DIAGRAMS[t].name}</span>
          {badge ? <span className="badge">{badge}</span> : null}
        </div>
        <div className="opt-preview">
          <window.Diagram visual={{ id: 'pv-' + t, type: t, spec: picker.spec, style, palette: pal }} />
        </div>
      </button>
    );
    return (
      <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="modal picker" data-screen-label="Visual picker">
          <div className="picker-head">
            <div>
              <div className="modal-title">Choose a visual</div>
              <div className="modal-sub">“{picker.text.slice(0, 110)}{picker.text.length > 110 ? '…' : ''}”</div>
            </div>
            <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div className="picker-controls">
            <StyleChips value={style} onChange={setStyle} />
            <PaletteRow value={pal} onChange={setPal} />
            <div className="spacer"></div>
            {!loading && picker.spec && !picker.spec._fallback ? <span className="ai-tag">✦ interpreted by Claude</span> : null}
            {!loading && picker.spec && picker.spec._fallback ? <span className="ai-tag dim">offline parse</span> : null}
          </div>
          {loading ? (
            <div className="picker-grid">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="opt-card shimmer">
                  <div className="shimmer-bar w60"></div>
                  <div className="shimmer-box"></div>
                </div>
              ))}
              <div className="loading-note">✦ Claude is reading your text<span className="dots"><span>.</span><span>.</span><span>.</span></span></div>
            </div>
          ) : (
            <div className="picker-scroll">
              {best.length ? (
                <div>
                  <div className="cat-label">✦ Best fits</div>
                  <div className="picker-grid tight">{best.map((t, i) => (window.DIAGRAMS[t] ? card(t, i, i === 0 ? 'AI pick' : null) : null))}</div>
                </div>
              ) : null}
              {cats.map((cat) => (
                <div key={cat.name}>
                  <div className="cat-label">{cat.name}</div>
                  <div className="picker-grid tight">
                    {cat.types.filter((t) => !best.includes(t) && window.DIAGRAMS[t]).map((t, i) => card(t, i, null))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- edit panel ----------
  function EditPanel({ visual, onChange, onClose, onExport, onDelete, onRegen, regenBusy, onPreview }) {
    const preview = onPreview || (() => {});
    const spec = visual.spec;
    const conn = visual.conn || {};
    const cats = window.TYPE_CATEGORIES || [];
    const setSpec = (patch) => onChange({ spec: { ...spec, ...patch } });
    const setConn = (patch) => onChange({ conn: { ...conn, ...patch } });
    const setItem = (i, patch) => {
      const items = spec.items.map((it, k) => (k === i ? { ...it, ...patch } : it));
      setSpec({ items });
    };
    const notes = visual.notes || [];
    const setNote = (id, patch) => onChange({ notes: notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
    const arrowsList = visual.arrows || [];
    const setArrow = (id, patch) => onChange({ arrows: arrowsList.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
    const addArrow = (kind) => onChange({ arrows: [...arrowsList, { id: 'a' + Math.random().toString(36).slice(2, 7), kind, x1: 470, y1: 46, x2: 614, y2: 106, color: 'ink', dash: false }] });
    const hasLayout = (visual.layout && Object.keys(visual.layout).length > 0);
    return (
      <aside className="panel" data-screen-label="Visual editor panel">
        <div className="panel-head">
          <span className="panel-title">Edit visual</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close panel">✕</button>
        </div>
        <div className="panel-body">
          <div className="drag-hint">Drag any shape, label, detail or value directly on the visual to reposition it. Arrows and lines drag by their endpoints.</div>
          <label className="fld-label">Type</label>
          {cats.map((cat) => (
            <div key={cat.name} className="cat-block">
              <div className="cat-mini">{cat.name}</div>
              <div className="type-grid">
                {cat.types.filter((t) => window.DIAGRAMS[t]).map((t) => (
                  <button key={t} className={'chip' + (visual.type === t ? ' on' : '')} onClick={() => onChange({ type: t, variant: null })}>{window.DIAGRAMS[t].name}</button>
                ))}
              </div>
            </div>
          ))}
          {((window.DIAGRAMS[visual.type] || {}).variants || []).length ? (
            <React.Fragment>
              <label className="fld-label">Layout <span className="fld-hint">hover to preview</span></label>
              <window.GlyphVariants.VariantGallery
                inline={true}
                visual={visual}
                onPick={(p) => onChange(p.type ? { type: p.type, variant: null } : { variant: p.variant })}
                onPreview={preview}
              />
            </React.Fragment>
          ) : null}
          <label className="fld-label">Style</label>
          <StyleChips value={visual.style} onChange={(s) => onChange({ style: s })} />
          <label className="fld-label">Color</label>
          <PaletteRow value={visual.palette || 0} onChange={(p) => onChange({ palette: p })} />
          <label className="fld-label">Backdrop</label>
          <Seg options={[['none', 'None'], ['tint', 'Tint'], ['rings', 'Rings'], ['dots', 'Dots']]} value={visual.backdrop || 'none'} onChange={(v) => onChange({ backdrop: v })} />
          <label className="fld-label">Connectors &amp; arrows</label>
          <div className="conn-rows">
            <Seg options={[['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']]} value={conn.line || 'solid'} onChange={(v) => setConn({ line: v })} />
            <Seg options={[['arrow', 'Arrow'], ['solid', 'Filled'], ['dot', 'Dot'], ['none', 'None']]} value={conn.head || 'arrow'} onChange={(v) => setConn({ head: v })} />
            <Seg options={[[0.6, 'Thin'], [1, 'Regular'], [1.7, 'Bold']]} value={conn.weight || 1} onChange={(v) => setConn({ weight: v })} />
          </div>
          <label className="fld-label">Title</label>
          <input className="fld" value={spec.title} onChange={(e) => setSpec({ title: e.target.value })} />
          <label className="fld-label">Items ({spec.items.length})</label>
          <div className="items-list">
            {spec.items.map((it, i) => (
              <div key={i} className="item-row">
                <div className="item-inputs">
                  <input className="fld" value={it.label} placeholder="Label" onChange={(e) => setItem(i, { label: e.target.value })} />
                  <div className="item-sub">
                    <input className="fld sm" value={it.detail || ''} placeholder="Detail (optional)" onChange={(e) => setItem(i, { detail: e.target.value || null })} />
                    <input className="fld sm val" value={it.value || ''} placeholder="Value" onChange={(e) => setItem(i, { value: e.target.value || null })} />
                  </div>
                  <div className="item-foot">
                    <IconPicker value={it.icon || null} onChange={(name) => setItem(i, { icon: name })} />
                    <ItemColorDots value={it.color == null ? null : it.color} onChange={(c) => setItem(i, { color: c })} />
                    <Seg options={[[0.85, 'S'], [1, 'M'], [1.2, 'L'], [1.45, 'XL']]} value={it.scale || 1} onChange={(v) => setItem(i, { scale: v })} />
                  </div>
                </div>
                <button className="icon-btn sm" disabled={spec.items.length <= 2} onClick={() => setSpec({ items: spec.items.filter((_, k) => k !== i) })} aria-label="Remove item">✕</button>
              </div>
            ))}
            <button className="ghost-btn" disabled={spec.items.length >= 16} onClick={() => setSpec({ items: [...spec.items, { label: 'New item', detail: null, value: null }] })}>+ Add item</button>
          </div>
          <label className="fld-label">Custom labels</label>
          <div className="items-list">
            {notes.map((n) => (
              <div key={n.id} className="item-row">
                <div className="item-inputs">
                  <input className="fld sm" value={n.text} onChange={(e) => setNote(n.id, { text: e.target.value })} />
                  <div className="note-ctl">
                    <ItemColorDots value={n.color == null ? 'ink' : n.color} onChange={(c) => setNote(n.id, { color: c === null ? 'ink' : c })} />
                    <Seg options={[[11, 'S'], [14, 'M'], [19, 'L']]} value={n.size || 14} onChange={(v) => setNote(n.id, { size: v })} />
                  </div>
                </div>
                <button className="icon-btn sm" onClick={() => onChange({ notes: notes.filter((x) => x.id !== n.id) })} aria-label="Remove label">✕</button>
              </div>
            ))}
            <button className="ghost-btn" onClick={() => onChange({ notes: [...notes, { id: 'n' + Math.random().toString(36).slice(2, 7), text: 'New label', x: 540, y: 46, size: 14, color: 'ink' }] })}>+ Add custom label</button>
          </div>
          <label className="fld-label">Arrows &amp; lines</label>
          <div className="items-list">
            {arrowsList.map((ar) => (
              <div key={ar.id} className="item-row">
                <div className="item-inputs">
                  <div className="note-ctl">
                    <span className="arrow-kind">{ar.kind === 'arrow' ? '→' : '—'}</span>
                    <ItemColorDots value={ar.color == null ? 'ink' : ar.color} onChange={(c) => setArrow(ar.id, { color: c === null ? 'ink' : c })} />
                    <Seg options={[['solid', 'Solid'], ['dash', 'Dashed']]} value={ar.dash ? 'dash' : 'solid'} onChange={(v) => setArrow(ar.id, { dash: v === 'dash' })} />
                  </div>
                </div>
                <button className="icon-btn sm" onClick={() => onChange({ arrows: arrowsList.filter((x) => x.id !== ar.id) })} aria-label="Remove arrow">✕</button>
              </div>
            ))}
            <div className="arrow-add-row">
              <button className="ghost-btn" onClick={() => addArrow('arrow')}>+ Add arrow</button>
              <button className="ghost-btn" onClick={() => addArrow('line')}>+ Add line</button>
            </div>
          </div>
          {hasLayout ? (
            <button className="ghost-btn reset-pos" onClick={() => onChange({ layout: {} })}>↺ Reset dragged positions</button>
          ) : null}
        </div>
        <div className="panel-foot">
          {visual.source ? (
            <button className="ghost-btn" onClick={onRegen} disabled={regenBusy}>{regenBusy ? '✦ Rethinking…' : '✦ Regenerate with AI'}</button>
          ) : null}
          <div className="panel-foot-row">
            <button className="primary-btn" onClick={onExport}>Export</button>
            <button className="danger-btn" onClick={onDelete}>Delete</button>
          </div>
        </div>
      </aside>
    );
  }

  // ---------- export modal ----------
  function ExportModal({ visual, onClose, toast }) {
    const wrapRef = useRef(null);
    const [transparent, setTransparent] = useState(false);
    useEffect(() => {
      const k = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', k);
      return () => window.removeEventListener('keydown', k);
    }, [onClose]);
    const getSvg = () => wrapRef.current && wrapRef.current.querySelector('svg');
    return (
      <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="modal export-modal" data-screen-label="Export visual">
          <div className="picker-head">
            <div>
              <div className="modal-title">Export visual</div>
              <div className="modal-sub">{visual.spec.title}</div>
            </div>
            <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div className={'export-preview' + (transparent ? ' checker' : '')} ref={wrapRef}>
            <window.Diagram visual={visual} />
          </div>
          <label className="bg-toggle">
            <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
            <span>Transparent background (no white fill)</span>
          </label>
          <div className="export-actions">
            <button className="primary-btn" onClick={() => { const s = getSvg(); if (s) { downloadPNG(s, fileName(visual), transparent); toast(transparent ? 'PNG (transparent) downloading…' : 'PNG downloading…'); } }}>Download PNG</button>
            <button className="secondary-btn" onClick={() => { const s = getSvg(); if (s) { downloadSVG(s, fileName(visual)); toast('SVG downloading…'); } }}>Download SVG</button>
            <button className="secondary-btn" onClick={() => {
              navigator.clipboard.writeText(visual.spec.title + '\n' + visual.spec.items.map((it, i) => `${i + 1}. ${it.label}${it.detail ? ' — ' + it.detail : ''}${it.value ? ' (' + it.value + ')' : ''}`).join('\n')).then(() => toast('Copied as text'));
            }}>Copy as text</button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- share modal ----------
  // Real share links: a server-issued token makes the doc publicly readable at
  // /share/<token>. Creating/revoking requires the doc:share permission.
  function ShareModal({ docTitle, onClose, toast }) {
    const doc = window.MW_DOC || {};
    const [token, setToken] = useState(doc.share_token || null);
    const [busy, setBusy] = useState(false);
    const [shares, setShares] = useState([]);
    const [email, setEmail] = useState('');
    const [emailBusy, setEmailBusy] = useState(false);
    useEffect(() => {
      const k = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', k);
      return () => window.removeEventListener('keydown', k);
    }, [onClose]);
    useEffect(() => {
      window.MarkwiseAPI.get('/api/docs/' + doc.id + '/shares').then(setShares).catch(() => {});
    }, [doc.id]);
    const url = token ? location.origin + '/share/' + token : null;
    const addEmail = async (e) => {
      if (e) e.preventDefault();
      const v = email.trim();
      if (!v) return;
      setEmailBusy(true);
      try {
        const row = await window.MarkwiseAPI.post('/api/docs/' + doc.id + '/shares', { email: v });
        setShares((s) => [row, ...s]);
        setEmail('');
        toast('Shared with ' + row.email);
      } catch (err) { toast(err.message || 'Could not share'); }
      setEmailBusy(false);
    };
    const removeEmail = async (s) => {
      try {
        await window.MarkwiseAPI.del('/api/docs/' + doc.id + '/shares/' + s.id);
        setShares((cur) => cur.filter((x) => x.id !== s.id));
        toast('Removed ' + s.email);
      } catch (err) { toast(err.message || 'Could not remove'); }
    };
    const create = async () => {
      setBusy(true);
      try {
        const out = await window.MarkwiseAPI.post('/api/docs/' + doc.id + '/share');
        setToken(out.share_token);
        window.MW_DOC.share_token = out.share_token;
        toast('Share link created');
      } catch (e) { toast(e.message || 'Could not create the link'); }
      setBusy(false);
    };
    const revoke = async () => {
      setBusy(true);
      try {
        await window.MarkwiseAPI.del('/api/docs/' + doc.id + '/share');
        setToken(null);
        window.MW_DOC.share_token = null;
        toast('Share link revoked');
      } catch (e) { toast(e.message || 'Could not revoke the link'); }
      setBusy(false);
    };
    return (
      <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="modal share-modal" data-screen-label="Share document">
          <div className="picker-head">
            <div>
              <div className="modal-title">Share “{docTitle}”</div>
              <div className="modal-sub">{token ? 'Anyone with the link can view this document and its visuals. Revoke it to cut off access.' : 'Create a link that lets anyone view a read-only copy of this document.'}</div>
            </div>
            <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
          {token ? (
            <div className="share-row">
              <input className="fld" readOnly value={url} onFocus={(e) => e.target.select()} />
              <button className="primary-btn" onClick={() => navigator.clipboard.writeText(url).then(() => toast('Link copied'))}>Copy link</button>
              <button className="secondary-btn" disabled={busy} onClick={revoke}>Revoke</button>
            </div>
          ) : (
            <div className="share-row">
              <button className="primary-btn" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create share link'}</button>
            </div>
          )}
          <div className="share-divider"></div>
          <div className="share-people">
            <div className="modal-sub" style={{ marginBottom: 8 }}>Or invite specific people to view — they’ll need to sign in with that email.</div>
            <form className="share-row" onSubmit={addEmail}>
              <input className="fld" type="email" placeholder="name@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="secondary-btn" type="submit" disabled={emailBusy || !email.trim()}>{emailBusy ? 'Adding…' : 'Invite'}</button>
            </form>
            {shares.length ? (
              <ul className="share-list">
                {shares.map((s) => (
                  <li key={s.id}>
                    <span className="share-email">{s.email}</span>
                    <span className="share-can">can view</span>
                    <button className="icon-btn del" title="Remove access" onClick={() => removeEmail(s)}>✕</button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="share-note">Individual visuals can be exported as PNG or SVG from their Edit panel.</div>
        </div>
      </div>
    );
  }

  window.GlyphPanels = { PickerOverlay, EditPanel, ExportModal, ShareModal };
})();
