/* Markwise account SPA — personal account settings page */
(function () {
  const { useState, useEffect } = React;

  function mwPwScore(p) {
    if (!p) return 0;
    let s = 0;
    if (p.length >= 8) s++;
    if (p.length >= 10) s++;
    if (/[A-Z]/.test(p) && /[0-9]/.test(p)) s++;
    return s;
  }

  function MWPwMeter({ pw }) {
    if (!pw) return null;
    const score = mwPwScore(pw);
    const label = score <= 1 ? 'Weak' : score === 2 ? 'Okay' : 'Strong';
    return (
      <div className={'pw-meter s' + score}>
        <span className="bars"><i></i><i></i><i></i></span>
        <span className="pw-label">{label}</span>
      </div>
    );
  }

  function MWSettingsPage({ ctx }) {
    const { me, reload, navigate, toast } = ctx;

    const [pane, setPane] = useState('profile');

    // profile pane state
    const [name, setName] = useState(me.name);
    const [email, setEmail] = useState(me.email);
    const [profileError, setProfileError] = useState(null);

    // security pane state
    const [curPw, setCurPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [pwError, setPwError] = useState(null);

    // api keys pane state
    const [apiKeys, setApiKeys] = useState([]);
    const [keysLoaded, setKeysLoaded] = useState(false);
    const [newlyCreatedToken, setNewlyCreatedToken] = useState(null); // {id, fullToken}
    const [usage, setUsage] = useState(null); // this user's AI credit standing
    const [usageErr, setUsageErr] = useState('');

    // load api keys count for nav badge on mount
    useEffect(() => {
      window.MarkwiseAPI.get('/api/auth/keys').then((keys) => {
        setApiKeys(keys);
        setKeysLoaded(true);
      }).catch(() => { setKeysLoaded(true); });
    }, []);

    // lazy-load the user's own AI credit standing when that pane opens
    const loadUsage = () => {
      setUsageErr('');
      return window.MarkwiseAPI.get('/api/ai/quota').then(setUsage).catch((e) => { setUsageErr(e.message || 'Failed to load AI usage.'); toast(e.message); });
    };
    useEffect(() => {
      if (pane === 'usage' && !usage) loadUsage();
    }, [pane]);

    const profileDirty = name.trim() !== me.name || email.trim().toLowerCase() !== me.email;

    const companyCount = (me.memberships || []).length;
    const companyLabel = companyCount === 0 ? 'no companies'
      : companyCount === 1 ? '1 company'
      : companyCount + ' companies';

    const panes = [
      { id: 'profile',       label: 'Profile' },
      { id: 'security',      label: 'Security' },
      { id: 'notifications', label: 'Notifications' },
      { id: 'usage',         label: 'AI usage' },
      { id: 'api',           label: 'API keys', count: apiKeys.length || null },
      { id: 'danger',        label: 'Danger zone', danger: true },
    ];

    // ── profile handlers ──────────────────────────────────────────────────────
    const saveProfile = async (e) => {
      e.preventDefault();
      const nm = name.trim();
      const em = email.trim().toLowerCase();
      if (!nm) { setProfileError('Name can’t be empty.'); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { setProfileError('Please enter a valid email.'); return; }
      try {
        const updated = await window.MarkwiseAPI.put('/api/auth/me', { name: nm, email: em });
        setName(updated.name);
        setEmail(updated.email);
        setProfileError(null);
        toast('Profile saved');
        reload();
      } catch (err) {
        setProfileError(err.message || 'Failed to save profile.');
      }
    };

    // ── security handlers ─────────────────────────────────────────────────────
    const changePassword = async (e) => {
      e.preventDefault();
      try {
        await window.MarkwiseAPI.put('/api/auth/password', { current: curPw, password: newPw });
        setCurPw('');
        setNewPw('');
        setPwError(null);
        toast('Password changed');
      } catch (err) {
        setPwError(err.message || 'Failed to change password.');
      }
    };

    // ── notification prefs ────────────────────────────────────────────────────
    function getNotifPrefs() {
      try { return JSON.parse(localStorage.getItem('mw-notif-prefs') || '{}'); }
      catch (e) { return {}; }
    }
    function prefOn(k) { return getNotifPrefs()[k] !== false; }
    function togglePref(k) {
      const prefs = getNotifPrefs();
      prefs[k] = !prefOn(k);
      localStorage.setItem('mw-notif-prefs', JSON.stringify(prefs));
      // force re-render
      setPane((p) => p); // same pane, triggers re-render
    }
    // Use a counter to force re-render on pref toggle
    const [notifTick, setNotifTick] = useState(0);
    function togglePrefReactive(k) {
      const prefs = getNotifPrefs();
      prefs[k] = !prefOn(k);
      localStorage.setItem('mw-notif-prefs', JSON.stringify(prefs));
      setNotifTick((n) => n + 1);
    }

    // ── api key handlers ──────────────────────────────────────────────────────
    const generateKey = async () => {
      try {
        const key = await window.MarkwiseAPI.post('/api/auth/keys');
        // server returns full token once on creation
        setNewlyCreatedToken({ id: key.id, fullToken: key.token });
        setApiKeys((prev) => [{ id: key.id, token: key.token, created_at: key.created_at }, ...prev]);
        toast('API key created — copy it now');
      } catch (err) {
        toast(err.message || 'Failed to create key');
      }
    };

    const revokeKey = async (id) => {
      try {
        await window.MarkwiseAPI.del('/api/auth/keys/' + id);
        if (newlyCreatedToken && newlyCreatedToken.id === id) setNewlyCreatedToken(null);
        setApiKeys((prev) => prev.filter((k) => k.id !== id));
        toast('API key revoked');
      } catch (err) {
        toast(err.message || 'Failed to revoke key');
      }
    };

    // ── danger handler ────────────────────────────────────────────────────────
    const deleteAccount = async () => {
      try {
        await window.MarkwiseAPI.del('/api/auth/me');
        location.href = '/login';
      } catch (err) {
        toast(err.message || 'Failed to delete account');
      }
    };

    return (
      <div className="page">
        <MWTopbar ctx={ctx} back={true} />
        <main className="wrap settings">

          <div className="acct-head">
            <MWAvatar name={me.name} size={54} />
            <div className="acct-id">
              <span className="acct-title-row">
                <h1 className="page-title">{me.name}</h1>
                {me.is_app_owner ? <MWPill tone="blue">App owner</MWPill> : null}
              </span>
              <span className="acct-sub">
                {me.email}
                {' · '}
                {companyLabel}
              </span>
            </div>
          </div>

          <div className="settings-grid">
            <nav className="snav">
              {panes.map((p) => (
                <button
                  key={p.id}
                  className={(pane === p.id ? 'on' : '') + (p.danger ? ' danger' : '')}
                  onClick={() => setPane(p.id)}
                >
                  {p.label}
                  {p.count != null ? <span className="count">{p.count}</span> : null}
                </button>
              ))}
            </nav>

            <div className="settings-body">

              {pane === 'profile' ? (
                <MWSection title="Profile" sub="How you appear to teammates across Markwise.">
                  <div className="card pad">
                    <div className="avatar-row">
                      <MWAvatar name={name.trim() || me.name} size={44} />
                      <p>Your avatar uses your initials and a color generated from your name — it updates as you type.</p>
                    </div>
                    <form onSubmit={saveProfile}>
                      <label className="fld-label">Name</label>
                      <input
                        className="fld"
                        type="text"
                        value={name}
                        onChange={(e) => { setName(e.target.value); setProfileError(null); }}
                      />
                      <label className="fld-label">Email</label>
                      <input
                        className="fld"
                        type="email"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setProfileError(null); }}
                      />
                      {profileError ? <div className="form-error">{profileError}</div> : null}
                      <div className="form-foot split">
                        <span className="dim foot-hint">{profileDirty ? 'Unsaved changes' : ''}</span>
                        <button className="primary-btn" type="submit" disabled={!profileDirty}>Save profile</button>
                      </div>
                    </form>
                  </div>
                </MWSection>
              ) : null}

              {pane === 'security' ? (
                <React.Fragment>
                  <MWSection title="Password">
                    <div className="card pad">
                      <form onSubmit={changePassword}>
                        <label className="fld-label">Current password</label>
                        <input
                          className="fld"
                          type="password"
                          value={curPw}
                          autoComplete="current-password"
                          onChange={(e) => { setCurPw(e.target.value); setPwError(null); }}
                        />
                        <label className="fld-label">New password</label>
                        <input
                          className="fld"
                          type="password"
                          value={newPw}
                          placeholder="At least 8 characters"
                          autoComplete="new-password"
                          onChange={(e) => { setNewPw(e.target.value); setPwError(null); }}
                        />
                        <MWPwMeter pw={newPw} />
                        {pwError ? <div className="form-error">{pwError}</div> : null}
                        <div className="form-foot">
                          <button className="secondary-btn" type="submit" disabled={!curPw || !newPw}>Change password</button>
                        </div>
                      </form>
                    </div>
                  </MWSection>
                  <MWSection title="Two-factor authentication" sub="Add a one-time code from an authenticator app to your sign-in.">
                    <MWMfaCard toast={toast} />
                  </MWSection>
                  <MWSection title="Active sessions" sub="Devices signed in to your account. Revoke any you don’t recognize.">
                    <MWSessionsCard toast={toast} />
                  </MWSection>
                </React.Fragment>
              ) : null}

              {pane === 'notifications' ? (
                <MWSection title="Notifications" sub="What shows up in your notification bell.">
                  <div className="card pad" key={notifTick}>
                    <div className="set-row">
                      <div>
                        <b>Invites</b>
                        <p>Invite links created, deleted, or accepted in your companies.</p>
                      </div>
                      <MWSwitch on={prefOn('invites')} onChange={() => togglePrefReactive('invites')} />
                    </div>
                    <div className="set-row">
                      <div>
                        <b>Members &amp; roles</b>
                        <p>Members joining or leaving, and role changes.</p>
                      </div>
                      <MWSwitch on={prefOn('roles')} onChange={() => togglePrefReactive('roles')} />
                    </div>
                    <div className="set-row">
                      <div>
                        <b>Billing</b>
                        <p>Plan changes and invoices.</p>
                      </div>
                      <MWSwitch on={prefOn('billing')} onChange={() => togglePrefReactive('billing')} />
                    </div>
                  </div>
                </MWSection>
              ) : null}

              {pane === 'usage' ? (
                <MWSection title="AI credits" sub="Each AI visual you generate uses one credit. Your allowance resets on the 1st.">
                  {usageErr ? (
                    <div className="card usage-card"><div className="dim sm-note">{usageErr} · <button className="ghost-btn sm" onClick={loadUsage}>Retry</button></div></div>
                  ) : (
                    <MWCreditBar status={usage} label="AI credits this month" />
                  )}
                </MWSection>
              ) : null}

              {pane === 'api' ? (
                <MWSection
                  title="API keys"
                  sub="For the Markwise API and integrations. Keys act with your permissions."
                  actions={<button className="secondary-btn" onClick={generateKey}>Generate key</button>}
                >
                  <div className="card">
                    {apiKeys.length === 0 ? (
                      <div className="empty-note">No API keys yet. Generate one to use the Markwise API.</div>
                    ) : (
                      <table className="tbl">
                        <thead>
                          <tr><th>Key</th><th>Created</th><th className="num"></th></tr>
                        </thead>
                        <tbody>
                          {apiKeys.map((k) => {
                            const isNew = newlyCreatedToken && newlyCreatedToken.id === k.id;
                            const displayToken = isNew ? newlyCreatedToken.fullToken : k.token;
                            return (
                              <tr key={k.id}>
                                <td>
                                  <span className="mono-chip">{displayToken}</span>
                                  {isNew ? <span className="dim sm-note"> — visible once</span> : null}
                                </td>
                                <td className="dim">{mwFmtDate(k.created_at)}</td>
                                <td className="num">
                                  <span className="row-actions">
                                    {isNew ? (
                                      <button
                                        className="ghost-btn sm"
                                        onClick={() => mwCopy(newlyCreatedToken.fullToken, toast, 'API key copied')}
                                      >
                                        Copy
                                      </button>
                                    ) : null}
                                    <button className="danger-btn sm" onClick={() => revokeKey(k.id)}>Revoke</button>
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

              {pane === 'danger' ? (
                <MWSection title="Danger zone">
                  <div className="card pad">
                    <div className="danger-zone bare">
                      <div>
                        <b>Delete account</b>
                        {me.is_app_owner ? (
                          <p>The app owner account can&rsquo;t be deleted — transfer ownership first.</p>
                        ) : (
                          <p>Removes you from all companies and deletes your personal documents. This can&rsquo;t be undone.</p>
                        )}
                      </div>
                      {me.is_app_owner ? (
                        <button className="danger-btn" disabled={true}>Delete account</button>
                      ) : (
                        <MWConfirmDelete label="Delete account" onConfirm={deleteAccount} />
                      )}
                    </div>
                  </div>
                </MWSection>
              ) : null}

            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── two-factor (TOTP) card ──────────────────────────────────────────────────
  function MWMfaCard({ toast }) {
    const API = window.MarkwiseAPI;
    const [st, setSt] = useState(null);      // { enabled, required, secretsConfigured, is_sso }
    const [setup, setSetup] = useState(null); // { secret, qr_svg }
    const [code, setCode] = useState('');
    const [recovery, setRecovery] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const load = () => API.get('/api/auth/mfa').then(setSt).catch(() => {});
    useEffect(() => { load(); }, []);

    if (!st) return <div className="card pad"><div className="empty-note">Loading…</div></div>;
    if (st.is_sso) return <div className="card pad"><p className="dim" style={{ margin: 0, fontSize: 13 }}>Your account signs in with single sign-on — two-factor is managed by your identity provider.</p></div>;

    const begin = async () => {
      setBusy(true); setErr(null);
      try { setSetup(await API.post('/api/auth/mfa/setup', {})); } catch (e) { setErr(e.message); } finally { setBusy(false); }
    };
    const enable = async () => {
      setBusy(true); setErr(null);
      try {
        const r = await API.post('/api/auth/mfa/enable', { code: code.trim() });
        setRecovery(r.recovery_codes || []); setSetup(null); setCode(''); await load(); toast('Two-factor enabled');
      } catch (e) { setErr(e.message); } finally { setBusy(false); }
    };
    const disable = async () => {
      setBusy(true); setErr(null);
      try { await API.post('/api/auth/mfa/disable', { code: code.trim() }); setCode(''); setRecovery(null); await load(); toast('Two-factor disabled'); }
      catch (e) { setErr(e.message); } finally { setBusy(false); }
    };

    // Freshly enabled — show recovery codes once.
    if (recovery) {
      return (
        <div className="card pad">
          <b>Save your recovery codes</b>
          <p className="dim" style={{ fontSize: 13, margin: '4px 0 8px' }}>Each can be used once if you lose your authenticator.</p>
          <div className="mfa-codes">{recovery.map((c) => <code key={c}>{c}</code>)}</div>
          <button className="secondary-btn" onClick={() => setRecovery(null)}>Done</button>
        </div>
      );
    }

    if (st.enabled) {
      return (
        <div className="card pad">
          <div className="set-row" style={{ borderBottom: 'none' }}>
            <div><b>Two-factor is on</b><p>{st.required ? 'Required by your organization — it can’t be turned off.' : 'Your account is protected with an authenticator app.'}</p></div>
            <MWPill tone="green">Enabled</MWPill>
          </div>
          {!st.required ? (
            <div className="inline-form" style={{ marginTop: 8 }}>
              <input className="fld" placeholder="Current code to turn off" value={code} onChange={(e) => { setCode(e.target.value); setErr(null); }} />
              <button className="danger-btn" disabled={busy || !code} onClick={disable}>Turn off</button>
            </div>
          ) : null}
          {err ? <div className="form-error">{err}</div> : null}
        </div>
      );
    }

    // Not enabled
    if (!setup) {
      return (
        <div className="card pad">
          <div className="set-row" style={{ borderBottom: 'none' }}>
            <div><b>Two-factor is off</b><p>{st.required ? 'Your organization requires it — set it up now.' : 'Protect your account with an authenticator app.'}</p></div>
            <button className="primary-btn" disabled={busy || !st.secretsConfigured} onClick={begin}>Set up</button>
          </div>
          {!st.secretsConfigured ? <p className="dim" style={{ fontSize: 12, margin: '6px 0 0' }}>Server secret storage isn’t configured — ask the platform admin.</p> : null}
          {err ? <div className="form-error">{err}</div> : null}
        </div>
      );
    }

    // Mid-setup: QR + confirm code
    return (
      <div className="card pad">
        <p className="dim" style={{ fontSize: 13, marginTop: 0 }}>Scan with an authenticator app (Google Authenticator, 1Password, Authy…), then enter a code.</p>
        <div className="mfa-qr" dangerouslySetInnerHTML={{ __html: setup.qr_svg }} />
        <div className="mfa-secret">Or enter this key: <code>{setup.secret}</code></div>
        <div className="inline-form">
          <input className="fld" autoFocus placeholder="123456" value={code} onChange={(e) => { setCode(e.target.value); setErr(null); }} />
          <button className="primary-btn" disabled={busy || !code} onClick={enable}>Verify &amp; enable</button>
          <button className="ghost-btn" disabled={busy} onClick={() => { setSetup(null); setCode(''); setErr(null); }}>Cancel</button>
        </div>
        {err ? <div className="form-error">{err}</div> : null}
      </div>
    );
  }

  // ── active sessions card ────────────────────────────────────────────────────
  function MWSessionsCard({ toast }) {
    const API = window.MarkwiseAPI;
    const [sessions, setSessions] = useState(null);
    const [busy, setBusy] = useState(false);
    const load = () => API.get('/api/auth/sessions').then(setSessions).catch(() => setSessions([]));
    useEffect(() => { load(); }, []);

    // Turn a UA string into a short, friendly label.
    const label = (ua) => {
      if (!ua) return 'Unknown device';
      const browser = /Edg/.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Browser';
      const os = /Windows/.test(ua) ? 'Windows' : /Mac OS|Macintosh/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
      return browser + (os ? ' · ' + os : '');
    };
    const revoke = async (s) => {
      setBusy(true);
      try {
        const r = await API.del('/api/auth/sessions/' + encodeURIComponent(s.id));
        if (r.was_current) { window.MarkwiseAPI.logout(); return; } // revoked self → sign out
        toast('Session revoked'); await load();
      } catch (e) { toast(e.message); } finally { setBusy(false); }
    };
    const revokeOthers = async () => {
      setBusy(true);
      try { const r = await API.post('/api/auth/sessions/revoke-others', {}); toast(r.revoked ? 'Signed out ' + r.revoked + ' other session' + (r.revoked === 1 ? '' : 's') : 'No other sessions'); await load(); }
      catch (e) { toast(e.message); } finally { setBusy(false); }
    };

    if (!sessions) return <div className="card pad"><div className="empty-note">Loading…</div></div>;
    const others = sessions.filter((s) => !s.current).length;
    return (
      <div className="card">
        <table className="tbl">
          <thead><tr><th>Device</th><th>Last active</th><th className="num"></th></tr></thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>
                  <b>{label(s.user_agent)}</b>
                  {s.current ? <span className="pill green sm" style={{ marginLeft: 8 }}>This device</span> : null}
                  {s.impersonated ? <span className="pill grey sm" style={{ marginLeft: 8 }}>Admin</span> : null}
                </td>
                <td className="dim">{mwAgo(s.last_seen)}</td>
                <td className="num">
                  <button className="ghost-btn sm" disabled={busy} onClick={() => revoke(s)}>{s.current ? 'Sign out' : 'Revoke'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {others > 0 ? (
          <div className="rm-bar"><span>{others} other active session{others === 1 ? '' : 's'}.</span>
            <button className="danger-btn sm" disabled={busy} onClick={revokeOthers}>Sign out other sessions</button>
          </div>
        ) : null}
      </div>
    );
  }

  Object.assign(window, { MWSettingsPage, MWPwMeter, mwPwScore, MWMfaCard, MWSessionsCard });
})();
