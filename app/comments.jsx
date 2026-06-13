// Markwise — Google-Docs-style anchored comments.
// A comment thread lives in the `comments` table; its visual anchor is a
// <mark class="cmt" data-cid="…"> wrapper inside the block HTML (persisted by
// the normal document save). This module owns two presentations of those
// threads — floating cards in the right margin (anchored next to their section)
// and a full-width rail (opened from the toolbar) — plus the DOM helpers that
// create / remove / locate the anchors.
(function () {
  const { useState, useRef, useEffect, useLayoutEffect } = React;

  const SHEET = () => document.querySelector('.sheet');
  const newCid = () => 'c' + Math.random().toString(36).slice(2, 10);

  function notifyBlock(node) {
    const tb = node && (node.nodeType === 1 ? node : node.parentElement);
    const block = tb && tb.closest && tb.closest('.tb[data-block-id]');
    if (block) block.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function wrapRange(cid) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const quote = range.toString().trim();
    const sheet = SHEET();
    if (!sheet) return null;
    const blocks = [...sheet.querySelectorAll('.tb[data-block-id]')].filter((b) => range.intersectsNode(b));
    const ids = [];
    blocks.forEach((b) => {
      const r = document.createRange();
      if (b.contains(range.startContainer)) r.setStart(range.startContainer, range.startOffset);
      else r.setStart(b, 0);
      if (b.contains(range.endContainer)) r.setEnd(range.endContainer, range.endOffset);
      else r.setEnd(b, b.childNodes.length);
      if (r.collapsed) return;
      const mark = document.createElement('mark');
      mark.className = 'cmt';
      mark.setAttribute('data-cid', cid);
      try { r.surroundContents(mark); }
      catch (e) { mark.appendChild(r.extractContents()); r.insertNode(mark); }
      ids.push(b.getAttribute('data-block-id'));
      notifyBlock(mark);
    });
    sel.removeAllRanges();
    return ids.length ? { blockIds: ids, quote: quote.slice(0, 300) } : null;
  }

  function wrapBlocks(cid, blockIds) {
    const sheet = SHEET();
    if (!sheet) return null;
    const ids = [];
    let quote = '';
    blockIds.forEach((bid) => {
      const b = sheet.querySelector('.tb[data-block-id="' + bid + '"]');
      if (!b || !(b.textContent || '').trim()) return;
      quote += (quote ? ' ' : '') + (b.textContent || '').trim();
      const mark = document.createElement('mark');
      mark.className = 'cmt';
      mark.setAttribute('data-cid', cid);
      while (b.firstChild) mark.appendChild(b.firstChild);
      b.appendChild(mark);
      ids.push(bid);
      notifyBlock(mark);
    });
    return ids.length ? { blockIds: ids, quote: quote.slice(0, 300) } : null;
  }

  function unwrap(cid) {
    const sheet = SHEET();
    if (!sheet) return;
    sheet.querySelectorAll('mark.cmt[data-cid="' + cid + '"]').forEach((m) => {
      const parent = m.parentNode;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      if (parent.normalize) parent.normalize();
      notifyBlock(parent);
    });
  }

  function applyMarkStates(comments, activeCid) {
    const sheet = SHEET();
    if (!sheet) return;
    const resolvedBy = {};
    comments.forEach((c) => { if (!c.parent_id && c.cid) resolvedBy[c.cid] = !!c.resolved; });
    sheet.querySelectorAll('mark.cmt[data-cid]').forEach((m) => {
      const cid = m.getAttribute('data-cid');
      m.classList.toggle('resolved', !!resolvedBy[cid]);
      m.classList.toggle('active', cid === activeCid && !resolvedBy[cid]);
    });
  }

  function scrollToCid(cid) {
    const sheet = SHEET();
    const m = sheet && sheet.querySelector('mark.cmt[data-cid="' + cid + '"]');
    if (!m) return;
    m.scrollIntoView({ block: 'center', behavior: 'smooth' });
    m.classList.add('flash');
    setTimeout(() => m.classList.remove('flash'), 1100);
  }

  function ago(ts) {
    if (!ts) return '';
    const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
    const d = Math.floor(h / 24); if (d < 7) return d + 'd ago';
    return new Date(ts).toLocaleDateString();
  }

  const initialOf = (u) => ((u && (u.author_name || u.name || u.author_email || u.email)) || '?').charAt(0).toUpperCase();

  // ---- composer (new comment / reply) with @mention autocomplete ----
  function Composer({ placeholder, members, onSubmit, onCancel, autoFocus, submitLabel }) {
    const [val, setVal] = useState('');
    const [men, setMen] = useState(null);
    const ta = useRef(null);
    useEffect(() => { if (autoFocus && ta.current) ta.current.focus(); }, []);
    const onChange = (e) => {
      const v = e.target.value;
      setVal(v);
      const upto = v.slice(0, e.target.selectionStart);
      const m = /@([\w.\-]*)$/.exec(upto);
      if (m && members && members.length) {
        const q = m[1].toLowerCase();
        const items = members
          .filter((u) => (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
          .slice(0, 5);
        setMen(items.length ? items : null);
      } else setMen(null);
    };
    const pick = (u) => {
      setVal((v) => v.replace(/@([\w.\-]*)$/, '@' + (u.name || u.email).replace(/\s+/g, ' ') + ' '));
      setMen(null);
      if (ta.current) ta.current.focus();
    };
    const submit = () => { const b = val.trim(); if (!b) return; onSubmit(b); setVal(''); setMen(null); };
    return (
      <div className="cmt-composer" onClick={(e) => e.stopPropagation()}>
        <textarea
          ref={ta}
          className="cmt-ta"
          rows={2}
          placeholder={placeholder}
          value={val}
          onChange={onChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
            if (e.key === 'Escape' && onCancel) onCancel();
          }}
        />
        {men ? (
          <div className="cmt-mentions">
            {men.map((u) => (
              <button key={u.id} className="cmt-mention" onMouseDown={(e) => { e.preventDefault(); pick(u); }}>
                <span className="cmt-ava xs">{initialOf(u)}</span>
                <span>{u.name || u.email}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="cmt-actions">
          <button className="primary-btn xs" onMouseDown={(e) => { e.preventDefault(); submit(); }}>{submitLabel || 'Comment'}</button>
          {onCancel ? <button className="ghost-btn xs" onMouseDown={(e) => { e.preventDefault(); onCancel(); }}>Cancel</button> : null}
          <span className="cmt-hint">⌘↵</span>
        </div>
      </div>
    );
  }

  function CommentRow({ c, reply, canDelete, onDelete }) {
    return (
      <div className={'cmt-row' + (reply ? ' reply' : '')}>
        <span className="cmt-ava">{initialOf(c)}</span>
        <div className="cmt-body">
          <div className="cmt-meta">
            <b>{c.author_name || c.author_email || 'Someone'}</b>
            <span className="cmt-time">{ago(c.created_at)}</span>
            {canDelete ? (
              <button className="cmt-del" title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}>✕</button>
            ) : null}
          </div>
          <div className="cmt-text">{c.body}</div>
        </div>
      </div>
    );
  }

  // A single thread. `compact` (and not active) collapses it to a preview.
  function Thread(props) {
    const { c, comments, members, user, activeCid, compact, onActivate, onReply, onResolve, onDelete } = props;
    const [replying, setReplying] = useState(false);
    const replies = comments.filter((r) => r.parent_id === c.id).sort((a, b) => a.id - b.id);
    const active = activeCid === c.cid;

    if (compact && !active) {
      return (
        <div className="cmt-thread compact" data-cid={c.cid} onClick={() => onActivate(c.cid)}>
          <CommentRow c={c} />
          {replies.length ? <div className="cmt-more">{replies.length} repl{replies.length > 1 ? 'ies' : 'y'}</div> : null}
        </div>
      );
    }
    return (
      <div
        className={'cmt-thread' + (active ? ' active' : '') + (c.resolved ? ' resolved' : '')}
        data-cid={c.cid}
        onClick={() => onActivate(c.cid)}
      >
        {c.anchor && c.anchor.quote ? <div className="cmt-quote">“{c.anchor.quote}”</div> : null}
        <CommentRow c={c} canDelete={user && c.author_id === user.id} onDelete={onDelete} />
        {replies.map((r) => (
          <CommentRow key={r.id} c={r} reply canDelete={user && r.author_id === user.id} onDelete={onDelete} />
        ))}
        {replying ? (
          <Composer
            placeholder="Reply…"
            members={members}
            autoFocus
            submitLabel="Reply"
            onSubmit={(b) => { onReply(c.id, b); setReplying(false); }}
            onCancel={() => setReplying(false)}
          />
        ) : (
          <div className="cmt-thread-actions">
            <button className="ghost-btn xs" onClick={(e) => { e.stopPropagation(); setReplying(true); }}>Reply</button>
            <button className="ghost-btn xs" onClick={(e) => { e.stopPropagation(); onResolve(c.id, c.resolved); }}>
              {c.resolved ? 'Reopen' : 'Resolve'}
            </button>
          </div>
        )}
      </div>
    );
  }

  function DraftCard({ draft, members, onSubmitNew, onCancelNew }) {
    return (
      <div className="cmt-thread active draft" data-cid={draft.cid}>
        {draft.anchor && draft.anchor.quote ? <div className="cmt-quote">“{draft.anchor.quote}”</div> : null}
        <Composer placeholder="Add a comment…" members={members} autoFocus submitLabel="Comment" onSubmit={onSubmitNew} onCancel={onCancelNew} />
      </div>
    );
  }

  // ---- floating margin cards: each thread anchored next to its section ----
  function FloatingComments(props) {
    const { comments, draft, members, user, activeCid, docRev } = props;
    const { onActivate, onSubmitNew, onCancelNew, onReply, onResolve, onDelete } = props;
    const refs = useRef({});
    const [tops, setTops] = useState({});
    const [leftPx, setLeftPx] = useState(null);
    const [tick, setTick] = useState(0);
    const CARD_W = 276;

    const cards = [];
    if (draft) cards.push({ cid: draft.cid, draft: true });
    comments.filter((c) => !c.parent_id && !c.resolved).forEach((c) => cards.push({ cid: c.cid, thread: c }));

    // Measure each card's anchor position, then stack downward so they never
    // overlap (active card expands, pushing the rest down — like Google Docs).
    useLayoutEffect(() => {
      const scroll = document.querySelector('.doc-scroll');
      if (!scroll) return;
      const docRect = scroll.getBoundingClientRect();
      const sTop = docRect.top;
      // anchor the cards just to the right of the page edge (not the window edge)
      const sheetEl = scroll.querySelector('.sheet');
      if (sheetEl) {
        const sr = sheetEl.getBoundingClientRect();
        let lp = sr.right - docRect.left + 20;
        const maxLeft = scroll.clientWidth - CARD_W - 8;
        if (lp > maxLeft) lp = maxLeft;
        if (lp < 8) lp = 8;
        setLeftPx(lp);
      }
      const measured = cards
        .map((card) => {
          const mark = scroll.querySelector('mark.cmt[data-cid="' + card.cid + '"]');
          const anchorTop = mark ? (mark.getBoundingClientRect().top - sTop + scroll.scrollTop) : null;
          return { cid: card.cid, anchorTop };
        })
        .filter((m) => m.anchorTop != null)
        .sort((a, b) => a.anchorTop - b.anchorTop);
      let prevBottom = -Infinity;
      const pos = {};
      measured.forEach((m) => {
        const el = refs.current[m.cid];
        const h = el ? el.offsetHeight : 96;
        const top = Math.max(m.anchorTop, prevBottom + 10);
        pos[m.cid] = top;
        prevBottom = top + h;
      });
      setTops(pos);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [comments, draft, activeCid, docRev, tick]);

    useEffect(() => {
      const onR = () => setTick((t) => t + 1);
      window.addEventListener('resize', onR);
      return () => window.removeEventListener('resize', onR);
    }, []);

    return (
      <React.Fragment>
        {cards.map((card) => (
          <div
            key={card.cid}
            ref={(el) => (refs.current[card.cid] = el)}
            className={'cmt-float' + (activeCid === card.cid || card.draft ? ' active' : '')}
            style={{
              top: (tops[card.cid] != null ? tops[card.cid] : 0),
              left: (leftPx != null ? leftPx : undefined),
              visibility: tops[card.cid] != null && leftPx != null ? 'visible' : 'hidden',
            }}
          >
            {card.draft ? (
              <DraftCard draft={draft} members={members} onSubmitNew={onSubmitNew} onCancelNew={onCancelNew} />
            ) : (
              <Thread
                c={card.thread}
                comments={comments}
                members={members}
                user={user}
                activeCid={activeCid}
                compact
                onActivate={onActivate}
                onReply={onReply}
                onResolve={onResolve}
                onDelete={onDelete}
              />
            )}
          </div>
        ))}
      </React.Fragment>
    );
  }

  // ---- full-width rail (opened from the toolbar) — the list view ----
  function CommentsRail(props) {
    const { comments, draft, members, user, activeCid } = props;
    const { onActivate, onSubmitNew, onCancelNew, onReply, onResolve, onDelete, onClose } = props;
    const [showResolved, setShowResolved] = useState(false);
    const tops = comments.filter((c) => !c.parent_id);
    const openThreads = tops.filter((c) => !c.resolved);
    const resolvedThreads = tops.filter((c) => c.resolved);
    const threadProps = { comments, members, user, activeCid, onActivate, onReply, onResolve, onDelete };

    return (
      <aside className="panel comments-rail" data-screen-label="Comments">
        <div className="panel-head">
          <span className="panel-title">Comments {openThreads.length ? <span className="cmt-count">{openThreads.length}</span> : null}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close comments">✕</button>
        </div>
        <div className="panel-body cmt-list">
          {draft ? <DraftCard draft={draft} members={members} onSubmitNew={onSubmitNew} onCancelNew={onCancelNew} /> : null}

          {!draft && !openThreads.length && !resolvedThreads.length ? (
            <div className="cmt-empty">
              <p>No comments yet.</p>
              <p className="cmt-empty-hint">Select text in the document and click the 💬 comment button to start a thread.</p>
            </div>
          ) : null}

          {openThreads.map((c) => <Thread key={c.id} c={c} {...threadProps} />)}

          {resolvedThreads.length ? (
            <div className="cmt-resolved-sect">
              <button className="cmt-resolved-toggle" onClick={() => setShowResolved((s) => !s)}>
                {showResolved ? '▾' : '▸'} Resolved ({resolvedThreads.length})
              </button>
              {showResolved ? resolvedThreads.map((c) => <Thread key={c.id} c={c} {...threadProps} />) : null}
            </div>
          ) : null}
        </div>
      </aside>
    );
  }

  function mentionsIn(body, members) {
    if (!members || !members.length) return [];
    const text = String(body).replace(/ /g, ' ');
    const ids = [];
    members.forEach((u) => {
      const name = (u.name || '').trim();
      if (name) {
        const re = new RegExp('@' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?!\\w)', 'i');
        if (re.test(text)) ids.push(u.id);
      }
      if (u.email && text.includes('@' + u.email)) ids.push(u.id);
    });
    return [...new Set(ids)];
  }

  window.GlyphComments = {
    CommentsRail,
    FloatingComments,
    newCid,
    wrapRange,
    wrapBlocks,
    unwrap,
    applyMarkStates,
    scrollToCid,
    mentionsIn,
  };
})();
