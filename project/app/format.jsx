// Glyph — selection formatting toolbar (bold/italic/underline/strike/highlight + block tags) with Visualize action
(function () {
  function cmdState(c) {
    try { return document.queryCommandState(c); } catch (e) { return false; }
  }

  function FormatBar({ fab, onVisualize, onTag }) {
    if (!fab) return null;
    const x = Math.min(Math.max(fab.x, 170), window.innerWidth - 170);
    const exec = (cmd, val) => (e) => {
      e.preventDefault();
      document.execCommand(cmd, false, val || null);
    };
    const B = ({ label, title, cmd, val, active, style }) => (
      <button
        className={'fmt-btn' + (active ? ' on' : '')}
        title={title}
        style={style}
        onMouseDown={exec(cmd, val)}
      >{label}</button>
    );
    return (
      <div className="fmtbar" style={{ left: x, top: Math.max(fab.y, 70) }} onMouseDown={(e) => e.preventDefault()}>
        <B label="B" title="Bold" cmd="bold" active={cmdState('bold')} style={{ fontWeight: 800 }} />
        <B label="I" title="Italic" cmd="italic" active={cmdState('italic')} style={{ fontStyle: 'italic' }} />
        <B label="U" title="Underline" cmd="underline" active={cmdState('underline')} style={{ textDecoration: 'underline' }} />
        <B label="S" title="Strikethrough" cmd="strikeThrough" active={cmdState('strikeThrough')} style={{ textDecoration: 'line-through' }} />
        <B label="✺" title="Highlight (amber)" cmd="hiliteColor" val="#fcefb4" />
        <B label="●" title="Highlight (indigo)" cmd="hiliteColor" val="#dfe0fb" style={{ color: '#5b5fd6', fontSize: 11 }} />
        <B label="●" title="Highlight (mint)" cmd="hiliteColor" val="#cfeede" style={{ color: '#2f9e6b', fontSize: 11 }} />
        <B label="A" title="Accent text color" cmd="foreColor" val="#4646c8" style={{ color: '#4646c8', fontWeight: 800 }} />
        <B label="⌫" title="Clear formatting" cmd="removeFormat" />
        <span className="fmt-sep"></span>
        <button className={'fmt-btn' + (fab.tag === 'p' ? ' on' : '')} title="Paragraph" onMouseDown={(e) => { e.preventDefault(); onTag(fab.blockId, 'p', fab.lineIdx); }}>¶</button>
        <button className={'fmt-btn' + (fab.tag === 'h2' || fab.tag === 'h3' ? ' on' : '')} title="Heading (click again to revert to paragraph)" onMouseDown={(e) => { e.preventDefault(); onTag(fab.blockId, 'h2', fab.lineIdx); }}>H</button>
        {fab.canViz ? (
          <React.Fragment>
            <span className="fmt-sep"></span>
            <button className="fmt-viz" onMouseDown={(e) => e.preventDefault()} onClick={onVisualize}>
              <span className="fab-spark">✦</span> Visualize
            </button>
          </React.Fragment>
        ) : null}
      </div>
    );
  }

  window.GlyphFormat = { FormatBar };
})();
