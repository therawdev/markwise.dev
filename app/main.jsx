// Markwise — app root: state, selection handling, generation flow, persistence
(function () {
  const { useState, useEffect, useRef, useCallback } = React;
  const { PickerOverlay, EditPanel, ExportModal, ShareModal } = window.GlyphPanels;
  const { sampleBlocks, TextBlock, VisualBlock, HintPill, PageMarkers } = window.GlyphEditor;
  const { FormatBar, VizFab } = window.GlyphFormat;
  const { DocExportModal } = window.GlyphDocExport;
  const { DeckOverlay } = window.GlyphDeck;
  const { Canvas } = window.GlyphCanvas;
  const { galleryBlocks } = window.GlyphGallery;

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

  function App({ boot }) {
    const docId = boot.doc.id;
    const initial = useRef({
      title: boot.doc.title,
      blocks: Array.isArray(boot.doc.blocks) && boot.doc.blocks.length ? boot.doc.blocks : sampleBlocks(),
    });
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

    // ----- persistence (debounced, to the API) -----
    const saveT = useRef(null);
    const firstSave = useRef(true);
    const [saveState, setSaveState] = useState('saved');
    useEffect(() => {
      if (firstSave.current) { firstSave.current = false; return; }
      setSaveState('saving');
      clearTimeout(saveT.current);
      saveT.current = setTimeout(async () => {
        try {
          await window.MarkwiseAPI.saveDoc(docId, { title: docTitle, blocks });
          setSaveState('saved');
        } catch (e) {
          setSaveState('error');
        }
      }, 600);
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
    const blocksRef = useRef(blocks);
    blocksRef.current = blocks;
    const onHtml = useCallback((id, html) => {
      setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, html } : b)));
    }, []);

    const newBlockId = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const blockEl = (id) => document.querySelector('.sheet [data-block-id="' + id + '"]');
    // place the caret at the start/end of a block (next frame, after React commits)
    const focusEdge = (id, edge) => {
      requestAnimationFrame(() => {
        const el = blockEl(id);
        if (!el) return;
        el.focus();
        const r = document.createRange();
        r.selectNodeContents(el);
        r.collapse(edge === 'start');
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
      });
    };
    // is the (collapsed) caret at the visible start/end of the block?
    const caretEdges = (el, sel) => {
      const r = sel.getRangeAt(0);
      const pre = r.cloneRange();
      pre.selectNodeContents(el);
      pre.setEnd(r.startContainer, r.startOffset);
      const post = r.cloneRange();
      post.selectNodeContents(el);
      post.setStart(r.endContainer, r.endOffset);
      return { atStart: !pre.toString().length, atEnd: !post.toString().length };
    };

    // block-level keyboard: Enter splits, Backspace merges/deletes, Delete merges forward, arrows cross blocks
    const onTextKeyRef = useRef(null);
    onTextKeyRef.current = (id, e) => {
      const bs = blocksRef.current;
      const i = bs.findIndex((b) => b.id === id);
      if (i === -1) return;
      const b = bs[i];
      const el = e.currentTarget;
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const r = sel.getRangeAt(0);
        r.deleteContents();
        const tail = document.createRange();
        tail.selectNodeContents(el);
        tail.setStart(r.startContainer, r.startOffset);
        const tmp = document.createElement('div');
        tmp.appendChild(tail.extractContents());
        const tailHtml = tmp.innerHTML;
        const nid = newBlockId();
        const tag = tmp.textContent.trim() ? b.tag : 'p';
        const html = el.innerHTML;
        setBlocks((cur) => {
          const j = cur.findIndex((x) => x.id === id);
          if (j === -1) return cur;
          const next = cur.map((x) => (x.id === id ? { ...x, html } : x));
          next.splice(j + 1, 0, { id: nid, kind: 'text', tag, html: tailHtml, autoFocus: true });
          return next;
        });
        focusEdge(nid, 'start');
        return;
      }

      const { atStart, atEnd } = caretEdges(el, sel);

      if (e.key === 'Backspace' && sel.isCollapsed && atStart) {
        // a heading first demotes to a paragraph, like other block editors
        if (b.tag !== 'p') {
          e.preventDefault();
          const html = el.innerHTML;
          setBlocks((cur) => cur.map((x) => (x.id === id ? { ...x, tag: 'p', html } : x)));
          focusEdge(id, 'start');
          return;
        }
        if (i === 0) return;
        const prev = bs[i - 1];
        if (prev.kind === 'text') {
          e.preventDefault();
          const prevEl = blockEl(prev.id);
          if (!prevEl) return;
          const mark = prevEl.childNodes.length;
          while (el.firstChild) prevEl.appendChild(el.firstChild);
          const html = prevEl.innerHTML;
          setBlocks((cur) => cur.filter((x) => x.id !== id).map((x) => (x.id === prev.id ? { ...x, html } : x)));
          prevEl.focus();
          const s = window.getSelection();
          const rr = document.createRange();
          rr.setStart(prevEl, Math.min(mark, prevEl.childNodes.length));
          rr.collapse(true);
          s.removeAllRanges();
          s.addRange(rr);
        } else {
          // previous block is a visual: select it; an empty text block is consumed
          e.preventDefault();
          if (!(el.textContent || '').trim()) setBlocks((cur) => cur.filter((x) => x.id !== id));
          setSelVis(prev.visual.id);
        }
        return;
      }

      if (e.key === 'Delete' && sel.isCollapsed && atEnd && i < bs.length - 1) {
        const next = bs[i + 1];
        if (next.kind === 'text') {
          e.preventDefault();
          const nextEl = blockEl(next.id);
          if (!nextEl) return;
          while (nextEl.firstChild) el.appendChild(nextEl.firstChild);
          const html = el.innerHTML;
          setBlocks((cur) => cur.filter((x) => x.id !== next.id).map((x) => (x.id === id ? { ...x, html } : x)));
        } else {
          e.preventDefault();
          setSelVis(next.visual.id);
        }
        return;
      }

      if (e.key === 'ArrowUp' && sel.isCollapsed && atStart) {
        for (let k = i - 1; k >= 0; k--) {
          if (bs[k].kind === 'text') { e.preventDefault(); focusEdge(bs[k].id, 'end'); return; }
        }
        return;
      }
      if (e.key === 'ArrowDown' && sel.isCollapsed && atEnd) {
        for (let k = i + 1; k < bs.length; k++) {
          if (bs[k].kind === 'text') { e.preventDefault(); focusEdge(bs[k].id, 'start'); return; }
        }
      }
    };
    const onTextKey = useCallback((id, e) => onTextKeyRef.current(id, e), []);
    const onTag = useCallback((id, tag, lineIdx) => {
      setBlocks((bs) => {
        const i = bs.findIndex((b) => b.id === id);
        if (i === -1) return bs;
        const b = bs[i];
        // protect the document title (first block); any other block can change tag
        if (b.kind !== 'text' || i === 0) return bs;
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

    // ----- multi-block selection (drag across block boundaries selects whole blocks) -----
    const [blockSel, setBlockSel] = useState(null); // array of selected block ids, in doc order
    const blockSelRef = useRef(null);
    const selVisRef = useRef(null);
    selVisRef.current = selVis;
    const clearBlockSel = useCallback(() => {
      blockSelRef.current = null;
      setBlockSel(null);
    }, []);
    useEffect(() => {
      let anchor = null;
      let dragging = false;
      const idAt = (t) => {
        const el = t && t.closest && t.closest('.sheet [data-block-id]');
        return el ? el.dataset.blockId : null;
      };
      const rangeIds = (a, b) => {
        const bs = blocksRef.current;
        let ia = bs.findIndex((x) => x.id === a);
        let ib = bs.findIndex((x) => x.id === b);
        if (ia === -1 || ib === -1) return null;
        if (ia > ib) { const t = ia; ia = ib; ib = t; }
        return bs.slice(ia, ib + 1).map((x) => x.id);
      };
      const onDown = (e) => {
        if (e.button !== 0) return;
        if (e.target.closest && e.target.closest('.fmtbar, .vis-toolbar, .block-gap, .style-pop, .panel, .modal')) return;
        if (blockSelRef.current) clearBlockSel();
        // anchor only on text blocks — drags that start inside a visual (shape moves, resize) never block-select
        const tb = e.target.closest && e.target.closest('.sheet .tb[data-block-id]');
        anchor = tb ? tb.dataset.blockId : null;
        dragging = !!anchor;
      };
      const onMove = (e) => {
        if (!dragging || !anchor) return;
        const cur = idAt(e.target);
        if (!cur) return;
        if (cur !== anchor || blockSelRef.current) {
          const ids = rangeIds(anchor, cur);
          if (!ids) return;
          const s = window.getSelection();
          if (s && !s.isCollapsed) s.removeAllRanges();
          blockSelRef.current = ids;
          setBlockSel(ids);
          setFab(null);
        }
      };
      const onUp = (e) => {
        dragging = false;
        const ids = blockSelRef.current;
        if (!ids) return;
        const bs = blocksRef.current;
        const text = ids
          .map((bid) => {
            const b = bs.find((x) => x.id === bid);
            if (!b || b.kind !== 'text') return '';
            const d = document.createElement('div');
            d.innerHTML = b.html;
            return (d.textContent || '').trim();
          })
          .filter(Boolean)
          .join('\n');
        // anchor the Visualize circle to the first selected block's top
        const firstEl = document.querySelector('.sheet [data-block-id="' + ids[0] + '"]');
        const selTop = firstEl ? firstEl.getBoundingClientRect().top : e.clientY - 12;
        setFab({
          x: e.clientX, y: e.clientY - 12, selTop,
          text, blockId: ids[ids.length - 1],
          multi: ids.length, canViz: text.length >= 12,
          tag: null, lineIdx: null,
        });
      };
      document.addEventListener('mousedown', onDown);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      return () => {
        document.removeEventListener('mousedown', onDown);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
    }, [clearBlockSel]);

    // visual highlight for the selected block range
    useEffect(() => {
      const ids = blockSel || [];
      document.querySelectorAll('.sheet [data-block-id]').forEach((el) => {
        el.classList.toggle('blk-sel', ids.indexOf(el.dataset.blockId) !== -1);
      });
    }, [blockSel, blocks]);

    // Backspace/Delete removes a block selection or a selected visual; Escape clears
    useEffect(() => {
      const onKey = (e) => {
        const ids = blockSelRef.current;
        if (e.key === 'Escape' && ids) { clearBlockSel(); setFab(null); return; }
        if (e.key !== 'Backspace' && e.key !== 'Delete') return;
        if (ids) {
          e.preventDefault();
          setBlocks((bs) => {
            let next = bs.filter((b) => ids.indexOf(b.id) === -1);
            if (!next.some((b) => b.kind === 'text')) {
              next = [...next, { id: 'b' + Date.now().toString(36), kind: 'text', tag: 'p', html: '', autoFocus: true }];
            }
            return next;
          });
          clearBlockSel();
          setFab(null);
          return;
        }
        if (selVisRef.current) {
          const ae = document.activeElement;
          if (ae && (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))) return;
          const vb = blocksRef.current.find((b) => b.kind === 'visual' && b.visual.id === selVisRef.current);
          if (vb) {
            e.preventDefault();
            setBlocks((bs) => bs.filter((b) => b.id !== vb.id));
            setSelVis(null);
          }
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [clearBlockSel]);

    // ----- selection → format bar -----
    useEffect(() => {
      // keep the toolbar alive while typing into its own link/comment input
      const inToolbarInput = () => {
        const a = document.activeElement;
        return a && a.classList && a.classList.contains('fmt-input');
      };
      function check() {
        if (blockSelRef.current || inToolbarInput()) return; // block-mode / toolbar input owns the fab
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
        setFab({ x: rect.left + rect.width / 2, y: rect.top - 10, selTop: rect.top, text, blockId: blockEl.dataset.blockId, tag: blockEl.tagName.toLowerCase(), lineIdx, canViz: text.length >= 12 });
      }
      function onUp() { setTimeout(check, 10); }
      function onSelChange() {
        if (blockSelRef.current || inToolbarInput()) return;
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
      clearBlockSel();
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

    async function resetDoc() {
      if (!window.confirm('Reset the document to the sample launch plan? Your edits will be lost.')) return;
      await window.MarkwiseAPI.saveDoc(docId, { title: 'Orbit 2.0 Launch Plan', blocks: sampleBlocks() });
      window.location.reload();
    }

    async function loadGallery() {
      if (!window.confirm('Replace the current document with the visual type gallery? Your edits will be lost.')) return;
      await window.MarkwiseAPI.saveDoc(docId, { title: 'Markwise Visual Gallery', blocks: galleryBlocks() });
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
          <a className="brand" href="/docs" title="Back to your documents" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="brand-mark"></span>
            <span className="brand-name">Markwise</span>
          </a>
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
            <span style={{ fontSize: 11.5, color: saveState === 'error' ? '#b3422f' : 'var(--grey)' }}>
              {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : 'Saved'}
            </span>
            <button className="ghost-btn sm" onClick={undo} title="Undo last change (⌘Z)">↺ Undo</button>
            <button className="ghost-btn sm" onClick={loadGallery} title="Load a document showcasing one example of every visual type">Gallery</button>
            <button className="ghost-btn sm" onClick={resetDoc} title="Restore the sample document">Reset</button>
            <button className="secondary-btn" onClick={() => setDocExport(true)}>Export</button>
            <button className="secondary-btn" onClick={() => setDeck(true)}>▶ Present</button>
            <button className="primary-btn" onClick={() => setShare(true)}>Share</button>
            {boot.user.is_app_owner ? <a className="ghost-btn sm" href="/admin" style={{ textDecoration: 'none' }}>Admin</a> : null}
            <div
              className="avatar"
              title={boot.user.email + ' — click to sign out'}
              style={{ cursor: 'pointer' }}
              onClick={() => { if (window.confirm('Sign out of Markwise?')) window.MarkwiseAPI.logout(); }}
            >
              {(boot.user.name || 'U').charAt(0).toUpperCase()}
            </div>
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
                <PageMarkers deps={blocksView.length} />
                {blocksView.map((b) => (
                  <React.Fragment key={b.id}>
                    {b.kind === 'text' ? (
                      <TextBlock block={b} onHtml={onHtml} onKey={onTextKey} />
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

        <FormatBar fab={fab} onTag={onTag} />
        <VizFab fab={fab} onVisualize={startGenerate} />
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

  (async () => {
    const boot = await window.MarkwiseAPI.boot();
    if (!boot) return; // redirected to login or docs
    ReactDOM.createRoot(document.getElementById('root')).render(<App boot={boot} />);
  })();
})();
