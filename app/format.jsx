// Markwise — selection formatting toolbar + left-margin Visualize affordance.
(function () {
  const { useState, useRef, useEffect } = React;

  function cmdState(c) {
    try { return document.queryCommandState(c); } catch (e) { return false; }
  }

  // After manual DOM edits (wrapping in <code>/<pre>/<mark>), tell React the block changed.
  function notifyBlock(node) {
    const tb = node && (node.nodeType === 1 ? node : node.parentElement);
    const block = tb && tb.closest && tb.closest('.tb[data-block-id]');
    if (block) block.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Wrap the current selection in a fresh <tag class=…>; returns true on success.
  function wrapSelection(tagName, className, attrs) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return false;
    const el = document.createElement(tagName);
    if (className) el.className = className;
    if (attrs) Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
    try {
      range.surroundContents(el);
    } catch (e) {
      el.appendChild(range.extractContents());
      range.insertNode(el);
    }
    notifyBlock(el);
    sel.removeAllRanges();
    return true;
  }

  // A speech-bubble icon shared by the toolbar buttons.
  const CommentIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-9 8.5 8.38 8.38 0 0 1-3.8-.9L3 20l1.9-5.2A8.38 8.38 0 0 1 4 11.5a8.5 8.5 0 0 1 17 0z" /></svg>
  );

  function FormatBar({ fab, onTag, onComment }) {
    // hooks must run unconditionally
    const [mode, setMode] = useState(null);   // null | 'link'
    const [val, setVal] = useState('');
    const savedRange = useRef(null);
    useEffect(() => { setMode(null); setVal(''); }, [fab && fab.blockId, fab && fab.text]);

    if (!fab) return null;
    const x = Math.min(Math.max(fab.x, 230), window.innerWidth - 230);

    // Multi-section (whole-block) selection: offer just a Comment action.
    if (fab.multi) {
      return (
        <div className="fmtbar fmtbar-mini" style={{ left: x, top: Math.max(fab.y, 70) }} onMouseDown={(e) => e.preventDefault()}>
          <button className="fmt-btn fmt-comment" title="Comment on these sections"
            onMouseDown={(e) => { e.preventDefault(); onComment && onComment(); }}>
            <CommentIcon /> <span style={{ fontSize: 12, fontWeight: 600 }}>Comment</span>
          </button>
        </div>
      );
    }

    const exec = (cmd, value) => (e) => {
      e.preventDefault();
      document.execCommand(cmd, false, value || null);
    };
    const wrap = (tag, cls) => (e) => { e.preventDefault(); wrapSelection(tag, cls); };

    const enterMode = (m) => (e) => {
      e.preventDefault();
      const sel = window.getSelection();
      savedRange.current = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      setMode(m);
      setVal('');
    };
    const restore = () => {
      const sel = window.getSelection();
      sel.removeAllRanges();
      if (savedRange.current) sel.addRange(savedRange.current);
    };
    const applyLink = () => {
      const url = val.trim();
      if (url) { restore(); document.execCommand('createLink', false, /^https?:\/\//i.test(url) ? url : 'https://' + url); }
      setMode(null);
    };

    const Btn = ({ label, title, on, onDown, children, style }) => (
      <button className={'fmt-btn' + (on ? ' on' : '')} title={title} style={style}
        onMouseDown={onDown}>{children || label}</button>
    );

    if (mode === 'link') {
      return (
        <div className="fmtbar fmtbar-input" style={{ left: x, top: Math.max(fab.y, 70) }} onMouseDown={(e) => { if (e.target.tagName !== 'INPUT') e.preventDefault(); }}>
          <input className="fmt-input" autoFocus placeholder="Paste or type a link…"
            value={val} onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } if (e.key === 'Escape') setMode(null); }} />
          <button className="fmt-apply" onMouseDown={(e) => { e.preventDefault(); applyLink(); }}>Link</button>
        </div>
      );
    }

    return (
      <div className="fmtbar" style={{ left: x, top: Math.max(fab.y, 70) }} onMouseDown={(e) => e.preventDefault()}>
        <Btn title="Bold" on={cmdState('bold')} onDown={exec('bold')} style={{ fontWeight: 800 }}>B</Btn>
        <Btn title="Italic" on={cmdState('italic')} onDown={exec('italic')} style={{ fontStyle: 'italic' }}>I</Btn>
        <Btn title="Strikethrough" on={cmdState('strikeThrough')} onDown={exec('strikeThrough')} style={{ textDecoration: 'line-through' }}>S</Btn>
        <Btn title="Underline" on={cmdState('underline')} onDown={exec('underline')} style={{ textDecoration: 'underline' }}>U</Btn>
        <Btn title="Inline code" onDown={wrap('code', 'mw-code')}><span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>&lt;&gt;</span></Btn>
        <span className="fmt-sep"></span>
        <Btn title="Heading 1" on={fab.tag === 'h1'} onDown={(e) => { e.preventDefault(); onTag(fab.blockId, 'h1', fab.lineIdx); }}>H<sub>1</sub></Btn>
        <Btn title="Heading 2" on={fab.tag === 'h2'} onDown={(e) => { e.preventDefault(); onTag(fab.blockId, 'h2', fab.lineIdx); }}>H<sub>2</sub></Btn>
        <span className="fmt-sep"></span>
        <Btn title="Bulleted list" onDown={exec('insertUnorderedList')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="4" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.3" fill="currentColor" stroke="none"/><path d="M9 6h11M9 12h11M9 18h11"/></svg>
        </Btn>
        <Btn title="Numbered list" onDown={exec('insertOrderedList')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 4.5v3M3.4 4.6 4 4.2M3.3 12.2h1.4L3.3 13.9h1.5M3.3 16.7h1.3v3.1H3.3M3.3 18.2h1.3"/></svg>
        </Btn>
        <Btn title="Decrease indent" onDown={exec('outdent')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 6H8M21 12H11M21 18H8M6 9l-3 3 3 3"/></svg>
        </Btn>
        <Btn title="Quote" onDown={(e) => { e.preventDefault(); document.execCommand('formatBlock', false, 'blockquote'); }}>
          <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>”</span>
        </Btn>
        <Btn title="Code block" onDown={wrap('pre', 'mw-pre')}><span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{'{}'}</span></Btn>
        <span className="fmt-sep"></span>
        <Btn title="Add link" onDown={enterMode('link')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>
        </Btn>
        <Btn title="Comment" onDown={(e) => { e.preventDefault(); onComment && onComment(); }}><CommentIcon /></Btn>
      </div>
    );
  }

  // Left-margin "turn this into a visual" circle — appears beside the selected text.
  function VizFab({ fab, onVisualize }) {
    if (!fab || !fab.canViz) return null;
    const sheet = document.querySelector('.sheet');
    if (!sheet) return null;
    const r = sheet.getBoundingClientRect();
    const left = Math.max(12, r.left - 52);
    const top = (fab.selTop != null ? fab.selTop : fab.y) - 4;
    return (
      <button className="viz-fab" style={{ left, top }} title="Visualize this text"
        onMouseDown={(e) => e.preventDefault()} onClick={onVisualize}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6.5" cy="17.5" r="2.2"/><circle cx="17.5" cy="6.5" r="2.2"/><circle cx="17.5" cy="17.5" r="2.2"/>
          <path d="M8.6 16.2 15.4 8M17.5 9v6"/>
        </svg>
      </button>
    );
  }

  window.GlyphFormat = { FormatBar, VizFab };
})();
