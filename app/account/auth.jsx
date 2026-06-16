/* Markwise account SPA — login, signup, invite landing (real API) */
(function () {
  const { useState, useEffect } = React;
  const API = window.MarkwiseAPI;

  function MWAuthShell({ label, children }) {
    return (
      <div className="auth-stage" data-screen-label={label}>
        <div className="auth-inner">
          <div className="auth-brand"><span className="brand-mark"></span><span className="brand-name">Markwise</span></div>
          {children}
        </div>
      </div>
    );
  }

  function MWLogin({ ctx }) {
    const { navigate } = ctx;
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    // Surface ?sso_error from a failed/cancelled single sign-on round-trip.
    const [error, setError] = useState(() => new URLSearchParams(location.search).get('sso_error') || null);
    const [ssoBusy, setSsoBusy] = useState(false);
    // Second-factor flow: 'creds' → 'mfa' (enrolled) or 'setup' (org-forced enrolment) → 'recovery'.
    const [stage, setStage] = useState('creds');
    const [mfaToken, setMfaToken] = useState(null);
    const [code, setCode] = useState('');
    const [setupData, setSetupData] = useState(null); // { secret, qr_svg }
    const [recovery, setRecovery] = useState(null);
    const nextOf = () => new URLSearchParams(location.search).get('next');

    const finish = async () => {
      await ctx.reload();
      const next = nextOf();
      if (next && next.startsWith('/')) location.href = next; else navigate('/docs');
    };

    const submit = async (e) => {
      e.preventDefault();
      try {
        const r = await API.post('/api/auth/login', { email: email.trim(), password });
        if (r && r.mfa_required) { setMfaToken(r.mfa_token); setStage('mfa'); setError(null); return; }
        if (r && r.mfa_setup_required) {
          setMfaToken(r.mfa_token);
          const s = await API.post('/api/auth/mfa/setup', { mfa_token: r.mfa_token });
          setSetupData(s); setStage('setup'); setError(null); return;
        }
        await finish();
      } catch (err) { setError(err.message); }
    };

    const verifyMfa = async (e) => {
      e.preventDefault();
      try { await API.post('/api/auth/mfa/verify', { mfa_token: mfaToken, code: code.trim() }); await finish(); }
      catch (err) { setError(err.message); }
    };

    const enableMfa = async (e) => {
      e.preventDefault();
      try {
        const r = await API.post('/api/auth/mfa/enable', { mfa_token: mfaToken, code: code.trim() });
        setRecovery(r.recovery_codes || []); setStage('recovery'); setError(null);
      } catch (err) { setError(err.message); }
    };

    // Single sign-on: look up the email's domain; if an org has SSO, hand off to it.
    const ssoSignIn = async () => {
      const e = email.trim();
      if (!e || e.indexOf('@') === -1) { setError('Enter your work email, then choose single sign-on.'); return; }
      setSsoBusy(true);
      try {
        const r = await API.get('/api/sso/providers?email=' + encodeURIComponent(e));
        if (!r.available) { setError('No single sign-on is set up for that email’s domain.'); setSsoBusy(false); return; }
        const next = nextOf();
        location.href = r.start_url + (next ? '&next=' + encodeURIComponent(next) : '');
      } catch (err) { setError(err.message); setSsoBusy(false); }
    };

    // ---- second-factor: enter a code ----
    if (stage === 'mfa') {
      return (
        <MWAuthShell label="Two-factor">
          <div className="auth-card">
            <h1 className="auth-title">Two-factor authentication</h1>
            <p className="auth-sub">Enter the 6-digit code from your authenticator app, or a recovery code.</p>
            <form onSubmit={verifyMfa}>
              <label className="fld-label">Authentication code</label>
              <input className="fld" autoFocus inputMode="text" placeholder="123456" value={code}
                onChange={(e) => { setCode(e.target.value); setError(null); }} />
              {error ? <div className="form-error">{error}</div> : null}
              <button className="primary-btn auth-submit" type="submit">Verify</button>
            </form>
            <div className="auth-alt"><a href="#" onClick={(e) => { e.preventDefault(); setStage('creds'); setCode(''); setError(null); }}>Back to sign in</a></div>
          </div>
        </MWAuthShell>
      );
    }

    // ---- org-forced enrolment: scan QR, confirm a code ----
    if (stage === 'setup') {
      return (
        <MWAuthShell label="Set up two-factor">
          <div className="auth-card">
            <h1 className="auth-title">Set up two-factor</h1>
            <p className="auth-sub">Your organization requires two-factor authentication. Scan this with an authenticator app, then enter a code.</p>
            {setupData ? <div className="mfa-qr" dangerouslySetInnerHTML={{ __html: setupData.qr_svg }} /> : null}
            {setupData ? <div className="mfa-secret">Or enter this key: <code>{setupData.secret}</code></div> : null}
            <form onSubmit={enableMfa}>
              <label className="fld-label">Authentication code</label>
              <input className="fld" autoFocus placeholder="123456" value={code}
                onChange={(e) => { setCode(e.target.value); setError(null); }} />
              {error ? <div className="form-error">{error}</div> : null}
              <button className="primary-btn auth-submit" type="submit">Turn on &amp; continue</button>
            </form>
          </div>
        </MWAuthShell>
      );
    }

    // ---- recovery codes shown once after forced enrolment ----
    if (stage === 'recovery') {
      return (
        <MWAuthShell label="Recovery codes">
          <div className="auth-card">
            <h1 className="auth-title">Save your recovery codes</h1>
            <p className="auth-sub">Store these somewhere safe. Each one can be used once if you lose your authenticator.</p>
            <div className="mfa-codes">{(recovery || []).map((c) => <code key={c}>{c}</code>)}</div>
            <button className="primary-btn auth-submit" type="button" onClick={finish}>I’ve saved them — continue</button>
          </div>
        </MWAuthShell>
      );
    }

    return (
      <MWAuthShell label="Login">
        <div className="auth-card">
          <h1 className="auth-title">Sign in</h1>
          <p className="auth-sub">Turn text into visuals, together.</p>
          <form onSubmit={submit}>
            <label className="fld-label">Email</label>
            <input className="fld" type="email" value={email} autoFocus placeholder="you@company.com"
              onChange={(e) => { setEmail(e.target.value); setError(null); }} />
            <label className="fld-label">Password</label>
            <input className="fld" type="password" value={password} placeholder="••••••••"
              onChange={(e) => { setPassword(e.target.value); setError(null); }} />
            {error ? <div className="form-error">{error}</div> : null}
            <button className="primary-btn auth-submit" type="submit">Sign in</button>
          </form>
          <div className="auth-or"><span>or</span></div>
          <button className="secondary-btn auth-submit" type="button" disabled={ssoBusy} onClick={ssoSignIn}>
            {ssoBusy ? 'Redirecting…' : 'Single sign-on (SSO)'}
          </button>
          <div className="auth-alt">No account? <a href="/signup">Create one</a></div>
        </div>
      </MWAuthShell>
    );
  }

  function MWSignup({ ctx }) {
    const { navigate } = ctx;
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [pending, setPending] = useState(null); // awaiting-approval message after a domain-join signup
    const [gate, setGate] = useState({ loading: true, allow: true });
    useEffect(() => {
      API.get('/api/platform').then((p) => setGate({ loading: false, allow: p.allow_signups !== false })).catch(() => setGate({ loading: false, allow: true }));
    }, []);

    if (pending) {
      return (
        <MWAuthShell label="Signup">
          <div className="auth-card">
            <h1 className="auth-title">Request sent</h1>
            <p className="auth-sub">{pending}</p>
            <p className="auth-sub">You’ll be able to sign in (password or single sign-on) once a company owner approves your request.</p>
            <a className="secondary-btn as-link" href="/login">Go to sign in</a>
          </div>
        </MWAuthShell>
      );
    }

    if (!gate.loading && !gate.allow) {
      return (
        <MWAuthShell label="Signup">
          <div className="auth-card">
            <h1 className="auth-title">Signups are invite-only</h1>
            <p className="auth-sub">The app owner has turned off public signups. Invite links still work — ask a company owner to send you one.</p>
            <a className="secondary-btn as-link" href="/login">Go to sign in</a>
          </div>
        </MWAuthShell>
      );
    }
    const submit = async (e) => {
      e.preventDefault();
      try {
        const r = await API.post('/api/auth/signup', { name: name.trim(), email: email.trim(), password });
        if (r && r.pending) { setPending(r.message || 'Your account is awaiting approval.'); return; }
        await ctx.reload();
        navigate('/docs');
      } catch (err) { setError(err.message); }
    };
    return (
      <MWAuthShell label="Signup">
        <div className="auth-card">
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-sub">Have an invite link? Open it instead — you'll join your team automatically.</p>
          <form onSubmit={submit}>
            <label className="fld-label">Name</label>
            <input className="fld" value={name} autoFocus placeholder="Your name" onChange={(e) => { setName(e.target.value); setError(null); }} />
            <label className="fld-label">Email</label>
            <input className="fld" type="email" value={email} placeholder="you@company.com" onChange={(e) => { setEmail(e.target.value); setError(null); }} />
            <label className="fld-label">Password</label>
            <input className="fld" type="password" value={password} placeholder="At least 8 characters" onChange={(e) => { setPassword(e.target.value); setError(null); }} />
            {error ? <div className="form-error">{error}</div> : null}
            <button className="primary-btn auth-submit" type="submit">Create account</button>
          </form>
          <div className="auth-alt">Already have an account? <a href="/login">Sign in</a></div>
        </div>
      </MWAuthShell>
    );
  }

  function MWInvitePage({ ctx, token }) {
    const { me, navigate } = ctx;
    const [info, setInfo] = useState(null);
    const [err, setErr] = useState(null);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [formErr, setFormErr] = useState(null);
    useEffect(() => {
      API.get('/api/orgs/invites/' + encodeURIComponent(token) + '/info')
        .then(setInfo).catch(() => setErr('This invite link is invalid or was deleted.'));
    }, [token]);

    const dead = (title, sub) => (
      <MWAuthShell label="Invite">
        <div className="auth-card">
          <h1 className="auth-title">{title}</h1>
          <p className="auth-sub">{sub}</p>
          <a className="secondary-btn as-link" href="/login">Go to sign in</a>
        </div>
      </MWAuthShell>
    );
    if (err) return dead('Invite not found', err);
    if (!info) return <MWAuthShell label="Invite"><div className="auth-card"><h1 className="auth-title">Checking your invite…</h1></div></MWAuthShell>;
    if (info.state === 'used') return dead('Invite already used', 'This invite link was already used' + (info.used_by_email ? ' by ' + info.used_by_email : '') + '. Ask for a new one.');
    if (info.state === 'expired') return dead('Invite expired', 'Invite links expire after 7 days. Ask for a new one.');

    if (me) {
      const already = (me.memberships || []).some((m) => m.company_id === info.company_id);
      return (
        <MWAuthShell label="Invite">
          <div className="auth-card">
            <h1 className="auth-title">Join {info.company}</h1>
            <p className="auth-sub">You've been invited to join <b>{info.company}</b> as <b>{info.role}</b> (signed in as {me.email}).</p>
            {already ? (
              <div>
                <div className="form-error neutral">You're already a member of this company.</div>
                <a className="secondary-btn as-link" href={'/org/' + info.company_id}>Open company settings</a>
              </div>
            ) : (
              <button className="primary-btn auth-submit" onClick={async () => {
                try { await API.post('/api/orgs/invites/' + encodeURIComponent(token) + '/accept'); await ctx.reload(); navigate('/docs'); }
                catch (e) { setFormErr(e.message); }
              }}>Join {info.company} as {info.role}</button>
            )}
            {formErr ? <div className="form-error">{formErr}</div> : null}
          </div>
        </MWAuthShell>
      );
    }

    const submit = async (e) => {
      e.preventDefault();
      try {
        await API.post('/api/auth/signup', { name: name.trim(), email: email.trim(), password, invite_token: token });
        await ctx.reload();
        navigate('/docs');
      } catch (err2) { setFormErr(err2.message); }
    };
    return (
      <MWAuthShell label="Invite">
        <div className="auth-card">
          <h1 className="auth-title">Join {info.company}</h1>
          <p className="auth-sub">You've been invited to join <b>{info.company}</b> as <b>{info.role}</b>. Create your account to accept.</p>
          <form onSubmit={submit}>
            <label className="fld-label">Name</label>
            <input className="fld" value={name} autoFocus placeholder="Your name" onChange={(e) => { setName(e.target.value); setFormErr(null); }} />
            <label className="fld-label">Email</label>
            <input className="fld" type="email" value={email} placeholder="you@company.com" onChange={(e) => { setEmail(e.target.value); setFormErr(null); }} />
            <label className="fld-label">Password</label>
            <input className="fld" type="password" value={password} placeholder="At least 8 characters" onChange={(e) => { setPassword(e.target.value); setFormErr(null); }} />
            {formErr ? <div className="form-error">{formErr}</div> : null}
            <button className="primary-btn auth-submit" type="submit">Create account &amp; join</button>
          </form>
          <div className="auth-alt">Already have an account? <a href={'/login?next=' + encodeURIComponent('/invite/' + token)}>Sign in</a> — you'll come back here.</div>
        </div>
      </MWAuthShell>
    );
  }

  Object.assign(window, { MWLogin, MWSignup, MWInvitePage, MWAuthShell });
})();
