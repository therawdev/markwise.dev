/* Markwise account SPA — documents dashboard */
(function () {
  const { useState, useEffect, useCallback } = React;

  function MWDashboard({ ctx }) {
    const { me, reload, navigate, toast } = ctx;

    // ---- document state ----
    const [docs, setDocs] = useState([]);
    const [trash, setTrash] = useState([]);
    const [loading, setLoading] = useState(true);

    // ---- toolbar state ----
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState('updated');
    const [wsFilter, setWsFilter] = useState('all');
    const [starredOnly, setStarredOnly] = useState(false);

    // ---- new doc workspace selector ----
    const [newDocCo, setNewDocCo] = useState('');

    // ---- rename state ----
    const [editing, setEditing] = useState(null); // {id, value}

    // ---- confirm delete state ----
    const [confirmDel, setConfirmDel] = useState(null); // doc id

    // ---- companies section state ----
    const [showNewCo, setShowNewCo] = useState(false);
    const [newCoName, setNewCoName] = useState('');
    const [adminCompanies, setAdminCompanies] = useState(null); // only for app owner

    // ---- permission helpers (mirror docs.html logic) ----
    const memberships = me.memberships || [];

    const canCreateInCompany = (companyId) => {
      if (companyId == null) return true; // personal always ok
      if (me.is_app_owner) return true;
      return memberships.some(
        (m) => m.company_id === companyId && (m.permissions || []).includes('doc:create')
      );
    };

    const canEditDoc = (doc) => {
      if (doc.owner_id === me.id) return true;
      if (doc.company_id == null) return false;
      if (me.is_app_owner) return true;
      return memberships.some(
        (m) => m.company_id === doc.company_id && (m.permissions || []).includes('doc:edit')
      );
    };

    const canDeleteDoc = (doc) => {
      if (doc.owner_id === me.id) return true;
      if (doc.company_id == null) return false;
      if (me.is_app_owner) return true;
      return memberships.some(
        (m) => m.company_id === doc.company_id && (m.permissions || []).includes('doc:delete')
      );
    };

    // memberships that allow doc:create (for the new-doc workspace selector)
    const createableMemberships = memberships.filter((m) =>
      (m.permissions || []).includes('doc:create')
    );
    // all memberships shown in toolbar workspace filter
    const allMemberships = memberships;

    // ---- data loading ----
    const loadDocs = useCallback(async () => {
      try {
        const data = await window.MarkwiseAPI.get('/api/docs');
        setDocs(data);
      } catch (e) {
        toast('Failed to load documents');
      }
    }, []);

    const loadTrash = useCallback(async () => {
      try {
        const data = await window.MarkwiseAPI.get('/api/docs/trash');
        setTrash(data);
      } catch (e) {
        // trash load failure is non-critical
      }
    }, []);

    useEffect(() => {
      setLoading(true);
      Promise.all([loadDocs(), loadTrash()]).finally(() => setLoading(false));
    }, []);

    // app owner: fetch all companies from admin endpoint
    useEffect(() => {
      if (!me.is_app_owner) return;
      window.MarkwiseAPI.get('/api/admin/companies')
        .then((all) => setAdminCompanies(all))
        .catch(() => {});
    }, [me.is_app_owner]);

    // ---- document filtering + sorting ----
    const filteredDocs = docs
      .filter((d) => {
        if (!query.trim()) return true;
        return (d.title || '').toLowerCase().includes(query.trim().toLowerCase());
      })
      .filter((d) => {
        if (wsFilter === 'all') return true;
        if (wsFilter === 'personal') return !d.company_id;
        return d.company_id === parseInt(wsFilter, 10);
      })
      .filter((d) => !starredOnly || d.starred)
      .slice()
      .sort(
        (a, b) =>
          (b.starred ? 1 : 0) - (a.starred ? 1 : 0) ||
          (sort === 'title'
            ? (a.title || '').localeCompare(b.title || '')
            : new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      );

    // ---- mutations ----
    const createDoc = async () => {
      const companyId = newDocCo ? Number(newDocCo) : null;
      if (!canCreateInCompany(companyId)) {
        toast('Your role can’t create documents here');
        return;
      }
      try {
        const doc = await window.MarkwiseAPI.post('/api/docs', {
          title: 'Untitled document',
          company_id: companyId,
        });
        location.href = '/index.html?doc=' + doc.id;
      } catch (e) {
        toast(e.message);
      }
    };

    const toggleStar = async (doc) => {
      try {
        await window.MarkwiseAPI.put('/api/docs/' + doc.id, { starred: !doc.starred });
        setDocs((prev) =>
          prev.map((d) => (d.id === doc.id ? { ...d, starred: !d.starred } : d))
        );
      } catch (e) {
        toast(e.message);
      }
    };

    const saveRename = async () => {
      if (!editing) return;
      const title = editing.value.trim() || 'Untitled document';
      try {
        await window.MarkwiseAPI.put('/api/docs/' + editing.id, { title });
        setDocs((prev) =>
          prev.map((d) => (d.id === editing.id ? { ...d, title } : d))
        );
      } catch (e) {
        toast(e.message);
      }
      setEditing(null);
    };

    const duplicateDoc = async (doc) => {
      try {
        await window.MarkwiseAPI.post('/api/docs/' + doc.id + '/duplicate');
        toast('Duplicated "' + (doc.title || 'Untitled document') + '"');
        await loadDocs();
      } catch (e) {
        toast(e.message);
      }
    };

    const deleteDoc = async (doc) => {
      const title = doc.title || 'Untitled document';
      try {
        await window.MarkwiseAPI.del('/api/docs/' + doc.id);
        setDocs((prev) => prev.filter((d) => d.id !== doc.id));
        setConfirmDel(null);
        // reload trash so undo works
        const freshTrash = await window.MarkwiseAPI.get('/api/docs/trash').catch(() => trash);
        setTrash(freshTrash);
        toast('Moved "' + title + '" to trash', {
          label: 'Undo',
          fn: async () => {
            try {
              await window.MarkwiseAPI.post('/api/docs/' + doc.id + '/restore');
              await loadDocs();
              const t2 = await window.MarkwiseAPI.get('/api/docs/trash').catch(() => []);
              setTrash(t2);
            } catch (e) {
              toast(e.message);
            }
          },
        });
      } catch (e) {
        toast(e.message);
      }
    };

    const restoreDoc = async (doc) => {
      try {
        await window.MarkwiseAPI.post('/api/docs/' + doc.id + '/restore');
        await loadDocs();
        setTrash((prev) => prev.filter((d) => d.id !== doc.id));
        toast('Restored "' + (doc.title || 'Untitled document') + '"');
      } catch (e) {
        toast(e.message);
      }
    };

    const purgeDoc = async (doc) => {
      try {
        await window.MarkwiseAPI.del('/api/docs/' + doc.id + '/purge');
        setTrash((prev) => prev.filter((d) => d.id !== doc.id));
        toast('Permanently deleted "' + (doc.title || 'Untitled document') + '"');
      } catch (e) {
        toast(e.message);
      }
    };

    const createCompany = async (e) => {
      if (e) e.preventDefault();
      const name = newCoName.trim();
      if (!name) return;
      try {
        const co = await window.MarkwiseAPI.post('/api/orgs', { name });
        setNewCoName('');
        setShowNewCo(false);
        await reload();
        navigate('/org/' + co.id);
      } catch (e) {
        toast(e.message);
      }
    };

    // ---- companies to display ----
    // For app owner: use adminCompanies (has member_count + plan); fall back to memberships while loading
    // For regular users: use memberships
    const companyList = me.is_app_owner
      ? (adminCompanies || []).map((c) => ({
          company_id: c.id,
          company_name: c.name,
          company_plan: c.plan,
          company_status: c.status,
          role: 'App owner',
          member_count: Number(c.member_count) || 0,
        }))
      : memberships.map((m) => ({
          company_id: m.company_id,
          company_name: m.company_name || ('Company ' + m.company_id),
          company_plan: m.company_plan || 'free',
          company_status: m.company_status || 'active',
          role: m.role || 'Member',
          member_count: null, // not available for regular users
        }));

    return (
      <div className="page" data-screen-label="Dashboard">
        <MWTopbar ctx={ctx} />
        <main className="wrap">

          {/* ---- Documents section ---- */}
          <MWSection
            title="Documents"
            actions={
              <span className="invite-gen">
                {(me.is_app_owner ? memberships.length > 0 : createableMemberships.length > 0) || memberships.length > 0 ? (
                  <select
                    className="fld sel"
                    value={newDocCo}
                    onChange={(e) => setNewDocCo(e.target.value)}
                    title="Workspace for new documents"
                  >
                    <option value="">Personal</option>
                    {(me.is_app_owner ? memberships : createableMemberships).map((m) => (
                      <option key={m.company_id} value={String(m.company_id)}>
                        {m.company_name || ('Company ' + m.company_id)}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button className="primary-btn" onClick={createDoc}>+ New document</button>
              </span>
            }
          >
            <div className="card">
              <div className="tbl-toolbar">
                <input
                  className="fld search"
                  value={query}
                  placeholder="Search documents…"
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button
                  className={'chip' + (starredOnly ? ' on' : '')}
                  title="Show starred only"
                  onClick={() => setStarredOnly((v) => !v)}
                >
                  ★ Starred
                </button>
                {allMemberships.length > 0 ? (
                  <select
                    className="fld sel"
                    value={wsFilter}
                    onChange={(e) => setWsFilter(e.target.value)}
                  >
                    <option value="all">All workspaces</option>
                    <option value="personal">Personal</option>
                    {allMemberships.map((m) => (
                      <option key={m.company_id} value={String(m.company_id)}>
                        {m.company_name || ('Company ' + m.company_id)}
                      </option>
                    ))}
                  </select>
                ) : null}
                <select
                  className="fld sel"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="updated">Last updated</option>
                  <option value="title">Title A–Z</option>
                </select>
              </div>

              {loading ? (
                <div className="empty-note">Loading…</div>
              ) : filteredDocs.length === 0 ? (
                <div className="empty-note">
                  {docs.length === 0
                    ? 'No documents yet. Create your first one.'
                    : 'Nothing matches your search.'}
                </div>
              ) : (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Workspace</th>
                      <th>Updated</th>
                      <th className="num"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocs.map((doc) => (
                      <tr key={doc.id}>
                        <td>
                          <span className="doc-cell">
                            <button
                              className={'star' + (doc.starred ? ' on' : '')}
                              title={doc.starred ? 'Unstar' : 'Star'}
                              onClick={() => toggleStar(doc)}
                            >
                              {doc.starred ? '★' : '☆'}
                            </button>
                            {editing && editing.id === doc.id ? (
                              <input
                                className="fld sel wide"
                                autoFocus
                                value={editing.value}
                                onChange={(e) =>
                                  setEditing({ id: doc.id, value: e.target.value })
                                }
                                onBlur={saveRename}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    saveRename();
                                  }
                                  if (e.key === 'Escape') setEditing(null);
                                }}
                              />
                            ) : (
                              <a
                                className="doc-link"
                                href={'/index.html?doc=' + doc.id}
                              >
                                {doc.title || 'Untitled document'}
                              </a>
                            )}
                          </span>
                        </td>
                        <td>
                          <span className="ws-chip">
                            {doc.company_id
                              ? doc.company_name || ('Company ' + doc.company_id)
                              : 'Personal'}
                          </span>
                        </td>
                        <td className="dim">{mwAgo(doc.updated_at)}</td>
                        <td className="num">
                          <span className="row-actions">
                            <a
                              className="ghost-btn sm as-link"
                              href={'/index.html?doc=' + doc.id}
                            >
                              Open
                            </a>
                            {canEditDoc(doc) ? (
                              <button
                                className="ghost-btn sm"
                                onClick={() =>
                                  setEditing({ id: doc.id, value: doc.title || '' })
                                }
                              >
                                Rename
                              </button>
                            ) : null}
                            {canCreateInCompany(doc.company_id) ? (
                              <button
                                className="ghost-btn sm"
                                onClick={() => duplicateDoc(doc)}
                              >
                                Duplicate
                              </button>
                            ) : null}
                            {canDeleteDoc(doc) ? (
                              confirmDel === doc.id ? (
                                <button
                                  className="danger-btn sm solid"
                                  onClick={() => deleteDoc(doc)}
                                  onMouseLeave={() => setConfirmDel(null)}
                                >
                                  Confirm
                                </button>
                              ) : (
                                <button
                                  className="danger-btn sm"
                                  onClick={() => setConfirmDel(doc.id)}
                                >
                                  Delete
                                </button>
                              )
                            ) : null}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </MWSection>

          {/* ---- Companies section ---- */}
          <MWSection
            title="Companies"
            sub={
              memberships.length === 0
                ? 'Create a company to collaborate with a team, or join one with an invite link.'
                : 'Manage members, invites, roles, and billing for your teams.'
            }
          >
            <div className="co-grid">
              {companyList.map((m) => (
                <a key={m.company_id} className="co-card" href={'/org/' + m.company_id}>
                  <span style={{ display: 'contents' }}>
                    <span
                      className="av"
                      style={{
                        width: 38,
                        height: 38,
                        fontSize: Math.round(38 * 0.4),
                        background:
                          'oklch(0.52 0.11 ' + mwHueFor(m.company_name || 'x') + ')',
                        borderRadius: '10px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        fontWeight: 600,
                        color: '#fff',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {String(m.company_name || 'C')
                        .split(/\s+/)
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()}
                    </span>
                  </span>
                  <div className="co-meta">
                    <b>{m.company_name || ('Company ' + m.company_id)}</b>
                    <span>
                      {m.member_count != null
                        ? m.member_count +
                          (m.member_count === 1 ? ' member · ' : ' members · ')
                        : ''}
                      {m.company_plan || 'free'} plan
                      {m.company_status === 'suspended' ? ' · suspended' : ''}
                    </span>
                  </div>
                  <span className="co-role">{m.role}</span>
                </a>
              ))}

              {showNewCo ? (
                <div className="co-card form">
                  <form onSubmit={createCompany}>
                    <input
                      className="fld"
                      autoFocus
                      value={newCoName}
                      placeholder="Company name"
                      onChange={(e) => setNewCoName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setShowNewCo(false);
                          setNewCoName('');
                        }
                      }}
                    />
                    <button
                      className="primary-btn"
                      type="submit"
                      disabled={!newCoName.trim()}
                    >
                      Create
                    </button>
                    <button
                      className="ghost-btn"
                      type="button"
                      onClick={() => {
                        setShowNewCo(false);
                        setNewCoName('');
                      }}
                    >
                      Cancel
                    </button>
                  </form>
                </div>
              ) : (
                <button className="co-card add" onClick={() => setShowNewCo(true)}>
                  + New company
                </button>
              )}
            </div>
          </MWSection>

          {/* ---- Trash section (only when non-empty) ---- */}
          {trash.length > 0 ? (
            <MWSection
              title="Trash"
              sub="Deleted documents are kept here for 30 days, then removed automatically."
            >
              <div className="card">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Workspace</th>
                      <th>Deleted</th>
                      <th className="num"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {trash.map((doc) => (
                      <tr key={doc.id}>
                        <td className="dim">{doc.title || 'Untitled document'}</td>
                        <td>
                          <span className="ws-chip">
                            {doc.company_id
                              ? doc.company_name || ('Company ' + doc.company_id)
                              : 'Personal'}
                          </span>
                        </td>
                        <td className="dim">{mwAgo(doc.deleted_at)}</td>
                        <td className="num">
                          <span className="row-actions">
                            <button
                              className="ghost-btn sm"
                              onClick={() => restoreDoc(doc)}
                            >
                              Restore
                            </button>
                            <button
                              className="danger-btn sm"
                              onClick={() => purgeDoc(doc)}
                            >
                              Delete forever
                            </button>
                          </span>
                        </td>
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

  Object.assign(window, { MWDashboard });
})();
