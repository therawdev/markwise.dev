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
      ]).then(([s, u, co, al, ud, pf]) => {
        setStats(s);
        setUsers(u);
        setCompanies(co);
        setAuditLogs(al);
        setUsageDaily(ud);
        setPlatform(pf);
        setLoading(false);
      }).catch((e) => {
        toast(e.message || 'Failed to load admin data');
        setLoading(false);
      });
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    const refetchStats = () => API.get('/api/admin/stats').then(setStats).catch(() => {});
    const refetchUsers = () => API.get('/api/admin/users').then(setUsers).catch(() => {});
    const refetchCompanies = () => API.get('/api/admin/companies').then(setCompanies).catch(() => {});

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
                    <p>Enabling also requires ANTHROPIC_API_KEY set on the server.</p>
                  </div>
                  <MWSwitch on={claudeEnabled} onChange={() => toggleClaudeSdk(claudeEnabled)} />
                </div>
              </div>
            </MWSection>
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
