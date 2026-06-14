/* Markwise account SPA — shared React UI (real-API backed). Exposes components on window. */
(function () {
  const { useState, useEffect, useRef } = React;

  function mwHueFor(s) {
    let h = 0;
    for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) % 360;
    return h;
  }
  function mwAgo(ts) {
    const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60);
    if (h < 24) return h + ' h ago';
    const dd = Math.round(h / 24);
    return dd + (dd === 1 ? ' day ago' : ' days ago');
  }
  function mwFmtDate(ts) { return new Date(ts).toLocaleDateString('en-GB'); }
  function mwFmtWhen(ts) { return new Date(ts).toLocaleString(); }

  function mwCopy(text, toast, msg) {
    const done = () => toast && toast(msg || 'Copied to clipboard');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => { fallback(); done(); });
    } else { fallback(); done(); }
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    }
  }

  // render an audit detail (string-JSON or object) as "k: v · k: v"
  function mwDetail(d) {
    if (d == null) return '';
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return d; } }
    if (typeof d !== 'object') return String(d);
    return Object.entries(d).map(([k, v]) => k + ': ' + String(v)).join(' · ');
  }

  function MWAvatar({ name, size }) {
    const sz = size || 28;
    const initials = String(name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    return (
      <span className="av" style={{ width: sz, height: sz, fontSize: Math.round(sz * 0.4), background: 'oklch(0.52 0.11 ' + mwHueFor(name || 'x') + ')' }}>
        {initials}
      </span>
    );
  }

  function MWPill({ tone, children }) { return <span className={'pill ' + (tone || 'grey')}>{children}</span>; }

  function MWSwitch({ on, onChange, disabled }) {
    return (
      <button className={'switch' + (on ? ' on' : '')} disabled={disabled} role="switch" aria-checked={on} onClick={onChange}>
        <span className="knob"></span>
      </button>
    );
  }

  function MWSection({ title, sub, children, actions }) {
    return (
      <section className="sec">
        <div className="sec-head">
          <div className="sec-head-text">
            <h2 className="sec-title">{title}</h2>
            {sub ? <p className="sec-sub">{sub}</p> : null}
          </div>
          {actions ? <div className="sec-actions">{actions}</div> : null}
        </div>
        {children}
      </section>
    );
  }

  function MWTabs({ tabs, value, onChange }) {
    return (
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={value === t.id ? 'on' : ''} onClick={() => onChange(t.id)}>
            {t.label}
            {t.count != null ? <span className="count">{t.count}</span> : null}
          </button>
        ))}
      </div>
    );
  }

  function MWConfirmDelete({ label, onConfirm, className }) {
    const [arm, setArm] = useState(false);
    useEffect(() => {
      if (!arm) return;
      const t = setTimeout(() => setArm(false), 4000);
      return () => clearTimeout(t);
    }, [arm]);
    return arm
      ? <button className={'danger-btn solid ' + (className || '')} onClick={onConfirm}>Click again to confirm</button>
      : <button className={'danger-btn ' + (className || '')} onClick={() => setArm(true)}>{label}</button>;
  }

  const MW_ACTION_LABELS = {
    'invite.create': 'generated an invite link', 'invite.delete': 'deleted an invite link',
    'invite.accept': 'accepted an invite', 'user.signup': 'signed up',
    'member.remove': 'removed a member', 'member.restore': 'restored a member', 'member.role': 'changed a member’s role',
    'role.create': 'created a role', 'role.update': 'updated a role', 'role.delete': 'deleted a role',
    'doc.create': 'created a document', 'doc.update': 'renamed a document', 'doc.delete': 'deleted a document',
    'doc.restore': 'restored a document', 'doc.purge': 'permanently deleted a document', 'doc.share': 'shared a document',
    'doc.share_email': 'shared a document with you',
    'company.create': 'created a company', 'company.update': 'updated company settings', 'company.delete': 'deleted a company',
    'billing.update': 'changed the plan', 'admin.user_status': 'changed a user’s status',
    'admin.company_status': 'changed a company’s status', 'admin.ai_provider': 'switched the AI provider',
    'admin.platform': 'changed platform settings', 'admin.impersonate': 'signed in as a user',
    'user.update': 'updated their profile', 'user.password': 'changed their password',
    'user.apikey': 'managed an API key', 'user.delete': 'deleted their account',
  };

  // ---- notification bell ----
  function MWBell({ ctx }) {
    const { me } = ctx;
    const [open, setOpen] = useState(false);
    const [data, setData] = useState({ items: [], unread: 0 });
    const load = () => window.MarkwiseAPI.get('/api/auth/notifications').then(setData).catch(() => {});
    useEffect(() => { load(); }, []);
    useEffect(() => {
      if (!open) return;
      const close = () => setOpen(false);
      window.addEventListener('click', close);
      return () => window.removeEventListener('click', close);
    }, [open]);
    const toggle = () => {
      const next = !open;
      setOpen(next);
      if (next && data.unread > 0) {
        window.MarkwiseAPI.post('/api/auth/notifications/seen').then(() => setData((d) => ({ ...d, unread: 0 }))).catch(() => {});
      }
    };
    return (
      <div className="bell-wrap" onClick={(e) => e.stopPropagation()}>
        <button className="bell" title="Notifications" onClick={toggle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.7 21a2 2 0 0 1-3.4 0"></path>
          </svg>
          {data.unread > 0 ? <span className="bell-badge">{data.unread > 9 ? '9+' : data.unread}</span> : null}
        </button>
        {open ? (
          <div className="notif-menu">
            <div className="notif-head">Notifications</div>
            {data.items.length === 0 ? (
              <div className="notif-empty">Nothing yet — activity from your teams shows up here.</div>
            ) : data.items.slice(0, 10).map((e, i) => {
              const who = e.actor_email || 'someone';
              // pull a human noun out of the detail to make it read like a notification
              let d = e.detail;
              if (typeof d === 'string') { try { d = JSON.parse(d); } catch (x) { d = null; } }
              const noun = d && (d.doc || d.name || d.company || d.role);
              return (
                <div className="notif-item" key={e.id || i}>
                  <MWAvatar name={who.split('@')[0].replace(/[._]/g, ' ')} size={26} />
                  <span>
                    <b>{who}</b> {MW_ACTION_LABELS[e.action] || e.action}
                    {noun ? <span> “{noun}”</span> : null}
                    <span className="when"> · {mwFmtWhen(e.created_at)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  // ---- command palette (Ctrl+K) ----
  function MWPalette({ ctx }) {
    const { me, navigate } = ctx;
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [idx, setIdx] = useState(0);
    const [docs, setDocs] = useState([]);
    useEffect(() => {
      const onKey = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); setQ(''); setIdx(0); }
        else if (e.key === 'Escape') setOpen(false);
      };
      const onOpen = () => { setOpen(true); setQ(''); setIdx(0); };
      window.addEventListener('keydown', onKey);
      window.addEventListener('mw-palette', onOpen);
      return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mw-palette', onOpen); };
    }, []);
    useEffect(() => { if (open && !docs.length) window.MarkwiseAPI.get('/api/docs').then(setDocs).catch(() => {}); }, [open]);
    if (!open) return null;
    const items = [
      ...docs.map((d) => ({ kind: 'Document', label: d.title || 'Untitled document', go: () => { location.href = '/index.html?doc=' + d.id; } })),
      ...(me.memberships || []).map((m) => ({ kind: 'Company', label: m.company_name || ('Company ' + m.company_id), go: () => navigate('/org/' + m.company_id) })),
      { kind: 'Page', label: 'Documents', go: () => navigate('/docs') },
      { kind: 'Page', label: 'Account settings', go: () => navigate('/settings') },
      ...(me.is_app_owner ? [{ kind: 'Page', label: 'Admin panel', go: () => navigate('/admin') }] : []),
    ];
    const ql = q.trim().toLowerCase();
    const list = items.filter((i) => !ql || i.label.toLowerCase().indexOf(ql) !== -1).slice(0, 9);
    const sel = Math.min(idx, Math.max(0, list.length - 1));
    const pick = (item) => { setOpen(false); item.go(); };
    return (
      <div className="pal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
        <div className="pal-box">
          <input className="pal-input" autoFocus value={q} placeholder="Search documents, companies, pages…"
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, list.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter' && list[sel]) { e.preventDefault(); pick(list[sel]); }
            }} />
          <div className="pal-list">
            {list.length === 0 ? <div className="pal-empty">No matches for “{q}”.</div> : list.map((item, i) => (
              <button key={item.kind + item.label + i} className={'pal-item' + (i === sel ? ' on' : '')}
                onMouseEnter={() => setIdx(i)} onClick={() => pick(item)}>
                <span className="pal-kind">{item.kind}</span>
                <span className="pal-label">{item.label}</span>
                {i === sel ? <kbd>↵</kbd> : null}
              </button>
            ))}
          </div>
          <div className="pal-foot"><span>↑↓ navigate</span><span>↵ open</span><span>esc close</span></div>
        </div>
      </div>
    );
  }

  // ---- topbar ----
  function MWTopbar({ ctx, back }) {
    const { me, navigate, toast } = ctx;
    const [menu, setMenu] = useState(false);
    const [platform, setPlatform] = useState({ maintenance: false });
    useEffect(() => { window.MarkwiseAPI.get('/api/platform').then(setPlatform).catch(() => {}); }, []);
    useEffect(() => {
      if (!menu) return;
      const close = () => setMenu(false);
      window.addEventListener('click', close);
      return () => window.removeEventListener('click', close);
    }, [menu]);

    const stopImpersonating = () => {
      window.MarkwiseAPI.post('/api/admin/impersonate/stop')
        .then(() => ctx.reload().then(() => navigate('/admin')))
        .catch((e) => toast(e.message));
    };

    return (
      <React.Fragment>
        <header className="topbar">
          <a className="brand" href="/docs"><span className="brand-mark"></span><span className="brand-name">Markwise</span></a>
          {back ? <a className="back-link" href="/docs">← Documents</a> : null}
          <div className="topbar-right">
            <button className="pal-btn" title="Search (Ctrl+K)" onClick={() => window.dispatchEvent(new Event('mw-palette'))}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>
              <span>Search</span><kbd>Ctrl K</kbd>
            </button>
            {me.is_app_owner ? <a className="ghost-btn as-link" href="/admin">Admin panel</a> : null}
            <MWBell ctx={ctx} />
            <div className="avatar-wrap" onClick={(e) => e.stopPropagation()}>
              <button className="avatar-btn" title={me.email} onClick={() => setMenu((v) => !v)}>
                <MWAvatar name={me.name} size={30} />
              </button>
              {menu ? (
                <div className="avatar-menu">
                  <div className="menu-head">
                    <b>{me.name}</b><span>{me.email}</span>
                    {me.is_app_owner ? <span className="pill blue sm">App owner</span> : null}
                  </div>
                  {/* avatar-wrap stops propagation, so the document SPA interceptor never sees
                      these clicks — navigate explicitly to keep them client-side. */}
                  <a className="menu-item" href="/settings" onClick={(e) => { e.preventDefault(); setMenu(false); navigate('/settings'); }}>Account settings</a>
                  {me.is_app_owner ? <a className="menu-item" href="/admin" onClick={(e) => { e.preventDefault(); setMenu(false); navigate('/admin'); }}>Admin panel</a> : null}
                  {me.impersonated_by ? <button className="menu-item" onClick={() => { setMenu(false); stopImpersonating(); }}>Return to admin</button> : null}
                  <button className="menu-item signout" onClick={() => window.MarkwiseAPI.logout()}>Sign out</button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        {me.impersonated_by ? (
          <div className="impersonate-bar">
            <span>Viewing as <b>{me.email}</b> — actions are recorded as this user.</span>
            <button onClick={stopImpersonating}>Return to admin</button>
          </div>
        ) : null}
        {platform.maintenance && !me.is_app_owner ? (
          <div className="maint-bar">Markwise is in maintenance mode — some actions may be temporarily unavailable.</div>
        ) : null}
      </React.Fragment>
    );
  }

  // Shared AI-usage panel (admin global / company / individual scopes).
  function MWUsage({ usage }) {
    if (!usage) return <div className="card"><div className="empty-note">Loading…</div></div>;
    const t = usage.totals || {};
    const num = (n) => Number(n || 0).toLocaleString();
    const cards = [
      ['Requests', num(t.requests)],
      ['Success', t.requests ? Math.round((100 * t.ok) / t.requests) + '%' : '—'],
      ['Input tokens', num(t.input_tokens)],
      ['Output tokens', num(t.output_tokens)],
      ['Est. cost', '$' + Number(t.est_cost_usd || 0).toFixed(4)],
      ['Avg latency', (t.avg_latency_ms || 0) + 'ms'],
    ];
    return (
      <React.Fragment>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 14 }}>
          {cards.map(([k, v]) => (
            <div key={k} className="card" style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 10.5, color: '#7a756c', textTransform: 'uppercase', letterSpacing: '.5px' }}>{k}</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{v}</div>
            </div>
          ))}
        </div>
        {(usage.byProvider || []).length ? (
          <div className="card" style={{ marginBottom: 12 }}>
            <table className="tbl">
              <thead><tr><th>Provider</th><th>Requests</th><th>OK</th><th>Input tok</th><th>Output tok</th></tr></thead>
              <tbody>{usage.byProvider.map((p) => (
                <tr key={p.provider}><td>{p.provider}</td><td>{p.requests}</td><td>{p.ok}</td><td>{num(p.input_tokens)}</td><td>{num(p.output_tokens)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : null}
        {(usage.byModel || []).length ? (
          <div className="card">
            <table className="tbl">
              <thead><tr><th>Model</th><th>Requests</th><th>Input tok</th><th>Output tok</th><th>Est. cost</th></tr></thead>
              <tbody>{usage.byModel.map((m) => (
                <tr key={m.model}><td>{m.model}</td><td>{m.requests}</td><td>{num(m.input_tokens)}</td><td>{num(m.output_tokens)}</td><td>${Number(m.est_cost_usd || 0).toFixed(4)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : null}
      </React.Fragment>
    );
  }

  Object.assign(window, {
    MWTopbar, MWBell, MWPalette, MWPill, MWSection, MWTabs, MWSwitch, MWAvatar, MWConfirmDelete, MWUsage,
    mwHueFor, mwAgo, mwFmtDate, mwFmtWhen, mwCopy, mwDetail, MW_ACTION_LABELS,
  });
})();
