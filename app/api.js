// Markwise — shared API client + auth boot. Plain JS, loaded before the app bundles.
(function () {
  async function req(method, url, body) {
    const r = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(data.error || r.statusText);
      err.status = r.status;
      err.data = data; // keep the structured body (e.g. quota code/behavior)
      throw err;
    }
    return data;
  }

  const API = {
    get: (u) => req('GET', u),
    post: (u, b) => req('POST', u, b),
    put: (u, b) => req('PUT', u, b),
    del: (u) => req('DELETE', u),

    async me() {
      try { return await req('GET', '/api/auth/me'); }
      catch (e) { if (e.status === 401) return null; throw e; }
    },

    /** Require a signed-in user; redirect to login otherwise.
     *  Invite links get their own landing page that shows the company and
     *  role before asking for an account. */
    async requireUser() {
      const user = await API.me();
      if (!user) {
        const invite = new URLSearchParams(location.search).get('invite');
        location.href = invite
          ? '/invite/' + encodeURIComponent(invite)
          : '/login?next=' + encodeURIComponent(location.pathname + location.search);
        return null;
      }
      return user;
    },

    /** Editor boot: signed-in user + the doc from ?doc=. Redirects as needed. */
    async boot() {
      const user = await API.requireUser();
      if (!user) return null;
      const id = new URLSearchParams(location.search).get('doc');
      if (!id) { location.href = '/docs'; return null; }
      try {
        const doc = await req('GET', '/api/docs/' + id);
        window.MW_USER = user;
        window.MW_DOC = doc;
        return { user, doc };
      } catch (e) {
        alert(e.message || 'Could not open this document');
        location.href = '/docs';
        return null;
      }
    },

    saveDoc(id, patch) { return req('PUT', '/api/docs/' + id, patch); },
    logout: async () => { await req('POST', '/api/auth/logout'); location.href = '/login'; },

    // ---- saved presentation/deck ----
    getDeck(docId) { return req('GET', '/api/docs/' + docId + '/deck'); },
    saveDeck(docId, deck) { return req('PUT', '/api/docs/' + docId + '/deck', { deck }); },

    // ---- comments ----
    listComments(docId) { return req('GET', '/api/docs/' + docId + '/comments'); },
    addComment(docId, payload) { return req('POST', '/api/docs/' + docId + '/comments', payload); },
    replyComment(docId, parentId, body, mentions) {
      return req('POST', '/api/docs/' + docId + '/comments', { parent_id: parentId, body, mentions: mentions || [] });
    },
    resolveComment(docId, commentId, reopen) {
      return req('POST', '/api/docs/' + docId + '/comments/' + commentId + '/resolve', { reopen: !!reopen });
    },
    deleteComment(docId, commentId) { return req('DELETE', '/api/docs/' + docId + '/comments/' + commentId); },

    // ---- presence (heartbeat → others + doc version) ----
    heartbeat(docId, editingBlock) {
      return req('POST', '/api/docs/' + docId + '/presence', { editing_block: editingBlock || null });
    },
  };

  window.MarkwiseAPI = API;

  // AI bridge: the app's prompts call window.claude.complete(prompt); route it
  // through the backend's provider layer (Codex / Claude Code / Claude).
  window.claude = window.claude || {};
  window.claude.complete = async function (prompt) {
    const body = { prompt };
    if (window.MW_DOC && window.MW_DOC.company_id) body.company_id = window.MW_DOC.company_id;
    try {
      const out = await req('POST', '/api/ai/complete', body);
      return out.text;
    } catch (e) {
      // Out of AI credits: tell the editor so it can notify the user (when the
      // org/global behaviour is 'block'). Either way we re-throw so the caller's
      // deterministic offline parser still produces a visual.
      if (e && e.data && e.data.code === 'quota_exceeded') {
        window.dispatchEvent(new CustomEvent('mw-ai-quota', { detail: e.data }));
      }
      throw e;
    }
  };
})();
