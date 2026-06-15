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
  function MWOrgPage({ ctx, companyId, tab: tabProp }) {
    const { me, reload, navigate, toast } = ctx;
    const API = window.MarkwiseAPI;

    const [org, setOrg] = useState(null);
    const [catalog, setCatalog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadErr, setLoadErr] = useState(null);
    // The active tab is URL-driven (/org/:id/:tab). Normalise common/odd segments
    // (e.g. the singular "member") to a real tab id; unknown → members.
    const ORG_TABS = ['members', 'roles', 'billing', 'usage', 'ai-keys', 'activity', 'settings'];
    const normTab = (t) => (t === 'member' ? 'members' : ORG_TABS.indexOf(t) !== -1 ? t : 'members');
    const [tab, setTab] = useState(normTab(tabProp || 'members'));
    const selectTab = (t) => { setTab(t); navigate('/org/' + companyId + '/' + t); };
    const [invites, setInvites] = useState([]);
    const [inviteRoleId, setInviteRoleId] = useState(null);
    const [coName, setCoName] = useState('');

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

    useEffect(() => { load(); }, [companyId]);
    // Keep the tab in sync with the URL (deep link, back/forward, company switch).
    useEffect(() => { setTab(normTab(tabProp || 'members')); }, [tabProp, companyId]);

    const loadInvites = () => {
      API.get('/api/orgs/' + companyId + '/invites').then(setInvites).catch(() => {});
    };
    useEffect(() => { if (org && tab === 'members') loadInvites(); }, [org, tab]);

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
    if (canSettings) tabDefs.push({ id: 'ai-keys',  label: 'AI keys' });
    if (canSettings) tabDefs.push({ id: 'sso',       label: 'Single sign-on' });
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

          <MWTabs tabs={tabDefs} value={tab} onChange={selectTab} />

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

          {/* ===== AI USAGE / CREDITS TAB ===== */}
          {tab === 'usage' ? (
            <MWOrgCredits companyId={companyId} canManage={canBilling || me.is_app_owner} isAppOwner={me.is_app_owner} toast={toast} />
          ) : null}

          {/* ===== AI KEYS TAB (bring-your-own provider keys) ===== */}
          {tab === 'ai-keys' && canSettings ? (
            <MWOrgProvidersTab companyId={companyId} toast={toast} />
          ) : null}

          {/* ===== SINGLE SIGN-ON TAB ===== */}
          {tab === 'sso' && canSettings ? (
            <MWOrgSsoTab companyId={companyId} roles={roles} toast={toast} />
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
    // The AI limit is the server-enforced monthly quota (0 = unlimited).
    const aiLimit  = usage && Number(usage.ai_limit) > 0 ? Number(usage.ai_limit) : Infinity;
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

  // ===== AI KEYS TAB — per-company bring-your-own provider keys =====
  // A company can store its own provider API key/model (encrypted); its members'
  // AI generations then run on it, falling back to the platform key when unset.
  function MWOrgProvidersTab({ companyId, toast }) {
    const API = window.MarkwiseAPI;
    const [data, setData] = useState(null);     // { secretsConfigured, providers: [...] }
    const [keyDrafts, setKeyDrafts] = useState({});
    const [modelDrafts, setModelDrafts] = useState({});
    const [busy, setBusy] = useState('');
    const [test, setTest] = useState({});

    const load = () => API.get('/api/orgs/' + companyId + '/providers').then(setData).catch((e) => toast(e.message));
    useEffect(() => { load(); }, [companyId]);

    const save = async (provider, patch) => {
      setBusy(provider);
      try {
        const r = await API.put('/api/orgs/' + companyId + '/providers/' + provider, patch);
        if (patch.apiKey !== undefined) setKeyDrafts((d) => ({ ...d, [provider]: '' }));
        setData(r);
        toast('Saved ' + provider);
      } catch (e) { toast(e.message); } finally { setBusy(''); }
    };
    const runTest = async (provider) => {
      setBusy(provider);
      setTest((t) => ({ ...t, [provider]: undefined }));
      try {
        const r = await API.post('/api/orgs/' + companyId + '/providers/' + provider + '/test', {});
        setTest((t) => ({ ...t, [provider]: r }));
      } catch (e) { setTest((t) => ({ ...t, [provider]: { ok: false, reason: e.message } })); }
      finally { setBusy(''); }
    };

    return (
      <MWSection
        title="AI provider keys"
        sub="Use your own provider API keys so AI generations bill to your account. When a provider has no key here, it falls back to the platform default."
      >
        {!data ? (
          <div className="card empty-note">Loading…</div>
        ) : !data.secretsConfigured ? (
          <div className="card empty-note">Key storage isn’t configured on the server yet. Ask the platform admin to set it up.</div>
        ) : (
          data.providers.map((c) => {
            const busyNow = busy === c.provider;
            const tr = test[c.provider];
            const modelVal = modelDrafts[c.provider] !== undefined ? modelDrafts[c.provider] : (c.model || '');
            const usingOwn = c.keySource === 'company';
            return (
              <div key={c.provider} className="card pad prov-key">
                <div className="prov-key-head">
                  <b>{mwProviderLabel(c.provider)}</b>
                  <MWPill tone={usingOwn ? 'green' : 'grey'}>{usingOwn ? 'Using your key' : (c.hasKey ? 'Using platform key' : 'No key')}</MWPill>
                </div>
                {c.needsKey ? (
                  <div className="prov-key-field">
                    <label className="fld-label">
                      API key — {usingOwn ? 'your key set (' + c.keyMasked + ')' : (c.hasKey ? 'falling back to the platform key' : 'none set')}
                    </label>
                    <div className="field-row">
                      <input className="fld" type="password"
                        placeholder={usingOwn ? 'Enter a new key to replace yours' : 'Paste your API key'}
                        value={keyDrafts[c.provider] || ''}
                        onChange={(e) => setKeyDrafts((d) => ({ ...d, [c.provider]: e.target.value }))} />
                      <button className="secondary-btn" disabled={busyNow || !keyDrafts[c.provider]} onClick={() => save(c.provider, { apiKey: keyDrafts[c.provider] })}>Save key</button>
                      {usingOwn ? (
                        <button className="ghost-btn" disabled={busyNow} onClick={() => save(c.provider, { apiKey: '' })}>Remove</button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="dim sm-note prov-key-field">CLI-based provider — no API key needed.</div>
                )}
                <div className="field-row">
                  <input className="fld" placeholder="model (platform default if blank)" value={modelVal}
                    onChange={(e) => setModelDrafts((d) => ({ ...d, [c.provider]: e.target.value }))} />
                  <button className="secondary-btn" disabled={busyNow} onClick={() => save(c.provider, { model: modelVal })}>Save model</button>
                  <button className="ghost-btn" disabled={busyNow} onClick={() => runTest(c.provider)}>{busyNow ? 'Testing…' : 'Test'}</button>
                </div>
                {tr ? (
                  <div className={'result-note ' + (tr.ok ? 'ok' : 'err')}>
                    {tr.ok ? '✓ ' + (tr.sample || 'OK') : '✗ ' + (tr.reason || 'failed')}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </MWSection>
    );
  }

  // ===== AI CREDITS TAB — company pool + per-member allocation =====
  // Members with org:billing (and the app owner) manage credits; everyone else
  // sees just their own bar. 1 credit = 1 successful AI generation; resets monthly.
  function MWOrgCredits({ companyId, canManage, isAppOwner, toast }) {
    const API = window.MarkwiseAPI;
    const [data, setData] = useState(null);   // billing/admin view
    const [mine, setMine] = useState(null);   // member view
    const [err, setErr] = useState('');
    const [drafts, setDrafts] = useState({}); // userId -> cap string
    const [busy, setBusy] = useState('');
    const [adminDraft, setAdminDraft] = useState({});

    const load = () => {
      setErr('');
      if (canManage) {
        API.get('/api/orgs/' + companyId + '/credits')
          .then((d) => { setData(d); setAdminDraft(d.admin ? { pool: d.admin.ai_credit_limit == null ? '' : String(d.admin.ai_credit_limit) } : {}); })
          .catch((e) => { setErr(e.message); toast(e.message); });
      } else {
        API.get('/api/orgs/' + companyId + '/my-credits').then(setMine).catch((e) => { setErr(e.message); toast(e.message); });
      }
    };
    useEffect(() => { load(); }, [companyId]);

    const saveMember = async (uid) => {
      const raw = drafts[uid];
      const limit = raw === '' || raw == null ? null : Math.max(0, Math.floor(Number(raw)));
      setBusy('m' + uid);
      try { await API.put('/api/orgs/' + companyId + '/members/' + uid + '/credits', { limit }); toast('Credits updated'); setDrafts((d) => { const n = { ...d }; delete n[uid]; return n; }); load(); }
      catch (e) { toast(e.message); } finally { setBusy(''); }
    };
    const saveBehavior = async (behavior) => {
      setBusy('beh');
      try { await API.put('/api/orgs/' + companyId + '/limit-behavior', { behavior }); toast('Saved'); load(); }
      catch (e) { toast(e.message); } finally { setBusy(''); }
    };
    const saveAdmin = async (patch) => {
      setBusy('admin');
      try { await API.put('/api/orgs/' + companyId + '/admin-credits', patch); toast('Saved'); load(); }
      catch (e) { toast(e.message); } finally { setBusy(''); }
    };

    // ---- member-only view ----
    if (!canManage) {
      return (
        <MWSection title="AI credits" sub="Each AI visual you generate uses one credit. Resets on the 1st.">
          {err ? <div className="card usage-card"><div className="dim sm-note">{err}</div></div> : <MWCreditBar status={mine} label="Your AI credits this month" />}
        </MWSection>
      );
    }

    if (!data) return <MWSection title="AI credits"><div className="card empty-note">{err || 'Loading…'}</div></MWSection>;

    return (
      <React.Fragment>
        <MWSection title="AI credits" sub="The company's monthly pool. 1 credit = 1 AI visual; resets on the 1st.">
          <MWCreditBar status={data.pool} label="Company credits this month" />
        </MWSection>

        <MWSection title="Member allocations" sub={'Each member gets ' + data.default_member_credits + ' credits/month by default. Set a custom cap, or 0 for unlimited.'}>
          <div className="card">
            <table className="tbl">
              <thead><tr><th>Member</th><th>Role</th><th className="num">Used</th><th>Monthly credits</th><th className="num">Left</th></tr></thead>
              <tbody>
                {data.members.map((m) => {
                  const draft = drafts[m.user_id];
                  const shown = draft !== undefined ? draft : (m.custom ? String(m.unlimited ? 0 : m.limit) : '');
                  return (
                    <tr key={m.user_id}>
                      <td><span className="member-cell"><MWAvatar name={m.name} size={24} /><b>{m.name}</b></span></td>
                      <td className="dim">{m.role}</td>
                      <td className="num">{m.used}</td>
                      <td>
                        <div className="field-row" style={{ maxWidth: 230 }}>
                          <input className="fld" type="number" min="0" placeholder={'default (' + data.default_member_credits + ')'}
                            value={shown} onChange={(e) => setDrafts((d) => ({ ...d, [m.user_id]: e.target.value }))} />
                          <button className="secondary-btn" disabled={busy === 'm' + m.user_id} onClick={() => saveMember(m.user_id)}>Save</button>
                        </div>
                      </td>
                      <td className="num">{m.unlimited ? <MWPill tone="grey">Unlimited</MWPill> : <span className="dim">{m.remaining}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="card-foot dim sm-note">Blank = the org default ({data.default_member_credits}). Enter a number for a custom cap, or 0 for unlimited. Members are still bounded by the company pool above.</div>
          </div>
        </MWSection>

        {data.behavior.can_org_set ? (
          <MWSection title="When a member runs out" sub="What happens once someone hits their credit limit.">
            <div className="card pad">
              <div className="field-row" style={{ flexWrap: 'wrap' }}>
                <button className={'chip' + (data.behavior.effective === 'block' ? ' on' : '')} disabled={busy === 'beh'} onClick={() => saveBehavior('block')}>Block &amp; tell them</button>
                <button className={'chip' + (data.behavior.effective === 'fallback' ? ' on' : '')} disabled={busy === 'beh'} onClick={() => saveBehavior('fallback')}>Silent offline fallback</button>
              </div>
            </div>
          </MWSection>
        ) : null}

        {isAppOwner && data.admin ? (
          <MWSection title="App-owner controls" sub="Top up the company pool, set the at-limit behaviour, and delegate that choice to the org owner. Visible to app owners only.">
            <div className="card pad">
              <label className="fld-label">Company credit pool ({data.admin.plan} plan)</label>
              <div className="field-row" style={{ maxWidth: 320 }}>
                <input className="fld" type="number" min="0" placeholder="blank = plan default"
                  value={adminDraft.pool != null ? adminDraft.pool : ''}
                  onChange={(e) => setAdminDraft((d) => ({ ...d, pool: e.target.value }))} />
                <button className="secondary-btn" disabled={busy === 'admin'} onClick={() => saveAdmin({ ai_credit_limit: adminDraft.pool === '' ? null : Math.max(0, Math.floor(Number(adminDraft.pool))) })}>Save pool</button>
              </div>
              <div className="dim sm-note" style={{ margin: '4px 0 0' }}>Blank = the plan default. 0 = unlimited. This is the org-wide ceiling across all members.</div>

              <label className="fld-label">At-limit behaviour</label>
              <div className="field-row" style={{ flexWrap: 'wrap' }}>
                <button className={'chip' + (data.admin.ai_limit_behavior === 'block' ? ' on' : '')} disabled={busy === 'admin'} onClick={() => saveAdmin({ ai_limit_behavior: 'block' })}>Block</button>
                <button className={'chip' + (data.admin.ai_limit_behavior === 'fallback' ? ' on' : '')} disabled={busy === 'admin'} onClick={() => saveAdmin({ ai_limit_behavior: 'fallback' })}>Fallback</button>
                <button className={'chip' + (data.admin.ai_limit_behavior == null ? ' on' : '')} disabled={busy === 'admin'} onClick={() => saveAdmin({ ai_limit_behavior: null })}>Use global default</button>
              </div>

              <div className="set-row" style={{ marginTop: 14 }}>
                <div>
                  <b>Let the org owner choose the behaviour</b>
                  <p>When on, a member with the billing permission can switch between block and fallback for this company.</p>
                </div>
                <MWSwitch on={!!data.admin.org_can_set_limit_behavior} disabled={busy === 'admin'} onChange={() => saveAdmin({ org_can_set_limit_behavior: !data.admin.org_can_set_limit_behavior })} />
              </div>
            </div>
          </MWSection>
        ) : null}
      </React.Fragment>
    );
  }

  // ===== SINGLE SIGN-ON TAB — per-company OIDC config =====
  function MWOrgSsoTab({ companyId, roles, toast }) {
    const API = window.MarkwiseAPI;
    const [data, setData] = useState(null);  // { secretsConfigured, callback_url, connection|null }
    const [form, setForm] = useState(null);  // editable draft
    const [secret, setSecret] = useState(''); // new secret (write-only)
    const [busy, setBusy] = useState(false);
    const [test, setTest] = useState(null);

    const hydrate = (d) => {
      const c = d.connection;
      setForm({
        issuer: c?.issuer || '',
        client_id: c?.client_id || '',
        allowed_domains: (c?.allowed_domains || []).join(', '),
        default_role_id: c?.default_role_id || '',
        enabled: c?.enabled || false,
      });
      setSecret('');
    };
    const load = () => API.get('/api/orgs/' + companyId + '/sso').then((d) => { setData(d); hydrate(d); }).catch((e) => toast(e.message));
    useEffect(() => { load(); }, [companyId]);

    const conn = data && data.connection;
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const runTest = async () => {
      setBusy(true); setTest(null);
      try {
        const r = await API.post('/api/orgs/' + companyId + '/sso/test', { issuer: (form.issuer || '').trim() });
        setTest(r);
      } catch (e) { setTest({ ok: false, reason: e.message }); } finally { setBusy(false); }
    };

    const save = async (overrides) => {
      const payload = {
        issuer: (form.issuer || '').trim(),
        client_id: (form.client_id || '').trim(),
        allowed_domains: (form.allowed_domains || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
        default_role_id: form.default_role_id ? Number(form.default_role_id) : null,
        enabled: form.enabled,
        ...overrides,
      };
      if (secret) payload.client_secret = secret;
      if (!payload.issuer || !payload.client_id) { toast('Issuer URL and client ID are required'); return; }
      setBusy(true);
      try {
        await API.put('/api/orgs/' + companyId + '/sso', payload);
        toast('Single sign-on saved');
        await load();
      } catch (e) { toast(e.message); } finally { setBusy(false); }
    };

    const remove = async () => {
      setBusy(true);
      try { await API.del('/api/orgs/' + companyId + '/sso'); toast('Single sign-on removed'); await load(); }
      catch (e) { toast(e.message); } finally { setBusy(false); }
    };

    if (!data || !form) return <MWSection title="Single sign-on"><div className="card empty-note">Loading…</div></MWSection>;

    return (
      <MWSection
        title="Single sign-on (OIDC)"
        sub="Let members sign in with your identity provider (Google Workspace, Microsoft Entra, Okta, or any OIDC provider). New users are provisioned on first login and added to this company."
      >
        {!data.secretsConfigured ? (
          <div className="card empty-note">Secret storage isn’t configured on the server yet — ask the platform admin to set it up before adding a client secret.</div>
        ) : null}

        <div className="card pad" style={{ marginBottom: 10 }}>
          <label className="fld-label">Redirect / callback URL — register this at your identity provider</label>
          <div className="inline-form">
            <input className="fld" style={{ flex: 1 }} readOnly value={data.callback_url} onFocus={(e) => e.target.select()} />
            <button className="ghost-btn" onClick={() => mwCopy(data.callback_url, toast, 'Callback URL copied')}>Copy</button>
          </div>
        </div>

        <div className="card pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <b>OIDC connection</b>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="dim sm-note">{form.enabled ? 'Enabled' : 'Disabled'}</span>
              <MWSwitch on={form.enabled} onChange={() => { const next = !form.enabled; set('enabled', next); if (conn) save({ enabled: next }); }} />
            </span>
          </div>

          <label className="fld-label">Issuer URL</label>
          <div className="inline-form">
            <input className="fld" style={{ flex: 1 }} placeholder="https://accounts.google.com" value={form.issuer}
              onChange={(e) => set('issuer', e.target.value)} />
            <button className="ghost-btn" disabled={busy || !form.issuer} onClick={runTest}>{busy ? 'Testing…' : 'Test discovery'}</button>
          </div>
          {test ? (
            <div className="sm-note" style={{ margin: '4px 0 8px', color: test.ok ? '#2f8a4e' : '#b4462f' }}>
              {test.ok ? '✓ Discovery OK — ' + test.authorization_endpoint : '✗ ' + (test.reason || 'failed')}
            </div>
          ) : null}

          <label className="fld-label">Client ID</label>
          <input className="fld" placeholder="client id from your IdP" value={form.client_id} onChange={(e) => set('client_id', e.target.value)} />

          <label className="fld-label">Client secret {conn && conn.has_secret ? '— set (leave blank to keep)' : ''}</label>
          <input className="fld" type="password" placeholder={conn && conn.has_secret ? '••••••••' : 'client secret (omit for PKCE-only public clients)'}
            value={secret} onChange={(e) => setSecret(e.target.value)} disabled={!data.secretsConfigured} />

          <label className="fld-label">Allowed email domains</label>
          <input className="fld" placeholder="acme.com, acme.io" value={form.allowed_domains} onChange={(e) => set('allowed_domains', e.target.value)} />
          <div className="dim sm-note" style={{ marginTop: 3 }}>Members with these email domains see “Single sign-on” on the login page.</div>

          <label className="fld-label" style={{ marginTop: 10 }}>Role for new members</label>
          <select className="fld sel" value={form.default_role_id || ''} onChange={(e) => set('default_role_id', e.target.value)}>
            <option value="">User (default)</option>
            {(roles || []).filter((r) => r.name !== 'Owner').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {conn ? <MWConfirmDelete label="Remove SSO" onConfirm={remove} /> : <span />}
            <button className="primary-btn" disabled={busy} onClick={() => save()}>{conn ? 'Save changes' : 'Save connection'}</button>
          </div>
        </div>
      </MWSection>
    );
  }

  Object.assign(window, { MWOrgPage, MWRoleMatrix, MWOrgProvidersTab, MWOrgCredits, MWOrgSsoTab });
})();
