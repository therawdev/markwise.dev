/* Markwise account SPA — company (org) page */
(function () {
  const { useState, useEffect, useRef } = React;

  // Permission groups mirror org.html's PERM_GROUPS (API key strings)
  const PERM_GROUPS = [
    { label: 'Documents & AI', keys: ['doc:view', 'doc:create', 'doc:edit', 'doc:delete', 'doc:export', 'doc:share', 'ai:generate'] },
    { label: 'Team',           keys: ['org:manage_members', 'org:manage_roles'] },
    { label: 'Company',        keys: ['org:settings', 'org:billing'] },
  ];

  function parsePerms(raw) {
    if (!raw) return [];
    if (typeof raw === 'string') { try { return JSON.parse(raw); } catch (_) { return []; } }
    return raw;
  }

  function permLabel(key, catalog) {
    const p = (catalog || []).find((x) => x.key === key);
    return p ? p.label : key;
  }

  function inviteStatus(inv) {
    if (inv.used_by) return { state: 'used', label: 'Used', by: inv.used_by_email || 'unknown' };
    const left = new Date(inv.expires_at) - Date.now();
    if (left <= 0) return { state: 'expired', label: 'Expired' };
    const h = Math.floor(left / 3600000);
    const t = h >= 48 ? Math.round(h / 24) + ' days'
      : h >= 1 ? h + ' hour' + (h === 1 ? '' : 's')
      : Math.max(1, Math.floor(left / 60000)) + ' min';
    return { state: 'active', label: 'Active', expires: t };
  }

  // ===== ROLE MATRIX =====
  function MWRoleMatrix({ canRoles, org, catalog, onApply, onDeleteCustom }) {
    const roles = org.roles || [];
    const members = org.members || [];
    const customRoles = roles.filter((r) => !r.is_system);

    const buildDraft = () => {
      const d = {};
      roles.forEach((r) => { d['r-' + r.id] = parsePerms(r.permissions).slice(); });
      return d;
    };

    const sig = JSON.stringify(roles.map((r) => [r.id, r.name, parsePerms(r.permissions)]));
    const [draft, setDraft] = useState(buildDraft);
    const [newCols, setNewCols] = useState([]);
    const [error, setError] = useState(null);
    useEffect(() => { setDraft(buildDraft()); setNewCols([]); setError(null); }, [sig]);

    const countFor = (name) => members.filter((m) => m.role === name).length;

    const ownerRole = roles.find((r) => r.name === 'Owner');
    const userRole  = roles.find((r) => r.name === 'User');
    const cols = [
      { key: 'r-' + (ownerRole ? ownerRole.id : 0), name: 'Owner', locked: true,  isDefault: true,  id: ownerRole ? ownerRole.id : null, count: countFor('Owner') },
      { key: 'r-' + (userRole  ? userRole.id  : 0), name: 'User',  locked: false, isDefault: true,  id: userRole  ? userRole.id  : null, count: countFor('User')  },
      ...customRoles.map((r) => ({ key: 'r-' + r.id, name: r.name, locked: false, isDefault: false, id: r.id, count: countFor(r.name) })),
    ];
    const span = 1 + cols.length + newCols.length + (canRoles ? 1 : 0);

    const dirty = newCols.length > 0 || roles.some((r) => {
      const orig = parsePerms(r.permissions).slice().sort().join('|');
      const cur  = (draft['r-' + r.id] || []).slice().sort().join('|');
      return orig !== cur;
    });

    const toggle = (key, perm) => {
      setError(null);
      setDraft((d) => {
        const cur = d[key] || [];
        return { ...d, [key]: cur.includes(perm) ? cur.filter((x) => x !== perm) : [...cur, perm] };
      });
    };
    const toggleNew = (i, perm) => {
      setError(null);
      setNewCols((cs) => cs.map((c, j) => j !== i ? c : {
        ...c, perms: c.perms.includes(perm) ? c.perms.filter((x) => x !== perm) : [...c.perms, perm],
      }));
    };

    const discard = () => { setDraft(buildDraft()); setNewCols([]); setError(null); };
    const save = async () => {
      const roleNames = roles.map((r) => r.name.toLowerCase());
      for (const nc of newCols) {
        if (!nc.name.trim()) { setError('Give every new role a name.'); return; }
        if (roleNames.includes(nc.name.trim().toLowerCase())) { setError('A role named "' + nc.name.trim() + '" already exists.'); return; }
        if (nc.perms.length === 0) { setError('Role "' + nc.name.trim() + '" needs at least one permission.'); return; }
        roleNames.push(nc.name.trim().toLowerCase());
      }
      const err = await onApply({ draft, newCols });
      if (err) setError(err);
    };

    return (
      <div className="card">
        <div className="role-matrix">
          <table>
            <thead>
              <tr>
                <th className="rm-perm-head">Permission</th>
                {cols.map((c) => (
                  <th key={c.key} className="rm-role-head">
                    <span className="rm-role-name">{c.name}</span>
                    <span className={'pill sm ' + (c.isDefault ? 'grey' : 'blue')}>{c.isDefault ? 'Default' : 'Custom'}</span>
                    <span className="rm-count">{c.count} {c.count === 1 ? 'member' : 'members'}</span>
                    {!c.isDefault && canRoles ? (
                      <button className="rm-del" onClick={() => onDeleteCustom(c.id, c.name)}>Delete</button>
                    ) : null}
                  </th>
                ))}
                {newCols.map((c, i) => (
                  <th key={'new-' + i} className="rm-role-head new">
                    <input className="fld rm-name" placeholder="Role name" value={c.name} autoFocus
                      onChange={(e) => { setError(null); setNewCols((cs) => cs.map((x, j) => j !== i ? x : { ...x, name: e.target.value })); }} />
                    <span className="pill sm blue">New</span>
                    <button className="rm-del" onClick={() => setNewCols((cs) => cs.filter((_, j) => j !== i))}>Remove</button>
                  </th>
                ))}
                {canRoles ? (
                  <th className="rm-add-cell">
                    <button className="rm-add" onClick={() => setNewCols((cs) => [...cs, { name: '', perms: ['doc:view'] }])}>+ New role</button>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {PERM_GROUPS.map((g) => (
                <React.Fragment key={g.label}>
                  <tr className="rm-group"><td colSpan={span}>{g.label}</td></tr>
                  {g.keys.map((pkey) => (
                    <tr key={pkey}>
                      <td className="rm-perm">{permLabel(pkey, catalog)}</td>
                      {cols.map((c) => (
                        <td key={c.key} className="rm-cell">
                          {c.locked
                            ? <span className="rm-check" title="Owner always holds every permission">&#10003;</span>
                            : <input type="checkbox" checked={(draft[c.key] || []).includes(pkey)} disabled={!canRoles}
                                onChange={() => toggle(c.key, pkey)} />}
                        </td>
                      ))}
                      {newCols.map((nc, i) => (
                        <td key={'new-' + i} className="rm-cell">
                          <input type="checkbox" checked={nc.perms.includes(pkey)} onChange={() => toggleNew(i, pkey)} />
                        </td>
                      ))}
                      {canRoles ? <td className="rm-cell pad-col"></td> : null}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {error ? <div className="rm-bar error">{error}</div> : null}
        {dirty && canRoles ? (
          <div className="rm-bar">
            <span>You have unsaved role changes.</span>
            <span className="row-actions">
              <button className="ghost-btn sm" onClick={discard}>Discard</button>
              <button className="primary-btn sm" onClick={save}>Save changes</button>
            </span>
          </div>
        ) : null}
        <div className="rm-foot">
          The Owner role always holds every permission.
          {canRoles
            ? ' Editing a role applies instantly to every member who has it.'
            : ' Ask an owner to change roles — your role can’t edit them.'}
        </div>
      </div>
    );
  }

  // ===== ORG PAGE =====
  function MWOrgPage({ ctx, companyId }) {
    const { me, reload, navigate, toast } = ctx;
    const API = window.MarkwiseAPI;

    const [org, setOrg] = useState(null);
    const [catalog, setCatalog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadErr, setLoadErr] = useState(null);
    const [tab, setTab] = useState('members');
    const [invites, setInvites] = useState([]);
    const [inviteRoleId, setInviteRoleId] = useState(null);
    const [coName, setCoName] = useState('');
    const [usage, setUsage] = useState(null); // this company's AI usage

    const load = () => {
      setLoading(true); setLoadErr(null);
      Promise.all([
        API.get('/api/orgs/' + companyId),
        API.get('/api/orgs/permissions'),
      ]).then(([o, perms]) => {
        setOrg(o);
        setCatalog(perms);
        setCoName(o.name);
        const roles = o.roles || [];
        const defaultRole = roles.find((r) => r.name === 'User') || roles[0];
        if (defaultRole) setInviteRoleId(defaultRole.id);
        setLoading(false);
      }).catch((e) => {
        setLoadErr(e.message || 'Failed to load company.');
        setLoading(false);
      });
    };

    useEffect(() => { load(); setTab('members'); }, [companyId]);

    const loadInvites = () => {
      API.get('/api/orgs/' + companyId + '/invites').then(setInvites).catch(() => {});
    };
    useEffect(() => { if (org && tab === 'members') loadInvites(); }, [org, tab]);
    useEffect(() => { if (org && tab === 'usage') API.get('/api/orgs/' + companyId + '/ai-usage').then(setUsage).catch(() => {}); }, [org, tab]);

    if (loading) {
      return (
        <div className="page">
          <MWTopbar ctx={ctx} back={true} />
          <main className="wrap"><div className="card empty-note">Loading…</div></main>
        </div>
      );
    }

    if (loadErr || !org) {
      return (
        <div className="page">
          <MWTopbar ctx={ctx} back={true} />
          <main className="wrap narrow">
            <div className="card empty-note">{loadErr || "This company doesn’t exist or you don’t have access to it."}</div>
          </main>
        </div>
      );
    }

    const mine = (me.memberships || []).find((m) => m.company_id === companyId);
    if (!mine && !me.is_app_owner) {
      return (
        <div className="page">
          <MWTopbar ctx={ctx} back={true} />
          <main className="wrap narrow">
            <div className="card empty-note">This company doesn&apos;t exist or you don&apos;t have access to it.</div>
          </main>
        </div>
      );
    }

    const myPermSet = new Set(me.is_app_owner
      ? catalog.map((p) => p.key)
      : (mine ? mine.permissions || [] : []));

    const canMembers  = myPermSet.has('org:manage_members');
    const canRoles    = myPermSet.has('org:manage_roles');
    const canSettings = myPermSet.has('org:settings');
    const canBilling  = myPermSet.has('org:billing');
    const roleChip    = me.is_app_owner ? 'App owner' : (mine ? mine.role : null);

    const members    = org.members || [];
    const roles      = org.roles   || [];
    const ownerCount = members.filter((m) => m.role === 'Owner').length;
    const roleNames  = roles.map((r) => r.name);

    const tabDefs = [
      { id: 'members',  label: 'Members',            count: members.length },
      { id: 'roles',    label: 'Roles & permissions', count: roles.length },
    ];
    if (canBilling)  tabDefs.push({ id: 'billing',  label: 'Billing' });
    tabDefs.push(    { id: 'usage',    label: 'AI usage' });
    tabDefs.push(    { id: 'activity', label: 'Activity' });
    if (canSettings) tabDefs.push({ id: 'settings', label: 'Settings' });

    // ---- member actions ----
    const setMemberRole = async (memberId, roleId, roleName) => {
      try {
        await API.put('/api/orgs/' + companyId + '/members/' + memberId, { role_id: roleId });
        setOrg((o) => ({ ...o, members: (o.members || []).map((m) => m.id === memberId ? { ...m, role: roleName } : m) }));
        toast('Role updated');
      } catch (e) { toast(e.message); }
    };

    const removeMember = async (member) => {
      const isMe = member.id === me.id;
      try {
        await API.del('/api/orgs/' + companyId + '/members/' + member.id);
        if (isMe) {
          toast('You left ' + org.name);
          reload();
          navigate('/docs');
        } else {
          toast('Removed ' + member.name);
          setOrg((o) => ({ ...o, members: (o.members || []).filter((m) => m.id !== member.id) }));
        }
      } catch (e) { toast(e.message); }
    };

    // ---- invite actions ----
    const generateInvite = async () => {
      if (!inviteRoleId) return;
      try {
        const inv = await API.post('/api/orgs/' + companyId + '/invites', { role_id: inviteRoleId });
        const url = location.origin + '/invite/' + inv.token;
        mwCopy(url, toast, 'Invite link copied to clipboard');
        loadInvites();
      } catch (e) { toast(e.message); }
    };

    const reinvite = async (inv) => {
      try {
        const newInv = await API.post('/api/orgs/' + companyId + '/invites', { role_id: inv.role_id });
        const url = location.origin + '/invite/' + newInv.token;
        mwCopy(url, toast, 'New invite link copied');
        loadInvites();
      } catch (e) { toast(e.message); }
    };

    const deleteInvite = async (iid) => {
      try {
        await API.del('/api/orgs/' + companyId + '/invites/' + iid);
        toast('Invite deleted');
        loadInvites();
      } catch (e) { toast(e.message); }
    };

    const copyInviteLink = (token) => {
      mwCopy(location.origin + '/invite/' + token, toast, 'Invite link copied');
    };

    // ---- role matrix actions ----
    const applyRoleChanges = async ({ draft, newCols }) => {
      const errors = [];
      // update existing non-Owner roles where permissions changed
      await Promise.all(
        roles.filter((r) => !(r.is_system && r.name === 'Owner')).map(async (r) => {
          const orig = parsePerms(r.permissions).slice().sort().join('|');
          const cur  = (draft['r-' + r.id] || []).slice().sort().join('|');
          if (orig !== cur) {
            try {
              await API.put('/api/orgs/' + companyId + '/roles/' + r.id, { permissions: draft['r-' + r.id] || [] });
            } catch (e) { errors.push(r.name + ': ' + e.message); }
          }
        })
      );
      // create new roles
      for (const nc of newCols) {
        try {
          await API.post('/api/orgs/' + companyId + '/roles', { name: nc.name.trim(), permissions: nc.perms });
        } catch (e) { errors.push(nc.name + ': ' + e.message); }
      }
      if (errors.length) return errors.join('; ');
      // reload org to get fresh roles
      try { const fresh = await API.get('/api/orgs/' + companyId); setOrg(fresh); } catch (_) {}
      toast('Roles updated');
      return null;
    };

    const deleteCustomRole = async (roleId, roleName) => {
      const inUse = members.some((m) => m.role === roleName);
      if (inUse) { toast('Reassign members using "' + roleName + '" first'); return; }
      try {
        await API.del('/api/orgs/' + companyId + '/roles/' + roleId);
        toast('Role deleted');
        setOrg((o) => ({ ...o, roles: (o.roles || []).filter((r) => r.id !== roleId) }));
      } catch (e) { toast(e.message); }
    };

    // ---- plan ----
    const setPlan = async (plan) => {
      if (org.plan === plan) return;
      try {
        await API.put('/api/orgs/' + companyId + '/plan', { plan });
        setOrg((o) => ({ ...o, plan }));
        toast(plan === 'pro' ? 'Upgraded to Pro' : 'Downgraded to Free');
        reload();
      } catch (e) { toast(e.message); }
    };

    // ---- settings ----
    const saveOrgName = async () => {
      const nm = coName.trim();
      if (!nm || nm === org.name) return;
      try {
        await API.put('/api/orgs/' + companyId, { name: nm });
        setOrg((o) => ({ ...o, name: nm }));
        toast('Company renamed');
        reload();
      } catch (e) { toast(e.message); }
    };

    const deleteOrg = async () => {
      try {
        await API.del('/api/orgs/' + companyId);
        toast('Company deleted');
        reload();
        navigate('/docs');
      } catch (e) { toast(e.message); }
    };

    // ---- invite status cell ----
    const InviteStatusCell = ({ inv }) => {
      const st = inviteStatus(inv);
      if (st.state === 'used') return <span><MWPill tone="grey">Used</MWPill> <span className="dim sm-note">by {st.by}</span></span>;
      if (st.state === 'expired') return <MWPill tone="amber">Expired</MWPill>;
      return <span><MWPill tone="green">Active</MWPill> <span className="dim sm-note">expires in {st.expires}</span></span>;
    };

    return (
      <div className="page">
        <MWTopbar ctx={ctx} back={true} />
        <main className="wrap">
          <div className="page-head">
            <MWAvatar name={org.name} size={40} />
            <h1 className="page-title">{org.name}</h1>
            {roleChip ? <MWPill tone="blue">{roleChip}</MWPill> : null}
            <MWPill tone={org.plan === 'pro' ? 'blue' : 'grey'}>{org.plan === 'pro' ? 'Pro' : 'Free'}</MWPill>
            {org.status === 'suspended' ? <MWPill tone="red">Suspended</MWPill> : null}
          </div>

          <MWTabs tabs={tabDefs} value={tab} onChange={setTab} />

          {/* ===== MEMBERS TAB ===== */}
          {tab === 'members' ? (
            <React.Fragment>
              <MWSection title="Members">
                <div className="card">
                  <table className="tbl">
                    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th className="num"></th></tr></thead>
                    <tbody>
                      {members.map((m) => {
                        const lastOwner = m.role === 'Owner' && ownerCount === 1;
                        const isMe = m.id === me.id;
                        return (
                          <tr key={m.id}>
                            <td>
                              <span className="member-cell">
                                <MWAvatar name={m.name} size={26} />
                                <b>{m.name}</b>{isMe ? <span className="dim"> (you)</span> : null}
                              </span>
                            </td>
                            <td className="dim">{m.email}</td>
                            <td>
                              {canMembers && !lastOwner ? (
                                <select className="fld sel" value={m.role}
                                  onChange={(e) => {
                                    const sel = e.target;
                                    const roleObj = roles.find((r) => r.name === sel.value);
                                    if (roleObj) setMemberRole(m.id, roleObj.id, roleObj.name);
                                  }}>
                                  {roleNames.map((r) => <option key={r} value={r}>{r}</option>)}
                                </select>
                              ) : <span>{m.role}</span>}
                            </td>
                            <td className="num">
                              {canMembers && !lastOwner ? (
                                <button className="danger-btn sm" onClick={() => removeMember(m)}>
                                  {isMe ? 'Leave' : 'Remove'}
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </MWSection>

              {canMembers ? (
                <MWSection
                  title="Invite a teammate"
                  sub="Generate a link and share it — whoever opens it joins this company."
                  actions={
                    <span className="invite-gen">
                      <select className="fld sel" value={inviteRoleId || ''}
                        onChange={(e) => setInviteRoleId(Number(e.target.value))}>
                        {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      <button className="primary-btn" onClick={generateInvite}>Generate invite link</button>
                    </span>
                  }
                >
                  <div className="card">
                    {invites.length === 0 ? (
                      <div className="empty-note">No invite links yet. Generate one and share it with a teammate.</div>
                    ) : (
                      <table className="tbl">
                        <thead><tr><th>Role</th><th>Status</th><th>Created</th><th className="num"></th></tr></thead>
                        <tbody>
                          {invites.map((inv) => {
                            const st = inviteStatus(inv);
                            return (
                              <tr key={inv.id}>
                                <td><b>{inv.role}</b></td>
                                <td><InviteStatusCell inv={inv} /></td>
                                <td className="dim">
                                  {mwFmtDate(inv.created_at)}
                                  {inv.created_by_email ? ' · ' + inv.created_by_email : ''}
                                </td>
                                <td className="num">
                                  <span className="row-actions">
                                    {st.state === 'active' ? (
                                      <button className="ghost-btn sm" onClick={() => copyInviteLink(inv.token)}>Copy link</button>
                                    ) : (
                                      <button className="ghost-btn sm" onClick={() => reinvite(inv)}>Reinvite</button>
                                    )}
                                    <button className="danger-btn sm" onClick={() => deleteInvite(inv.id)}>Delete</button>
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </MWSection>
              ) : null}
            </React.Fragment>
          ) : null}

          {/* ===== ROLES TAB ===== */}
          {tab === 'roles' ? (
            <MWSection
              title="Roles &amp; permissions"
              sub="Default roles (Owner, User) are built in. Add columns for custom roles with exactly the permissions you want."
            >
              <MWRoleMatrix
                canRoles={canRoles}
                org={org}
                catalog={catalog}
                onApply={applyRoleChanges}
                onDeleteCustom={deleteCustomRole}
              />
            </MWSection>
          ) : null}

          {/* ===== BILLING TAB ===== */}
          {tab === 'billing' && canBilling ? (
            <MWBillingTab companyId={companyId} org={org} setPlan={setPlan} />
          ) : null}

          {/* ===== AI USAGE TAB ===== */}
          {tab === 'usage' ? (
            <MWSection title="AI usage" sub="This company's AI requests, tokens & estimated cost.">
              <MWUsage usage={usage} />
            </MWSection>
          ) : null}

          {/* ===== ACTIVITY TAB ===== */}
          {tab === 'activity' ? (
            <MWActivityTab companyId={companyId} orgName={org.name} />
          ) : null}

          {/* ===== SETTINGS TAB ===== */}
          {tab === 'settings' && canSettings ? (
            <MWSection title="Company settings">
              <div className="card pad">
                <label className="fld-label">Company name</label>
                <div className="inline-form">
                  <input className="fld" value={coName} onChange={(e) => setCoName(e.target.value)} />
                  <button className="secondary-btn"
                    disabled={!coName.trim() || coName.trim() === org.name}
                    onClick={saveOrgName}>Save</button>
                </div>
                <div className="danger-zone">
                  <div>
                    <b>Delete this company</b>
                    <p>Members lose access. Company documents move to personal space.</p>
                  </div>
                  <MWConfirmDelete label="Delete company" onConfirm={deleteOrg} />
                </div>
              </div>
            </MWSection>
          ) : null}
        </main>
      </div>
    );
  }

  // ===== BILLING TAB (lazy-loads usage) =====
  function MWBillingTab({ companyId, org, setPlan }) {
    const [usage, setUsage] = useState(null);
    const API = window.MarkwiseAPI;
    useEffect(() => {
      API.get('/api/orgs/' + companyId + '/usage').then(setUsage).catch(() => setUsage({ docs: 0, ai_month: 0 }));
    }, [companyId]);

    const plan     = org.plan || 'free';
    const docLimit = plan === 'pro' ? Infinity : 3;
    const aiLimit  = plan === 'pro' ? Infinity : 100;
    const meterPct = (used, limit) => limit === Infinity ? Math.min(100, Math.round(used / 5)) : Math.min(100, Math.round(used / limit * 100));
    const meterWarn = (used, limit) => limit !== Infinity && used >= limit;

    return (
      <React.Fragment>
        <MWSection title="Usage" sub="Counts for this company. AI visual limit resets on the 1st of every month.">
          {usage ? (
            <div className="usage-grid">
              <div className="card usage-card">
                <div className="usage-top"><span>Documents</span><span>{usage.docs} / {docLimit === Infinity ? 'Unlimited' : docLimit}</span></div>
                <div className={'meter' + (meterWarn(usage.docs, docLimit) ? ' warn' : '')}>
                  <i style={{ width: meterPct(usage.docs, docLimit) + '%' }}></i>
                </div>
              </div>
              <div className="card usage-card">
                <div className="usage-top"><span>AI visuals this month</span><span>{usage.ai_month} / {aiLimit === Infinity ? 'Unlimited' : aiLimit}</span></div>
                <div className={'meter' + (meterWarn(usage.ai_month, aiLimit) ? ' warn' : '')}>
                  <i style={{ width: meterPct(usage.ai_month, aiLimit) + '%' }}></i>
                </div>
              </div>
            </div>
          ) : <div className="empty-note">Loading…</div>}
        </MWSection>

        <MWSection title="Plan">
          <div className="plan-cards">
            <div className={'plan-card' + (plan === 'free' ? ' on' : '')}>
              <div className="plan-name">Free {plan === 'free' ? <MWPill tone="blue">Current plan</MWPill> : null}</div>
              <div className="plan-price">$0 <small>/ month</small></div>
              <ul className="plan-feats">
                <li>3 documents</li>
                <li>100 AI visuals / month</li>
                <li>Unlimited members</li>
              </ul>
              {plan !== 'free' ? <button className="secondary-btn" onClick={() => setPlan('free')}>Downgrade to Free</button> : null}
            </div>
            <div className={'plan-card' + (plan === 'pro' ? ' on' : '')}>
              <div className="plan-name">Pro {plan === 'pro' ? <MWPill tone="blue">Current plan</MWPill> : null}</div>
              <div className="plan-price">$12 <small>/ month</small></div>
              <ul className="plan-feats">
                <li>Unlimited documents</li>
                <li>Unlimited AI visuals</li>
                <li>Priority generation queue</li>
              </ul>
              {plan !== 'pro' ? <button className="primary-btn" onClick={() => setPlan('pro')}>Upgrade to Pro</button> : null}
            </div>
          </div>
        </MWSection>

        <MWSection title="Invoices">
          <div className="card">
            <div className="empty-note">No invoices yet — they appear here after your first paid month.</div>
          </div>
        </MWSection>
      </React.Fragment>
    );
  }

  // ===== ACTIVITY TAB (lazy-loads audit log) =====
  function MWActivityTab({ companyId, orgName }) {
    const [logs, setLogs] = useState(null);
    const [err, setErr] = useState(null);
    const API = window.MarkwiseAPI;
    useEffect(() => {
      API.get('/api/orgs/' + companyId + '/activity')
        .then(setLogs)
        .catch((e) => setErr(e.message || 'Failed to load activity.'));
    }, [companyId]);

    return (
      <MWSection title="Activity" sub={'Everything that happened in ' + orgName + ', newest first.'}>
        <div className="card audit-scroll">
          {!logs && !err ? <div className="empty-note">Loading…</div> : null}
          {err ? <div className="empty-note">{err}</div> : null}
          {logs && logs.length === 0 ? <div className="empty-note">No activity yet.</div> : null}
          {logs && logs.length > 0 ? (
            <table className="tbl audit">
              <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Details</th></tr></thead>
              <tbody>
                {logs.map((e, i) => (
                  <tr key={e.id || i}>
                    <td className="dim nowrap">{mwFmtWhen(e.created_at)}</td>
                    <td className="nowrap">{e.actor_email || '—'}</td>
                    <td><span className="mono-chip">{e.action}</span></td>
                    <td className="dim">{mwDetail(e.detail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </MWSection>
    );
  }

  Object.assign(window, { MWOrgPage, MWRoleMatrix });
})();
