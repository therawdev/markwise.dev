// Markwise account pages — shared vanilla UI (topbar, avatar, bell, palette, toast).
// Dependency-free; pages call MWUI.topbar(user, opts) after MarkwiseAPI auth.
(function () {
  const esc = (s) => { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; };

  function hueFor(s) {
    let h = 0;
    for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) % 360;
    return h;
  }
  function avatar(name, size) {
    const sz = size || 28;
    const initials = String(name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    return '<span class="av" style="width:' + sz + 'px;height:' + sz + 'px;font-size:' + Math.round(sz * 0.4) +
      'px;background:oklch(0.52 0.11 ' + hueFor(name || 'x') + ')">' + esc(initials) + '</span>';
  }
  function pill(tone, text) { return '<span class="pill ' + (tone || 'grey') + '">' + esc(text) + '</span>'; }

  function ago(ts) {
    const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60);
    if (h < 24) return h + ' h ago';
    const dd = Math.round(h / 24);
    return dd + (dd === 1 ? ' day ago' : ' days ago');
  }

  // ---------- toast (supports an action button, e.g. Undo) ----------
  let toastEl = null, toastTimer = null;
  function toast(msg, action) {
    if (toastEl) toastEl.remove();
    clearTimeout(toastTimer);
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button class="toast-act">' + esc(action.label) + '</button>' : '');
    if (action) toastEl.querySelector('.toast-act').onclick = () => { hide(); action.fn(); };
    document.body.appendChild(toastEl);
    const hide = () => { if (toastEl) { toastEl.remove(); toastEl = null; } };
    toastTimer = setTimeout(hide, action ? 5200 : 2400);
  }

  // ---------- action labels for notifications ----------
  const ACTION_LABELS = {
    'invite.create': 'generated an invite link',
    'invite.delete': 'deleted an invite link',
    'invite.accept': 'accepted an invite',
    'user.signup': 'signed up',
    'member.remove': 'removed a member',
    'member.restore': 'restored a member',
    'member.role': 'changed a member’s role',
    'role.create': 'created a role',
    'role.update': 'updated a role',
    'role.delete': 'deleted a role',
    'doc.create': 'created a document',
    'doc.update': 'renamed a document',
    'doc.delete': 'deleted a document',
    'doc.restore': 'restored a document',
    'doc.purge': 'permanently deleted a document',
    'company.create': 'created a company',
    'company.update': 'updated company settings',
    'company.delete': 'deleted a company',
    'billing.update': 'changed the plan',
    'admin.user_status': 'changed a user’s status',
    'admin.company_status': 'changed a company’s status',
    'admin.ai_provider': 'switched the AI provider',
    'admin.platform': 'changed platform settings',
    'admin.impersonate': 'signed in as a user',
    'user.update': 'updated their profile',
    'user.password': 'changed their password',
    'user.apikey': 'managed an API key',
    'user.delete': 'deleted their account',
  };

  // ---------- topbar ----------
  // opts: { back: bool, active: 'docs'|'admin'|..., onSearchItems: () => [...] extra palette items }
  function topbar(user, opts) {
    opts = opts || {};
    const host = document.createElement('div');
    host.innerHTML =
      '<header class="topbar">' +
        '<a class="brand" href="/docs.html"><span class="brand-mark"></span><span class="brand-name">Markwise</span></a>' +
        (opts.back ? '<a class="back-link" href="/docs.html">← Documents</a>' : '') +
        '<div class="topbar-right">' +
          '<button class="pal-btn" id="mwPalBtn" title="Search (Ctrl+K)">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>' +
            '<span>Search</span><kbd>Ctrl K</kbd></button>' +
          (user.is_app_owner ? '<a class="ghost-btn as-link" href="/admin.html">Admin panel</a>' : '') +
          '<div class="bell-wrap" id="mwBellWrap"><button class="bell" id="mwBell" title="Notifications">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.7 21a2 2 0 0 1-3.4 0"></path></svg>' +
          '</button></div>' +
          '<div class="avatar-wrap" id="mwAvWrap"><button class="avatar-btn" id="mwAvBtn" title="' + esc(user.email) + '">' + avatar(user.name, 30) + '</button></div>' +
        '</div>' +
      '</header>' +
      '<div id="mwBars"></div>';
    const header = host.firstChild;
    document.body.prepend(host);

    // avatar menu
    const avWrap = host.querySelector('#mwAvWrap');
    host.querySelector('#mwAvBtn').onclick = (e) => {
      e.stopPropagation();
      const old = avWrap.querySelector('.avatar-menu');
      if (old) { old.remove(); return; }
      const m = document.createElement('div');
      m.className = 'avatar-menu';
      m.innerHTML =
        '<div class="menu-head"><b>' + esc(user.name) + '</b><span>' + esc(user.email) + '</span>' +
          (user.is_app_owner ? '<span class="pill blue sm">App owner</span>' : '') + '</div>' +
        '<a class="menu-item" href="/settings.html">Account settings</a>' +
        (user.is_app_owner ? '<a class="menu-item" href="/admin.html">Admin panel</a>' : '') +
        (user.impersonated_by ? '<button class="menu-item" id="mwReturn2">Return to admin</button>' : '') +
        '<button class="menu-item signout" id="mwSignout">Sign out</button>';
      m.onclick = (e2) => e2.stopPropagation();
      m.querySelector('#mwSignout').onclick = () => MarkwiseAPI.logout();
      const r2 = m.querySelector('#mwReturn2');
      if (r2) r2.onclick = returnToAdmin;
      avWrap.appendChild(m);
      const close = () => { m.remove(); window.removeEventListener('click', close); };
      setTimeout(() => window.addEventListener('click', close), 0);
    };

    // impersonation / maintenance bars
    const bars = host.querySelector('#mwBars');
    async function returnToAdmin() {
      try { await MarkwiseAPI.post('/api/admin/impersonate/stop'); location.href = '/admin.html'; }
      catch (e) { toast(e.message); }
    }
    if (user.impersonated_by) {
      const b = document.createElement('div');
      b.className = 'impersonate-bar';
      b.innerHTML = '<span>Viewing as <b>' + esc(user.email) + '</b> — actions are recorded as this user.</span><button>Return to admin</button>';
      b.querySelector('button').onclick = returnToAdmin;
      bars.appendChild(b);
    }
    MarkwiseAPI.get('/api/platform').then((p) => {
      if (p.maintenance && !user.is_app_owner) {
        const b = document.createElement('div');
        b.className = 'maint-bar';
        b.textContent = 'Markwise is in maintenance mode — some actions may be temporarily unavailable.';
        bars.appendChild(b);
      }
    }).catch(() => {});

    // notifications bell
    const bellWrap = host.querySelector('#mwBellWrap');
    const bell = host.querySelector('#mwBell');
    let notifCache = null;
    function renderBadge(unread) {
      const old = bell.querySelector('.bell-badge');
      if (old) old.remove();
      if (unread > 0) {
        const b = document.createElement('span');
        b.className = 'bell-badge';
        b.textContent = unread > 9 ? '9+' : String(unread);
        bell.appendChild(b);
      }
    }
    MarkwiseAPI.get('/api/auth/notifications').then((n) => { notifCache = n; renderBadge(n.unread); }).catch(() => {});
    bell.onclick = async (e) => {
      e.stopPropagation();
      const old = bellWrap.querySelector('.notif-menu');
      if (old) { old.remove(); return; }
      const n = notifCache || (await MarkwiseAPI.get('/api/auth/notifications').catch(() => ({ items: [], unread: 0 })));
      const m = document.createElement('div');
      m.className = 'notif-menu';
      m.innerHTML = '<div class="notif-head">Notifications</div>' + (
        !n.items.length
          ? '<div class="notif-empty">Nothing yet — activity from your teams shows up here.</div>'
          : n.items.slice(0, 10).map((it) => {
              const who = it.actor_email || 'someone';
              return '<div class="notif-item">' + avatar(who.split('@')[0].replace(/[._]/g, ' '), 26) +
                '<span><b>' + esc(who === user.email ? 'You' : who) + '</b> ' +
                esc(ACTION_LABELS[it.action] || it.action) +
                '<span class="when"> · ' + esc(new Date(it.created_at).toLocaleString()) + '</span></span></div>';
            }).join('')
      );
      m.onclick = (e2) => e2.stopPropagation();
      bellWrap.appendChild(m);
      if (n.unread > 0) {
        MarkwiseAPI.post('/api/auth/notifications/seen').then(() => { if (notifCache) notifCache.unread = 0; renderBadge(0); }).catch(() => {});
      }
      const close = () => { m.remove(); window.removeEventListener('click', close); };
      setTimeout(() => window.addEventListener('click', close), 0);
    };

    // command palette
    host.querySelector('#mwPalBtn').onclick = () => openPalette(user, opts);
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') { e.preventDefault(); openPalette(user, opts); }
    });

    return { toast, refreshBell: () => MarkwiseAPI.get('/api/auth/notifications').then((n) => { notifCache = n; renderBadge(n.unread); }).catch(() => {}) };
  }

  // ---------- command palette ----------
  let palOpen = false;
  async function openPalette(user, opts) {
    if (palOpen) return;
    palOpen = true;
    const overlay = document.createElement('div');
    overlay.className = 'pal-overlay';
    overlay.innerHTML =
      '<div class="pal-box"><input class="pal-input" placeholder="Search documents, companies, pages…">' +
      '<div class="pal-list"></div>' +
      '<div class="pal-foot"><span>↑↓ navigate</span><span>↵ open</span><span>esc close</span></div></div>';
    document.body.appendChild(overlay);
    const input = overlay.querySelector('.pal-input');
    const listEl = overlay.querySelector('.pal-list');
    input.focus();

    let items = [
      { kind: 'Page', label: 'Documents', go: () => { location.href = '/docs.html'; } },
      { kind: 'Page', label: 'Account settings', go: () => { location.href = '/settings.html'; } },
    ];
    if (user.is_app_owner) items.push({ kind: 'Page', label: 'Admin panel', go: () => { location.href = '/admin.html'; } });
    (user.memberships || []).forEach((mb) => {
      items.push({ kind: 'Company', label: mb.company_name || ('Company ' + mb.company_id), go: () => { location.href = '/org.html?id=' + mb.company_id; } });
    });
    // docs load async, slot in as they arrive
    MarkwiseAPI.get('/api/docs').then((docs) => {
      items = items.concat(docs.map((d) => ({ kind: 'Document', label: d.title || 'Untitled document', go: () => { location.href = '/index.html?doc=' + d.id; } })));
      render();
    }).catch(() => {});

    let idx = 0;
    let shown = [];
    function render() {
      const q = input.value.trim().toLowerCase();
      shown = items.filter((i) => !q || i.label.toLowerCase().indexOf(q) !== -1).slice(0, 9);
      if (idx >= shown.length) idx = Math.max(0, shown.length - 1);
      listEl.innerHTML = !shown.length
        ? '<div class="pal-empty">No matches for “' + esc(input.value) + '”.</div>'
        : shown.map((item, i) =>
            '<button class="pal-item' + (i === idx ? ' on' : '') + '" data-i="' + i + '">' +
              '<span class="pal-kind">' + esc(item.kind) + '</span>' +
              '<span class="pal-label">' + esc(item.label) + '</span>' +
              (i === idx ? '<kbd>↵</kbd>' : '') + '</button>'
          ).join('');
      listEl.querySelectorAll('.pal-item').forEach((b) => {
        b.onmouseenter = () => { idx = Number(b.dataset.i); render(); };
        b.onclick = () => pick(shown[Number(b.dataset.i)]);
      });
    }
    function close() { overlay.remove(); palOpen = false; window.removeEventListener('keydown', onEsc); }
    function pick(item) { if (item) { close(); item.go(); } }
    function onEsc(e) { if (e.key === 'Escape') close(); }
    window.addEventListener('keydown', onEsc);
    overlay.onmousedown = (e) => { if (e.target === overlay) close(); };
    input.oninput = () => { idx = 0; render(); };
    input.onkeydown = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, shown.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); pick(shown[idx]); }
    };
    render();
  }

  // ---------- tabs ----------
  // tabs: [{id, label, count}] — returns {set, el}
  function tabs(host, defs, onChange, initial) {
    const el = document.createElement('div');
    el.className = 'tabs';
    let value = initial || defs[0].id;
    function render() {
      el.innerHTML = defs.map((t) =>
        '<button data-t="' + t.id + '" class="' + (value === t.id ? 'on' : '') + '">' + esc(t.label) +
        (t.count != null ? '<span class="count">' + t.count + '</span>' : '') + '</button>'
      ).join('');
      el.querySelectorAll('button').forEach((b) => {
        b.onclick = () => { value = b.dataset.t; render(); onChange(value); };
      });
    }
    render();
    host.appendChild(el);
    return { set: (v) => { value = v; render(); onChange(v); }, get: () => value, update: (newDefs) => { defs = newDefs; render(); } };
  }

  function copy(text, msg) {
    const done = () => toast(msg || 'Copied to clipboard');
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

  window.MWUI = { esc, hueFor, avatar, pill, ago, toast, topbar, tabs, copy, ACTION_LABELS };
})();
