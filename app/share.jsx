// Markwise — public read-only shared-document viewer. Mounted by share.html.
(function () {
  // The block HTML comes from the doc author's contentEditable — fine inside the
  // authed editor, but this page is public, so strip anything executable.
  function sanitizeHtml(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html || '');
    tpl.content.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach((n) => n.remove());
    tpl.content.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((a) => {
        const name = a.name.toLowerCase();
        if (name.startsWith('on') || ((name === 'href' || name === 'src' || name === 'xlink:href') && /^\s*(javascript|data|vbscript):/i.test(a.value))) {
          el.removeAttribute(a.name);
        }
      });
    });
    return tpl.innerHTML;
  }

  function Viewer({ doc }) {
    return (
      <div className="doc-sheet">
        <h1 className="doc-title">{doc.title}</h1>
        <div className="doc-meta">Shared read-only · last updated {new Date(doc.updated_at).toLocaleDateString()}</div>
        <div className="doc-body">
          {(doc.blocks || []).map((b) => {
            if (b.kind === 'visual' && b.visual) {
              return (
                <figure key={b.id} className="vis-block" style={{ width: (b.visual.width || 100) + '%' }}>
                  <window.Diagram visual={b.visual} />
                </figure>
              );
            }
            const Tag = ['h1', 'h2', 'h3', 'p', 'blockquote'].includes(b.tag) ? b.tag : 'p';
            return <Tag key={b.id} dangerouslySetInnerHTML={{ __html: sanitizeHtml(b.html) }} />;
          })}
        </div>
      </div>
    );
  }

  async function boot() {
    const root = ReactDOM.createRoot(document.getElementById('root'));
    // Clean URL: /share/<token>. Falls back to the legacy /share.html?t=<token>.
    const fromPath = (location.pathname.match(/^\/share\/(.+)$/) || [])[1];
    const token = fromPath ? decodeURIComponent(fromPath) : new URLSearchParams(location.search).get('t');
    if (!token) {
      root.render(<div className="state">This share link is incomplete.</div>);
      return;
    }
    try {
      const r = await fetch('/api/shared/' + encodeURIComponent(token));
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Not found');
      const doc = await r.json();
      document.title = doc.title + ' — Markwise';
      root.render(
        <React.Fragment>
          <Viewer doc={doc} />
          <div className="footer-note">Made with <a href="/signup">Markwise</a> — write, visualize, present.</div>
        </React.Fragment>
      );
    } catch (e) {
      root.render(<div className="state">This share link is invalid or has been revoked.</div>);
    }
  }
  boot();
})();
