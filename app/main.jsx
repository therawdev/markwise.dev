// Markwise — app root: state, selection handling, generation flow, persistence
(function () {
  const { useState, useEffect, useRef, useCallback } = React;
  const { PickerOverlay, EditPanel, ExportModal, ShareModal } = window.GlyphPanels;
  const { sampleBlocks, TextBlock, VisualBlock, HintPill } = window.GlyphEditor;
  const { FormatBar } = window.GlyphFormat;
  const { DocExportModal } = window.GlyphDocExport;
  const { DeckOverlay } = window.GlyphDeck;
  const { Canvas } = window.GlyphCanvas;
  const { galleryBlocks } = window.GlyphGallery;

  const LS_DOC = 'glyph-doc-v1';
  const LS_HINT = 'glyph-hint-dismissed-v1';
  const uid = () => 'v' + Math.random().toString(36).slice(2, 9);

  // group a contenteditable block's children into visual lines (divs/blocks = own line, <br> splits inline runs)
  function lineGroups(root) {
    const isBlk = (el) => el.nodeType === 1 && /^(DIV|P|H[1-6]|UL|OL|BLOCKQUOTE)$/.test(el.tagName);
    const groups = [];
    let cur = null;
    [...root.childNodes].forEach((k) => {
      if (isBlk(k)) { groups.push({ block: k, nodes: [k] }); cur = null; }
      else if (k.nodeName === 'BR') { cur = null; }
      else {
        if (!cur) { cur = { block: null, nodes: [] }; groups.push(cur); }
        cur.nodes.push(k);
      }
    });
    return groups.filter((g) => g.block ? (g.block.textContent || '').trim() : g.nodes.some((n) => (n.textContent || '').trim()));
  }

  function loadDoc() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_DOC));
      if (s && Array.isArray(s.blocks) && s.blocks.length) return s;
    } catch (e) { /* ignore */ }
    return { title: 'Orbit 2.0 Launch Plan', blocks: sampleBlocks() };
  }

  function App() {
    const initial = useRef(loadDoc());
    const [docTitle, setDocTitle] = useState(initial.current.title);
    const [blocks, setBlocks] = useState(initial.current.blocks);
    const [fab, setFab] = useState(null);
    const [picker, setPicker] = useState(null);
    const [pickStyle, setPickStyle] = useState('clean');
    const [pickPal, setPickPal] = useState(7);
    const [selVis, setSelVis] = useState(null);
    const [exportVis, setExportVis] = useState(null);
    const [share, setShare] = useState(false);
    const [docExport, setDocExport] = useState(false);
    const [deck, setDeck] = useState(false);
    const [toastMsg, setToastMsg] = useState(null);
    const [hint, setHint] = useState(() => !localStorage.getItem(LS_HINT));
    const [regenBusy, setRegenBusy] = useState(false);
    const [space, setSpace] = useState('doc');
    const [previewVar, setPreviewVar] = useState(null);
    useEffect(() => { setPreviewVar(null); }, [selVis]);
    const pickerRef = useRef(null);
    pickerRef.current = picker;

    // ----- persistence (debounced) -----
    const saveT = useRef(null);
    useEffect(() => {
      clearTimeout(saveT.current);
      saveT.current = setTimeout(() => {
        try { localStorage.setItem(LS_DOC, JSON.stringify({ title: docTitle, blocks })); } catch (e) { /* full */ }
      }, 400);
      return () => clearTimeout(saveT.current);
    }, [blocks, docTitle]);

    const toast = useCallback((msg) => {
      setToastMsg(msg);
      setTimeout(() => setToastMsg(null), 2200);
    }, []);

    // ----- undo history (coalesces rapid edits like typing) -----
    const history = useRef([]);
    const skipHist = useRef(false);
    const prevBlocksRef = useRef(blocks);
    const lastPushRef = useRef(0);
    useEffect(() => {
      if (prevBlocksRef.current === blocks) return;
      if (skipHist.current) { skipHist.current = false; prevBlocksRef.current = blocks; return; }
      const now = Date.now();
      if (now - lastPushRef.current > 700) {
        history.current.push(prevBlocksRef.current);
        if (history.current.length > 60) history.current.shift();
      }
      lastPushRef.current = now;
      prevBlocksRef.current = blocks;
    }, [blocks]);
    const undo = useCallback(() => {
      const prev = history.current.pop();
      if (!prev) { toast('Nothing to undo'); return; }
      skipHist.current = true;
      setBlocks(prev);
      toast('Undone');
    }, [toast]);
    useEffect(() => {
      const onKey = (e) => {
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && String(e.key).toLowerCase() === 'z') {
          const ae = document.activeElement;
          if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
          e.preventDefault();
          undo();
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [undo]);

    // ----- text editing -----
    const onHtml = useCallback((id, html) => {
      setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, html } : b)));
    }, []);
    const onTag = useCallback((id, tag, lineIdx) => {
      setBlocks((bs) => {
        const i = bs.findIndex((b) => b.id === id);
        if (i === -1) return bs;
        const b = bs[i];
        if (b.kind !== 'text' || b.tag === 'h1') return bs;
        const tmp = document.createElement('div');
        tmp.innerHTML = b.html;
        const groups = lineGroups(tmp);
        if (groups.length <= 1 || lineIdx == null || lineIdx >= groups.length) {
          return bs.map((x) => (x.id === id ? { ...x, tag: x.tag === tag ? 'p' : tag } : x));
        }
        // multi-line block: split into one block per line, re-tag only the selected line
        const parts = groups.map((g, k) => ({
          id: 'b' + Date.now().toString(36) + k + Math.random().toString(36).slice(2, 5),
          kind: 'text',
          tag: k === lineIdx ? (b.tag === tag ? 'p' : tag) : b.tag,
          html: g.block ? g.block.innerHTML : g.nodes.map((n) => (n.outerHTML != null ? n.outerHTML : n.textContent)).join(''),
        }));
        return [...bs.slice(0, i), ...parts, ...bs.slice(i + 1)];
      });
    }, []);

    // ----- selection → format bar -----
    useEffect(() => {
      function check() {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) { setFab(null); return; }
        const text = sel.toString().trim();
        if (!text.length) { setFab(null); return; }
        const node = sel.anchorNode;
        const el = node && (node.nodeType === 3 ? node.parentElement : node);
        const blockEl = el && el.closest && el.closest('.tb[data-block-id]');
        if (!blockEl) { setFab(null); return; }
        let rect;
        try { rect = sel.getRangeAt(0).getBoundingClientRect(); } catch (e) { return; }
        if (!rect || (!rect.width && !rect.height)) return;
        // which visual line of the block holds the selection? (blocks can hold several lines)
        let lineIdx = null;
        const groups = lineGroups(blockEl);
        if (groups.length > 1) {
          let nn = sel.anchorNode;
          while (nn && nn.parentNode && nn.parentNode !== blockEl) nn = nn.parentNode;
          groups.forEach((g, gi) => { if (g.nodes.indexOf(nn) !== -1) lineIdx = gi; });
        }
        setFab({ x: rect.left + rect.width / 2, y: rect.top - 10, text, blockId: blockEl.dataset.blockId, tag: blockEl.tagName.toLowerCase(), lineIdx, canViz: text.length >= 12 });
      }
      function onUp() { setTimeout(check, 10); }
      function onSelChange() {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) setFab(null);
      }
      document.addEventListener('mouseup', onUp);
      document.addEventListener('keyup', onUp);
      document.addEventListener('selectionchange', onSelChange);
      return () => {
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('keyup', onUp);
        document.removeEventListener('selectionchange', onSelChange);
      };
    }, []);

    // hide format bar on scroll
    useEffect(() => {
      const onScroll = () => setFab(null);
      window.addEventListener('scroll', onScroll, true);
      return () => window.removeEventListener('scroll', onScroll, true);
    }, []);

    // ----- generation flow -----
    async function startGenerate() {
      if (!fab) return;
      const { text, blockId } = fab;
      setFab(null);
      window.getSelection() && window.getSelection().removeAllRanges();
      setPicker({ phase: 'loading', text, blockId });
      const spec = await window.GlyphAI.generate(text);
      setPicker((p) => (p && p.text === text ? { ...p, phase: 'ready', spec } : p));
    }

    function insertVisual(type) {
      const p = pickerRef.current;
      if (!p || !p.spec) return;
      const v = {
        id: uid(), type, style: pickStyle, palette: pickPal,
        conn: {}, layout: {}, notes: [],
        source: p.text,
        spec: JSON.parse(JSON.stringify({ title: p.spec.title, items: p.spec.items, best: p.spec.best })),
      };
      setBlocks((bs) => {
        const i = bs.findIndex((b) => b.id === p.blockId);
        const blk = { id: v.id, kind: 'visual', visual: v };
        if (i === -1) return [...bs, blk];
        return [...bs.slice(0, i + 1), blk, ...bs.slice(i + 1)];
      });
      setPicker(null);
      setSelVis(v.id);
      if (hint) { setHint(false); localStorage.setItem(LS_HINT, '1'); }
    }

    // ----- visual ops -----
    const selVisual = (() => {
      if (!selVis) return null;
      const b = blocks.find((b) => b.kind === 'visual' && b.visual.id === selVis);
      return b ? b.visual : null;
    })();

    function patchVisual(id, patch) {
      setBlocks((bs) => bs.map((b) => (b.kind === 'visual' && b.visual.id === id ? { ...b, visual: { ...b.visual, ...patch } } : b)));
    }
    const addTextAfter = useCallback((id) => {
      setBlocks((bs) => {
        const i = bs.findIndex((b) => b.id === id);
        const nb = { id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), kind: 'text', tag: 'p', html: '', autoFocus: true };
        const next = bs.slice();
        next.splice(i + 1, 0, nb);
        return next;
      });
    }, []);
    function deleteVisualBlock(blockId) {
      setBlocks((bs) => bs.filter((b) => b.id !== blockId));
      setSelVis(null);
    }
    async function regen() {
      if (!selVisual || !selVisual.source) return;
      setRegenBusy(true);
      const spec = await window.GlyphAI.generate(selVisual.source);
      patchVisual(selVisual.id, { spec: { title: spec.title, items: spec.items, best: spec.best }, layout: {} });
      setRegenBusy(false);
      toast('Visual regenerated');
    }

    function resetDoc() {
      if (!window.confirm('Reset the document to the sample launch plan? Your edits will be lost.')) return;
      const fresh = { title: 'Orbit 2.0 Launch Plan', blocks: sampleBlocks() };
      localStorage.setItem(LS_DOC, JSON.stringify(fresh));
      window.location.reload();
    }

    function loadGallery() {
      if (!window.confirm('Replace the current document with the visual type gallery? Your edits will be lost.')) return;
      const fresh = { title: 'Markwise Visual Gallery', blocks: galleryBlocks() };
      localStorage.setItem(LS_DOC, JSON.stringify(fresh));
      window.location.reload();
    }

    const exportVisual = exportVis ? (blocks.find((b) => b.kind === 'visual' && b.visual.id === exportVis) || {}).visual : null;

    // hover-preview of a layout variant or alternative type temporarily replaces that visual
    const blocksView = previewVar == null
      ? blocks
      : blocks.map((b) => (b.kind === 'visual' && b.visual.id === previewVar.id
        ? { ...b, visual: { ...b.visual, ...(previewVar.type ? { type: previewVar.type, variant: null } : { variant: previewVar.variant }) } }
        : b));

    return (
      <div className="app" data-screen-label="Markwise editor">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark"></span>
            <span className="brand-name">Markwise</span>
          </div>
          <input
            className="doc-title"
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            aria-label="Document title"
          />
          <div className="space-toggle">
            <button className={space === 'doc' ? 'on' : ''} onClick={() => setSpace('doc')}>Doc</button>
            <button className={space === 'canvas' ? 'on' : ''} onClick={() => setSpace('canvas')}>Canvas</button>
          </div>
          <div className="topbar-right">
            <button className="ghost-btn sm" onClick={undo} title="Undo last change (⌘Z)">↺ Undo</button>
            <button className="ghost-btn sm" onClick={loadGallery} title="Load a document showcasing one example of every visual type">Gallery</button>
            <button className="ghost-btn sm" onClick={resetDoc} title="Restore the sample document">Reset</button>
            <button className="secondary-btn" onClick={() => setDocExport(true)}>Export</button>
            <button className="secondary-btn" onClick={() => setDeck(true)}>▶ Present</button>
            <button className="primary-btn" onClick={() => setShare(true)}>Share</button>
            <div className="avatar">A</div>
          </div>
        </header>

        <div className={'main' + (selVisual ? ' with-panel' : '')}>
          {space === 'canvas' ? (
            <Canvas
              blocks={blocksView}
              rawBlocks={blocks}
              selVis={selVis}
              onSelect={setSelVis}
              onPatch={patchVisual}
              onExport={setExportVis}
              onDelete={deleteVisualBlock}
              onPreviewVariant={(id, p) => setPreviewVar(p == null ? null : { id, ...p })}
            />
          ) : (
            <main className="doc-scroll" onClick={() => setSelVis(null)}>
              <div className="sheet" onClick={(e) => e.stopPropagation()}>
                {blocksView.map((b) => (
                  <React.Fragment key={b.id}>
                    {b.kind === 'text' ? (
                      <TextBlock block={b} onHtml={onHtml} />
                    ) : (
                      <VisualBlock
                        block={b}
                        baseVisual={((blocks.find((x) => x.id === b.id)) || b).visual}
                        selected={selVis === b.visual.id}
                        onSelect={setSelVis}
                        onExport={setExportVis}
                        onDelete={deleteVisualBlock}
                        onPatch={(patch) => patchVisual(b.visual.id, patch)}
                        onPreviewVariant={(p) => setPreviewVar(p == null ? null : { id: b.visual.id, ...p })}
                      />
                    )}
                    <div className="block-gap" contentEditable={false}>
                      <button className="block-gap-btn" onClick={() => addTextAfter(b.id)}>+ Text</button>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </main>
          )}
          {selVisual ? (
            <EditPanel
              visual={selVisual}
              onChange={(patch) => patchVisual(selVisual.id, patch)}
              onPreview={(p) => setPreviewVar(p == null || !selVisual ? null : { id: selVisual.id, ...p })}
              onClose={() => setSelVis(null)}
              onExport={() => setExportVis(selVisual.id)}
              onDelete={() => deleteVisualBlock(blocks.find((b) => b.kind === 'visual' && b.visual.id === selVisual.id).id)}
              onRegen={regen}
              regenBusy={regenBusy}
            />
          ) : null}
        </div>

        <FormatBar fab={fab} onVisualize={startGenerate} onTag={onTag} />
        {hint && !picker ? <HintPill onDismiss={() => { setHint(false); localStorage.setItem(LS_HINT, '1'); }} /> : null}
        {picker ? (
          <PickerOverlay
            picker={picker}
            style={pickStyle}
            setStyle={setPickStyle}
            pal={pickPal}
            setPal={setPickPal}
            onInsert={insertVisual}
            onClose={() => setPicker(null)}
          />
        ) : null}
        {exportVisual ? <ExportModal visual={exportVisual} onClose={() => setExportVis(null)} toast={toast} /> : null}
        {share ? <ShareModal docTitle={docTitle} onClose={() => setShare(false)} toast={toast} /> : null}
        {docExport ? <DocExportModal docTitle={docTitle} blocks={blocks} onClose={() => setDocExport(false)} toast={toast} /> : null}
        {deck ? <DeckOverlay docTitle={docTitle} blocks={blocks} onClose={() => setDeck(false)} toast={toast} /> : null}
        {toastMsg ? <div className="toast">{toastMsg}</div> : null}
      </div>
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
})();
