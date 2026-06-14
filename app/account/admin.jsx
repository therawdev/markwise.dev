/* Markwise account SPA — application owner (admin) panel */
(function () {
  const { useState, useEffect, useCallback } = React;

  function MWAdminChart({ usageDaily }) {
    const days = Array.from({ length: 14 }, (_, i) => {
      const dt = new Date(Date.now() - (13 - i) * 864e5);
      const key = dt.toISOString().slice(0, 10);
      const label = dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
      return { key, label, n: 0 };
    });
    (usageDaily || []).forEach((row) => {
      const dayStr = String(row.day || '').slice(0, 10);
      const d = days.find((d) => d.key === dayStr);
      if (d) d.n = row.n || 0;
    });
    const max = Math.max(1, ...days.map((d) => d.n));
    const total = days.reduce((s, d) => s + d.n, 0);
    return (
      <div className="card chart-card">
        <div className="chart-head">
          <b>AI calls — last 14 days</b>
          <span className="dim">{total} total</span>
        </div>
        <div className="chart">
          {days.map((d, i) => (
            <div key={i} className="col" title={d.label + ' · ' + d.n + ' calls'}>
              <i style={{ height: Math.max(4, Math.round(d.n / max * 100)) + '%' }}></i>
              <span>{i % 3 === 0 ? d.label : ''}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function MWAdminPage({ ctx }) {
    const { me, navigate, toast } = ctx;

    if (!me || !me.is_app_owner) return null;

    const [tab, setTab] = useState('overview');
    const [stats, setStats] = useState(null);
    const [users, setUsers] = useState([]);
    const [companies, setCompanies] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [usageDaily, setUsageDaily] = useState([]);
    const [platform, setPlatform] = useState({ allow_signups: true, maintenance: false });
    const [loading, setLoading] = useState(true);

    // provider config (keys/models stored in DB)
    const [provData, setProvData] = useState(null); // { secretsConfigured, providers: [...] }
    const [keyDrafts, setKeyDrafts] = useState({});  // provider id -> new key being typed
    const [modelDrafts, setModelDrafts] = useState({}); // provider id -> model being typed
    const [provBusy, setProvBusy] = useState('');    // provider id mid save/test
    const [provTest, setProvTest] = useState({});    // provider id -> { ok, reason|sample }

    // AI request log
    const [aiReqs, setAiReqs] = useState(null);      // { total, rows }
    const [reqStatus, setReqStatus] = useState('');  // '' | 'ok' | 'error'
    const [aiReqDetail, setAiReqDetail] = useState(null); // full row in the viewer
    const [usage, setUsage] = useState(null); // global AI usage summary

    // monthly AI quotas
    const [quotas, setQuotas] = useState(null);      // { free_monthly, pro_monthly, user_monthly }
    const [quotaDraft, setQuotaDraft] = useState(null);
    const [quotaBusy, setQuotaBusy] = useState(false);

    const [userQ, setUserQ] = useState('');
    const [coQ, setCoQ] = useState('');
    const [newCo, setNewCo] = useState('');
    const [filter, setFilter] = useState('');

    const API = window.MarkwiseAPI;

    const loadAll = useCallback(() => {
      return Promise.all([
        API.get('/api/admin/stats'),
        API.get('/api/admin/users'),
        API.get('/api/admin/companies'),
        API.get('/api/admin/audit?limit=500'),
        API.get('/api/admin/ai-usage-daily'),
        API.get('/api/admin/platform'),
        API.get('/api/admin/providers'),
      ]).then(([s, u, co, al, ud, pf, pv]) => {
        setStats(s);
        setUsers(u);
        setCompanies(co);
        setAuditLogs(al);
        setUsageDaily(ud);
        setPlatform(pf);
        setProvData(pv);
        setLoading(false);
      }).catch((e) => {
        toast(e.message || 'Failed to load admin data');
        setLoading(false);
      });
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    // Lazy-load AI log / usage / quotas only when their tab is open.
    useEffect(() => {
      if (tab === 'ailogs') API.get('/api/admin/ai-requests' + (reqStatus ? '?status=' + reqStatus : '')).then(setAiReqs).catch(() => {});
      if (tab === 'usage') API.get('/api/admin/ai-usage').then(setUsage).catch(() => {});
      if (tab === 'quotas') API.get('/api/admin/quotas').then((q) => { setQuotas(q); setQuotaDraft(q); }).catch(() => {});
    }, [tab, reqStatus]);

    const saveQuotas = async () => {
      setQuotaBusy(true);
      try {
        const saved = await API.put('/api/admin/quotas', quotaDraft);
        setQuotas(saved); setQuotaDraft(saved);
        toast('Quotas saved');
      } catch (e) { toast(e.message); } finally { setQuotaBusy(false); }
    };
    const openReq = (id) => API.get('/api/admin/ai-requests/' + id).then(setAiReqDetail).catch((e) => toast(e.message));

    const refetchStats = () => API.get('/api/admin/stats').then(setStats).catch(() => {});
    const refetchUsers = () => API.get('/api/admin/users').then(setUsers).catch(() => {});
    const refetchCompanies = () => API.get('/api/admin/companies').then(setCompanies).catch(() => {});
    const refetchProviders = () => API.get('/api/admin/providers').then(setProvData).catch(() => {});

    // ---- AI provider ----
    const setProvider = async (p) => {
      if (!p.ok || p.active) return;
      try {
        await API.put('/api/admin/ai-provider', { provider: p.id });
        toast('AI provider set to ' + (p.label || p.id));
        await refetchStats();
      } catch (e) { toast(e.message); }
    };

    const toggleClaudeSdk = async (currentEnabled) => {
      const next = !currentEnabled;
      try {
        await API.put('/api/admin/claude-enabled', { enabled: next });
        toast(next ? 'Claude SDK enabled' : 'Claude SDK disabled');
        await refetchStats();
      } catch (e) { toast(e.message); }
    };

    // ---- provider key/model config (stored encrypted in the DB) ----
    const saveProvider = async (id, patch) => {
      setProvBusy(id);
      try {
        await API.put('/api/admin/providers/' + id, patch);
        if (patch.apiKey !== undefined) setKeyDrafts((d) => ({ ...d, [id]: '' }));
        toast('Saved ' + id);
        await Promise.all([refetchProviders(), refetchStats()]);
      } catch (e) { toast(e.message); } finally { setProvBusy(''); }
    };
    const testProvider = async (id) => {
      setProvBusy(id);
      setProvTest((t) => ({ ...t, [id]: undefined }));
      try {
        const r = await API.post('/api/admin/providers/' + id + '/test', {});
        setProvTest((t) => ({ ...t, [id]: r }));
      } catch (e) { setProvTest((t) => ({ ...t, [id]: { ok: false, reason: e.message } })); }
      finally { setProvBusy(''); }
    };

    // ---- users ----
    const impersonate = async (u) => {
      try {
        await API.post('/api/admin/impersonate/' + u.id, {});
        await ctx.reload();
        navigate('/docs');
      } catch (e) { toast(e.message); }
    };

    const toggleUserStatus = async (u) => {
      const target = u.status === 'active' ? 'suspended' : 'active';
      try {
        await API.put('/api/admin/users/' + u.id + '/status', { status: target });
        toast((target === 'suspended' ? 'Suspended ' : 'Activated ') + u.email);
        await Promise.all([refetchUsers(), refetchStats()]);
      } catch (e) { toast(e.message); }
    };

    // ---- companies ----
    const createCompany = async () => {
      const nm = newCo.trim();
      if (!nm) return;
      try {
        await API.post('/api/orgs', { name: nm });
        toast('Company "' + nm + '" created');
        setNewCo('');
        await Promise.all([refetchCompanies(), refetchStats()]);
      } catch (e) { toast(e.message); }
    };

    const toggleCompanyStatus = async (c) => {
      const target = c.status === 'active' ? 'suspended' : 'active';
      try {
        await API.put('/api/admin/companies/' + c.id + '/status', { status: target });
        toast((target === 'suspended' ? 'Suspended ' : 'Activated ') + c.name);
        await Promise.all([refetchCompanies(), refetchStats()]);
      } catch (e) { toast(e.message); }
    };

    // ---- platform ----
    const togglePlatformFlag = async (key, onMsg, offMsg) => {
      const cur = platform[key];
      const next = !cur;
      try {
        await API.put('/api/admin/platform', { [key]: next });
        setPlatform((p) => ({ ...p, [key]: next }));
        toast(next ? onMsg : offMsg);
      } catch (e) { toast(e.message); }
    };

    // ---- audit CSV export ----
    const exportCsv = () => {
      const f = filter.trim().toLowerCase();
      const rows = f
        ? auditLogs.filter((e) =>
            (String(e.actor_email || '') + ' ' + e.action + ' ' + String(e.target || '') + ' ' + JSON.stringify(e.detail || '')).toLowerCase().includes(f)
          )
        : auditLogs;
      const q2 = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const csvRows = [['When', 'Actor', 'Action', 'Target', 'Details'].map(q2).join(',')]
        .concat(rows.map((e) => [
          mwFmtWhen(e.created_at),
          e.actor_email || '',
          e.action,
          e.target || '',
          typeof e.detail === 'object' ? JSON.stringify(e.detail || '') : (e.detail || ''),
        ].map(q2).join(',')));
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'markwise-audit-log.csv';
      a.click();
      toast('Audit log exported as CSV');
    };

    // ---- derived state ----
    const uq = userQ.trim().toLowerCase();
    const filteredUsers = uq ? users.filter((u) => (u.name + ' ' + u.email).toLowerCase().includes(uq)) : users;

    const cq = coQ.trim().toLowerCase();
    const filteredCompanies = cq ? companies.filter((c) => c.name.toLowerCase().includes(cq)) : companies;

    const af = filter.trim().toLowerCase();
    const filteredAudit = af
      ? auditLogs.filter((e) =>
          (String(e.actor_email || '') + ' ' + e.action + ' ' + String(e.target || '') + ' ' + JSON.stringify(e.detail || '')).toLowerCase().includes(af)
        )
      : auditLogs;

    const providers = (stats && stats.ai && stats.ai.providers) ? stats.ai.providers : [];
    const claudeRow = providers.find((p) => p.id === 'claude');
    const claudeEnabled = claudeRow ? claudeRow.ok : false;

    const statCards = stats ? [
      { n: stats.users || 0, label: stats.users === 1 ? 'User' : 'Users' },
      { n: stats.companies || 0, label: stats.companies === 1 ? 'Company' : 'Companies' },
      { n: stats.documents || 0, label: stats.documents === 1 ? 'Document' : 'Documents' },
      { n: stats.ai_calls || 0, label: 'AI calls' },
    ] : [];

    const tabs = [
      { id: 'overview', label: 'Overview' },
      { id: 'ai', label: 'AI provider' },
      { id: 'usage', label: 'AI usage' },
      { id: 'quotas', label: 'Quotas' },
      { id: 'ailogs', label: 'AI logs' },
      { id: 'users', label: 'Users', count: users.length },
      { id: 'companies', label: 'Companies', count: companies.length },
      { id: 'platform', label: 'Platform' },
      { id: 'audit', label: 'Audit log', count: auditLogs.length },
    ];

    return (
      <div className="page">
        <MWTopbar ctx={ctx} back={true} />
        <main className="wrap">
          <div className="page-head">
            <h1 className="page-title">Application owner panel</h1>
          </div>

          <MWTabs tabs={tabs} value={tab} onChange={setTab} />

          {loading ? (
            <div className="state" style={{ textAlign: 'center', padding: '60px 0', color: 'var(--grey)' }}>Loading…</div>
          ) : null}

          {!loading && tab === 'overview' ? (
            <React.Fragment>
              <div className="stat-grid">
                {statCards.map((s) => (
                  <div className="card stat-card" key={s.label}>
                    <div className="stat-num">{s.n}</div>
                    <div className="stat-label">{s.label}</div>
                  </div>
                ))}
              </div>

              <MWSection title="Usage">
                <MWAdminChart usageDaily={usageDaily} />
              </MWSection>

              <MWSection
                title="Latest activity"
                actions={
                  <button className="ghost-btn sm" onClick={() => setTab('audit')}>Open audit log</button>
                }
              >
                <div className="card">
                  <table className="tbl audit">
                    <tbody>
                      {auditLogs.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="empty-note" style={{ textAlign: 'left' }}>No activity yet.</td>
                        </tr>
                      ) : auditLogs.slice(0, 6).map((e, i) => (
                        <tr key={i}>
                          <td className="dim nowrap">{mwFmtWhen(e.created_at)}</td>
                          <td className="nowrap">{e.actor_email || '—'}</td>
                          <td><span className="mono-chip">{e.action}</span></td>
                          <td className="dim">{mwDetail(e.detail)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </MWSection>
            </React.Fragment>
          ) : null}

          {!loading && tab === 'ai' ? (
            <MWSection title="AI provider" sub="Which engine generates visuals for every workspace.">
              <div className="prov-list">
                {providers.map((p) => {
                  const on = p.active;
                  const disabled = !p.ok;
                  return (
                    <button
                      key={p.id}
                      className={'prov-row' + (on ? ' on' : '') + (disabled ? ' off' : '')}
                      onClick={() => setProvider(p)}
                      disabled={disabled}
                    >
                      <span className={'radio' + (on ? ' on' : '')}></span>
                      <span className="prov-text">
                        <b>{p.label || p.id}</b>
                        {p.reason ? <small>{p.reason}</small> : null}
                      </span>
                      {on ? <MWPill tone="green">Active</MWPill> : null}
                      {disabled ? <MWPill tone="grey">Unavailable</MWPill> : null}
                    </button>
                  );
                })}
                <div className="enable-box">
                  <div>
                    <b>Enable Claude SDK / Claude API</b>
                    <p>Enabling also requires an Anthropic API key (below or via env).</p>
                  </div>
                  <MWSwitch on={claudeEnabled} onChange={() => toggleClaudeSdk(claudeEnabled)} />
                </div>
              </div>

              {provData ? (
                <div style={{ marginTop: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                    <b>Provider keys &amp; models</b>
                    <small style={{ color: provData.secretsConfigured ? '#7a756c' : '#b4462f' }}>
                      {provData.secretsConfigured ? 'Stored AES-256-GCM encrypted in the database.' : 'SECRETS_KEY not set on the server — keys can’t be stored yet.'}
                    </small>
                  </div>
                  {provData.providers.map((c) => {
                    const label = (providers.find((p) => p.id === c.provider) || {}).label || c.provider;
                    const busy = provBusy === c.provider;
                    const tr = provTest[c.provider];
                    const modelVal = modelDrafts[c.provider] !== undefined ? modelDrafts[c.provider] : (c.model || '');
                    return (
                      <div key={c.provider} className="card" style={{ padding: '12px 14px', marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <b>{label}</b>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <small style={{ color: '#7a756c' }}>{c.enabled ? 'enabled' : 'disabled'}</small>
                            <MWSwitch on={c.enabled} onChange={() => saveProvider(c.provider, { enabled: !c.enabled })} />
                          </span>
                        </div>
                        {c.needsKey ? (
                          <div style={{ marginBottom: 8 }}>
                            <label style={{ fontSize: 11, color: '#7a756c', display: 'block', marginBottom: 3 }}>
                              API key — {c.hasKey ? `set (${c.keyMasked}, source: ${c.keySource})` : `none (source: ${c.keySource})`}
                            </label>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input className="fld" type="password" style={{ flex: 1 }}
                                placeholder={c.hasKey ? 'Enter a new key to replace' : 'Paste API key'}
                                value={keyDrafts[c.provider] || ''}
                                onChange={(e) => setKeyDrafts((d) => ({ ...d, [c.provider]: e.target.value }))}
                                disabled={!provData.secretsConfigured} />
                              <button className="btn sm" disabled={busy || !keyDrafts[c.provider]} onClick={() => saveProvider(c.provider, { apiKey: keyDrafts[c.provider] })}>Save key</button>
                              {c.hasKey && c.keySource !== 'env' ? (
                                <button className="btn sm ghost" disabled={busy} onClick={() => saveProvider(c.provider, { apiKey: '' })}>Clear</button>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: '#7a756c', marginBottom: 8 }}>CLI-based — no API key needed.</div>
                        )}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input className="fld" style={{ flex: 1 }} placeholder="model (default if blank)" value={modelVal}
                            onChange={(e) => setModelDrafts((d) => ({ ...d, [c.provider]: e.target.value }))} />
                          <button className="btn sm" disabled={busy} onClick={() => saveProvider(c.provider, { model: modelVal })}>Save model</button>
                          <button className="btn sm ghost" disabled={busy} onClick={() => testProvider(c.provider)}>{busy ? 'Testing…' : 'Test'}</button>
                        </div>
                        {tr ? (
                          <small style={{ display: 'block', marginTop: 6, color: tr.ok ? '#2f8a4e' : '#b4462f' }}>
                            {tr.ok ? '✓ ' + (tr.sample || 'OK') : '✗ ' + (tr.reason || 'failed')}
                          </small>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </MWSection>
          ) : null}

          {!loading && tab === 'usage' ? (
            <MWSection title="AI usage" sub="Requests, tokens & estimated cost across the whole platform.">
              <MWUsage usage={usage} />
            </MWSection>
          ) : null}

          {!loading && tab === 'quotas' ? (
            <MWSection
              title="Monthly AI quotas"
              sub="Hard limit on successful AI generations per calendar month. 0 = unlimited. App owners are always exempt. This is on top of the per-minute burst rate limit."
            >
              {!quotaDraft ? (
                <div className="card empty-note">Loading…</div>
              ) : (
                <div className="card pad">
                  {[
                    ['free_monthly', 'Companies on the Free plan', 'Per company, per month'],
                    ['pro_monthly', 'Companies on the Pro plan', 'Per company, per month'],
                    ['user_monthly', 'Individual users', 'Personal (non-company) usage, per month'],
                  ].map(([key, label, hint]) => (
                    <div className="set-row" key={key}>
                      <div>
                        <b>{label}</b>
                        <p>{hint}{Number(quotaDraft[key]) <= 0 ? ' — currently unlimited' : ''}</p>
                      </div>
                      <input
                        className="fld" type="number" min="0" style={{ width: 120 }}
                        value={quotaDraft[key]}
                        onChange={(e) => setQuotaDraft((d) => ({ ...d, [key]: e.target.value === '' ? '' : Math.max(0, Math.floor(Number(e.target.value))) }))}
                      />
                    </div>
                  ))}
                  <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="primary-btn" disabled={quotaBusy} onClick={saveQuotas}>{quotaBusy ? 'Saving…' : 'Save quotas'}</button>
                  </div>
                </div>
              )}
            </MWSection>
          ) : null}

          {!loading && tab === 'ailogs' ? (
            <MWSection
              title="AI request log"
              sub="Every AI call — prompt, response, provider & model — for review."
              actions={
                <select className="fld sel" value={reqStatus} onChange={(e) => setReqStatus(e.target.value)}>
                  <option value="">All</option>
                  <option value="ok">Succeeded</option>
                  <option value="error">Errors</option>
                </select>
              }
            >
              <div className="card">
                {!aiReqs ? (
                  <div className="empty-note">Loading…</div>
                ) : aiReqs.rows.length === 0 ? (
                  <div className="empty-note">No AI requests logged yet.</div>
                ) : (
                  <table className="tbl">
                    <thead>
                      <tr><th>Time</th><th>User</th><th>Provider</th><th>Model</th><th>Status</th><th>ms</th><th>Prompt</th></tr>
                    </thead>
                    <tbody>
                      {aiReqs.rows.map((r) => (
                        <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => openReq(r.id)}>
                          <td>{new Date(r.created_at).toLocaleString()}</td>
                          <td>{r.user_email || '—'}</td>
                          <td>{r.provider}{r.failover ? ' ↩' : ''}</td>
                          <td>{r.model || '—'}</td>
                          <td><b style={{ color: r.status === 'ok' ? '#2f8a4e' : '#b4462f' }}>{r.status}</b></td>
                          <td>{r.latency_ms != null ? r.latency_ms : '—'}</td>
                          <td style={{ color: '#7a756c', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.error || r.prompt_preview || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {aiReqs && aiReqs.total > aiReqs.rows.length ? (
                  <div className="empty-note">Showing {aiReqs.rows.length} of {aiReqs.total}.</div>
                ) : null}
              </div>
            </MWSection>
          ) : null}

          {aiReqDetail ? (
            <div onClick={() => setAiReqDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,15,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760, width: '100%', maxHeight: '86vh', overflow: 'auto', padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                  <b>AI request #{aiReqDetail.id}</b>
                  <button className="btn sm ghost" onClick={() => setAiReqDetail(null)}>Close</button>
                </div>
                <div style={{ fontSize: 12, color: '#7a756c', marginBottom: 12 }}>
                  {new Date(aiReqDetail.created_at).toLocaleString()} · {aiReqDetail.provider}{aiReqDetail.model ? ' / ' + aiReqDetail.model : ''} · {aiReqDetail.status}{aiReqDetail.latency_ms != null ? ' · ' + aiReqDetail.latency_ms + 'ms' : ''}{aiReqDetail.user_email ? ' · ' + aiReqDetail.user_email : ''}
                </div>
                {aiReqDetail.error ? <div style={{ color: '#b4462f', marginBottom: 12 }}>{aiReqDetail.error}</div> : null}
                <label style={{ fontSize: 11, fontWeight: 700, color: '#7a756c' }}>PROMPT</label>
                <pre style={{ whiteSpace: 'pre-wrap', background: '#faf8f4', border: '1px solid #eee', borderRadius: 8, padding: 10, fontSize: 12, margin: '4px 0 12px' }}>{aiReqDetail.prompt || ''}</pre>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#7a756c' }}>RESPONSE</label>
                <pre style={{ whiteSpace: 'pre-wrap', background: '#faf8f4', border: '1px solid #eee', borderRadius: 8, padding: 10, fontSize: 12, margin: '4px 0 0' }}>{aiReqDetail.response || '(none)'}</pre>
              </div>
            </div>
          ) : null}

          {!loading && tab === 'users' ? (
            <MWSection
              title="Users"
              actions={
                <input
                  className="fld sel wide"
                  value={userQ}
                  placeholder="Search users…"
                  onChange={(e) => setUserQ(e.target.value)}
                />
              }
            >
              <div className="card">
                {filteredUsers.length === 0 ? (
                  <div className="empty-note">No users match "{userQ}".</div>
                ) : (
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th className="num"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u) => (
                        <tr key={u.id}>
                          <td className="dim">{u.id}</td>
                          <td>
                            <span className="member-cell">
                              <MWAvatar name={u.name} size={26} />
                              <b>{u.name}</b>
                              {u.id === me.id ? <span className="dim"> (you)</span> : null}
                            </span>
                          </td>
                          <td className="dim">{u.email}</td>
                          <td>{u.is_app_owner ? 'App owner' : 'User'}</td>
                          <td>
                            <MWPill tone={u.status === 'active' ? 'green' : 'red'}>
                              {u.status === 'active' ? 'Active' : 'Suspended'}
                            </MWPill>
                          </td>
                          <td className="num">
                            {u.is_app_owner ? null : (
                              <span className="row-actions">
                                {u.status === 'active' ? (
                                  <button className="ghost-btn sm" onClick={() => impersonate(u)}>Sign in as</button>
                                ) : null}
                                {u.status === 'active' ? (
                                  <button className="danger-btn sm" onClick={() => toggleUserStatus(u)}>Suspend</button>
                                ) : (
                                  <button className="ghost-btn sm" onClick={() => toggleUserStatus(u)}>Activate</button>
                                )}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </MWSection>
          ) : null}

          {!loading && tab === 'companies' ? (
            <MWSection
              title="Companies"
              actions={
                <span className="invite-gen">
                  <input
                    className="fld sel"
                    value={coQ}
                    placeholder="Search…"
                    onChange={(e) => setCoQ(e.target.value)}
                  />
                  <input
                    className="fld sel wide"
                    value={newCo}
                    placeholder="New company name"
                    onChange={(e) => setNewCo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') createCompany(); }}
                  />
                  <button
                    className="secondary-btn"
                    onClick={createCompany}
                    disabled={!newCo.trim()}
                  >
                    Create company
                  </button>
                </span>
              }
            >
              <div className="card">
                {filteredCompanies.length === 0 ? (
                  <div className="empty-note">No companies match "{coQ}".</div>
                ) : (
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Plan</th>
                        <th>Members</th>
                        <th>Status</th>
                        <th className="num"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCompanies.map((c) => (
                        <tr key={c.id}>
                          <td className="dim">{c.id}</td>
                          <td>
                            <a className="member-cell as-link" href={'/org/' + c.id} style={{ gap: 10 }}>
                              <MWAvatar name={c.name} size={26} />
                              <b>{c.name}</b>
                            </a>
                          </td>
                          <td>{c.plan || 'free'}</td>
                          <td>{c.member_count || 0}</td>
                          <td>
                            <MWPill tone={c.status === 'active' ? 'green' : 'red'}>
                              {c.status === 'active' ? 'Active' : 'Suspended'}
                            </MWPill>
                          </td>
                          <td className="num">
                            <span className="row-actions">
                              <a className="ghost-btn sm as-link" href={'/org/' + c.id}>Settings</a>
                              {c.status === 'active' ? (
                                <button className="danger-btn sm" onClick={() => toggleCompanyStatus(c)}>Suspend</button>
                              ) : (
                                <button className="ghost-btn sm" onClick={() => toggleCompanyStatus(c)}>Activate</button>
                              )}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </MWSection>
          ) : null}

          {!loading && tab === 'platform' ? (
            <MWSection title="Platform settings" sub="Global switches that apply to every user and company.">
              <div className="card pad">
                <div className="set-row">
                  <div>
                    <b>Allow public signups</b>
                    <p>When off, new accounts can only be created through invite links.</p>
                  </div>
                  <MWSwitch
                    on={platform.allow_signups !== false}
                    onChange={() => togglePlatformFlag(
                      'allow_signups',
                      'Public signups enabled',
                      'Public signups disabled'
                    )}
                  />
                </div>
                <div className="set-row">
                  <div>
                    <b>Maintenance mode</b>
                    <p>Shows a banner to every non-admin user while you make changes.</p>
                  </div>
                  <MWSwitch
                    on={!!platform.maintenance}
                    onChange={() => togglePlatformFlag(
                      'maintenance',
                      'Maintenance mode on',
                      'Maintenance mode off'
                    )}
                  />
                </div>
              </div>
            </MWSection>
          ) : null}

          {!loading && tab === 'audit' ? (
            <MWSection
              title="Audit log"
              sub={filteredAudit.length + ' of ' + auditLogs.length + ' events'}
              actions={
                <span className="invite-gen">
                  <input
                    className="fld sel wide"
                    value={filter}
                    placeholder="Filter events…"
                    onChange={(e) => setFilter(e.target.value)}
                  />
                  <button className="secondary-btn" onClick={exportCsv}>Export CSV</button>
                </span>
              }
            >
              <div className="card audit-scroll">
                <table className="tbl audit">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Target</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAudit.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="dim" style={{ padding: '14px 16px' }}>
                          No events match "{filter}".
                        </td>
                      </tr>
                    ) : filteredAudit.map((e, i) => (
                      <tr key={i}>
                        <td className="dim nowrap">{mwFmtWhen(e.created_at)}</td>
                        <td className="nowrap">{e.actor_email || '—'}</td>
                        <td><span className="mono-chip">{e.action}</span></td>
                        <td className="dim nowrap">{e.target || ''}</td>
                        <td className="dim">{mwDetail(e.detail)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </MWSection>
          ) : null}
        </main>
      </div>
    );
  }

  Object.assign(window, { MWAdminPage, MWAdminChart });
})();
