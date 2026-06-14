/* Markwise account SPA — history-API router + app root */
(function () {
  const { useState, useEffect, useRef, useCallback } = React;
  const API = window.MarkwiseAPI;

  const SPA_PREFIXES = ['/docs', '/org', '/admin', '/settings', '/login', '/signup', '/invite'];
  const isSpaPath = (p) => SPA_PREFIXES.some((pre) => p === pre || p.indexOf(pre + '/') === 0) || p === '/';

  function parsePath(pathname) {
    const p = pathname.replace(/\/+$/, '') || '/';
    if (p === '/' || p === '/docs') return { name: 'docs' };
    if (p === '/admin') return { name: 'admin' };
    if (p === '/settings') return { name: 'settings' };
    if (p === '/login') return { name: 'login' };
    if (p === '/signup') return { name: 'signup' };
    const org = p.match(/^\/org\/(\d+)(?:\/([a-z-]+))?$/);
    if (org) return { name: 'org', id: parseInt(org[1], 10), tab: org[2] || null };
    const inv = p.match(/^\/invite\/(.+)$/);
    if (inv) return { name: 'invite', token: decodeURIComponent(inv[1]) };
    return { name: 'docs' };
  }

  function MWApp() {
    const [me, setMe] = useState(undefined); // undefined = loading, null = signed out
    const [route, setRoute] = useState(() => parsePath(location.pathname));
    const [toast, setToast] = useState(null);
    const toastTimer = useRef(null);

    const reload = useCallback(() => API.me().then((u) => { setMe(u); return u; }), []);
    useEffect(() => { reload(); }, [reload]);

    const navigate = useCallback((path) => {
      if (location.pathname + location.search !== path) history.pushState({}, '', path);
      setRoute(parsePath(path.split('?')[0]));
      window.scrollTo(0, 0);
    }, []);

    useEffect(() => {
      const onPop = () => setRoute(parsePath(location.pathname));
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    }, []);

    // delegated client-side navigation for internal <a href="/...">
    useEffect(() => {
      const onClick = (e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const a = e.target.closest && e.target.closest('a[href]');
        if (!a) return;
        if (a.target && a.target !== '_self') return;
        const href = a.getAttribute('href');
        if (!href || href.indexOf('://') !== -1 || !href.startsWith('/')) return;
        const path = href.split('#')[0];
        if (!isSpaPath(path.split('?')[0])) return; // e.g. /index.html?doc= → full nav
        e.preventDefault();
        navigate(href);
      };
      document.addEventListener('click', onClick);
      return () => document.removeEventListener('click', onClick);
    }, [navigate]);

    const showToast = useCallback((msg, action) => {
      setToast({ msg, action: action || null });
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), action ? 5200 : 2400);
    }, []);

    if (me === undefined) return <div className="state" style={{ textAlign: 'center', padding: '120px 0', color: 'var(--grey)' }}>Loading…</div>;

    const ctx = { me, reload, navigate, toast: showToast };

    let page;
    if (route.name === 'invite') {
      page = <window.MWInvitePage ctx={ctx} token={route.token} />;
    } else if (!me) {
      if (route.name === 'signup') page = <window.MWSignup ctx={ctx} />;
      else page = <window.MWLogin ctx={ctx} />;
    } else if (route.name === 'login' || route.name === 'signup') {
      // already signed in → bounce to dashboard
      navigate('/docs');
      page = null;
    } else if (route.name === 'org') {
      page = <window.MWOrgPage ctx={ctx} companyId={route.id} tab={route.tab} />;
    } else if (route.name === 'admin') {
      page = me.is_app_owner ? <window.MWAdminPage ctx={ctx} /> : <window.MWDashboard ctx={ctx} />;
    } else if (route.name === 'settings') {
      page = <window.MWSettingsPage ctx={ctx} />;
    } else {
      page = <window.MWDashboard ctx={ctx} />;
    }

    return (
      <React.Fragment>
        {page}
        {me ? <window.MWPalette ctx={ctx} /> : null}
        {toast ? (
          <div className="toast">
            <span>{toast.msg}</span>
            {toast.action ? <button className="toast-act" onClick={() => { toast.action.fn(); setToast(null); }}>{toast.action.label}</button> : null}
          </div>
        ) : null}
      </React.Fragment>
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(<MWApp />);
})();
