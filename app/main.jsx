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
  const GC = window.GlyphComments;

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
    const [tailorBusy, setTailorBusy] = useState(false);
    const [space, setSpace] = useState('doc');
    const [previewVar, setPreviewVar] = useState(null);
    useEffect(() => { setPreviewVar(null); }, [selVis]);
    const pickerRef = useRef(null);
    pickerRef.current = picker;
    const fabRef = useRef(fab);
    fabRef.current = fab;
    const spaceRef = useRef('doc');
    spaceRef.current = space;

    // ----- comments + collaboration state -----
    const [comments, setComments] = useState([]);
    const [commentDraft, setCommentDraft] = useState(null); // { cid, anchor:{blockIds,quote} }
    const [showComments, setShowComments] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [avatarOpen, setAvatarOpen] = useState(false);
    useEffect(() => {
      if (!moreOpen) return;
      const close = (e) => { if (!e.target.closest || !e.target.closest('.more-wrap')) setMoreOpen(false); };
      document.addEventListener('mousedown', close);
      return () => document.removeEventListener('mousedown', close);
    }, [moreOpen]);
    useEffect(() => {
      if (!avatarOpen) return;
      const close = (e) => { if (!e.target.closest || !e.target.closest('.avatar-wrap')) setAvatarOpen(false); };
      document.addEventListener('mousedown', close);
      return () => document.removeEventListener('mousedown', close);
    }, [avatarOpen]);
    const [activeCid, setActiveCid] = useState(null);
    const [members, setMembers] = useState([]);         // org members, for @mentions
    const [presence, setPresence] = useState([]);       // other active editors
    const editingBlockRef = useRef(null);               // block id I'm focused in
    const serverVersionRef = useRef(boot.doc.updated_at || null);
    const commentsRef = useRef(comments);
    commentsRef.current = comments;

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
          const r = await window.MarkwiseAPI.saveDoc(docId, { title: docTitle, blocks });
          if (r && r.updated_at) serverVersionRef.current = r.updated_at; // our own version — don't re-pull it
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
    const saveStateRef = useRef(saveState);
    saveStateRef.current = saveState;

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

    // always keep an editable line at the very end, so you can click below a
    // trailing visual and just start typing (no "+ Text" needed)
    useEffect(() => {
      setBlocks((bs) => (bs.length && bs[bs.length - 1].kind === 'visual'
        ? [...bs, { id: newBlockId(), kind: 'text', tag: 'p', html: '' }]
        : bs));
    }, [blocks]);
    const focusLastText = () => {
      const bs = blocksRef.current;
      for (let k = bs.length - 1; k >= 0; k--) if (bs[k].kind === 'text') { focusEdge(bs[k].id, 'end'); return; }
    };

    // ----- drag a visual to a new position among the document blocks -----
    const [dragBlk, setDragBlk] = useState(null);
    const [dropIdx, setDropIdx] = useState(null);
    const dragBlkRef = useRef(null);
    const dropIdxRef = useRef(null);
    const startBlockDrag = (id, e) => {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      dragBlkRef.current = id; setDragBlk(id);
      document.body.classList.add('no-select');
      const move = (ev) => {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const blk = el && el.closest && el.closest('.sheet [data-block-id]');
        const bs = blocksRef.current;
        if (!blk) return;
        const overIdx = bs.findIndex((b) => b.id === blk.dataset.blockId);
        if (overIdx === -1) return;
        const r = blk.getBoundingClientRect();
        const idx = ev.clientY > r.top + r.height / 2 ? overIdx + 1 : overIdx;
        dropIdxRef.current = idx; setDropIdx(idx);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        document.body.classList.remove('no-select');
        const from = blocksRef.current.findIndex((b) => b.id === dragBlkRef.current);
        const to = dropIdxRef.current;
        if (from !== -1 && to != null) {
          setBlocks((bs) => {
            const next = bs.slice();
            const [moved] = next.splice(from, 1);
            let t = to > from ? to - 1 : to; // adjust for the removed element
            t = Math.max(0, Math.min(next.length, t));
            next.splice(t, 0, moved);
            return next;
          });
        }
        dragBlkRef.current = null; dropIdxRef.current = null; setDragBlk(null); setDropIdx(null);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
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

    // ===================== comments + collaboration =====================

    // load existing threads + org members (for @mentions) on open
    useEffect(() => {
      let alive = true;
      window.MarkwiseAPI.listComments(docId).then((rows) => { if (alive) setComments(rows || []); }).catch(() => {});
      const cid = boot.doc.company_id;
      if (cid) window.MarkwiseAPI.get('/api/orgs/' + cid).then((o) => { if (alive) setMembers((o && o.members) || []); }).catch(() => {});
      return () => { alive = false; };
    }, [docId]);

    // keep the <mark> highlights (resolved / active) in sync with thread state
    useEffect(() => { if (GC) GC.applyMarkStates(comments, activeCid); }, [comments, activeCid, blocks, space]);

    // clicking a comment highlight activates its thread — the margin card expands
    // (or, if the full rail is open, its list item scrolls into view)
    useEffect(() => {
      const onClick = (e) => {
        const m = e.target.closest && e.target.closest('mark.cmt[data-cid]');
        if (!m) return;
        const cid = m.getAttribute('data-cid');
        setActiveCid(cid);
        setTimeout(() => {
          const card = document.querySelector('.comments-rail .cmt-thread[data-cid="' + cid + '"]');
          if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, 60);
      };
      document.addEventListener('click', onClick);
      return () => document.removeEventListener('click', onClick);
    }, []);

    // track which text block I'm focused in — published to others as a soft lock
    useEffect(() => {
      const onFocus = (e) => {
        const tb = e.target.closest && e.target.closest('.sheet .tb[data-block-id]');
        editingBlockRef.current = tb ? tb.dataset.blockId : null;
      };
      const onBlur = () => { editingBlockRef.current = null; };
      document.addEventListener('focusin', onFocus);
      document.addEventListener('focusout', onBlur);
      return () => { document.removeEventListener('focusin', onFocus); document.removeEventListener('focusout', onBlur); };
    }, []);

    // merge a collaborator's saved blocks into my state (per-block; never touch
    // the block I'm actively editing; bump rev so text blocks re-sync their HTML)
    const sig = (b) => (b.kind === 'visual' ? 'v' + JSON.stringify(b.visual) : 't' + b.tag + '' + b.html);
    function mergeRemote(remote) {
      setBlocks((local) => {
        const byId = Object.fromEntries(local.map((b) => [b.id, b]));
        const editing = editingBlockRef.current;
        let changed = false;
        const next = remote.map((rb) => {
          const lb = byId[rb.id];
          if (lb && rb.id === editing) return lb; // don't yank text mid-type
          if (!lb) { changed = true; return rb.kind === 'text' ? { ...rb, rev: 0 } : rb; }
          if (sig(lb) === sig(rb)) return lb;
          changed = true;
          return rb.kind === 'text' ? { ...rb, rev: (lb.rev || 0) + 1 } : rb;
        });
        if (!changed && next.length === local.length) return local;
        return next;
      });
    }

    // presence heartbeat (every 4s) — publishes my cursor block, returns the
    // other active editors, and detects a collaborator's save to pull it in
    useEffect(() => {
      let alive = true, ticks = 0;
      const beat = async () => {
        try {
          const res = await window.MarkwiseAPI.heartbeat(docId, editingBlockRef.current);
          if (!alive) return;
          setPresence(res.users || []);
          const remoteV = res.doc && res.doc.updated_at;
          const newer = remoteV && serverVersionRef.current && new Date(remoteV) > new Date(serverVersionRef.current);
          if (newer && saveStateRef.current !== 'saving') {
            const fresh = await window.MarkwiseAPI.get('/api/docs/' + docId);
            if (!alive) return;
            serverVersionRef.current = fresh.updated_at || remoteV;
            if (Array.isArray(fresh.blocks)) mergeRemote(fresh.blocks);
            window.MarkwiseAPI.listComments(docId).then((rows) => alive && setComments(rows || [])).catch(() => {});
          } else if (++ticks % 3 === 0) {
            // refresh threads periodically to catch replies that don't touch blocks
            window.MarkwiseAPI.listComments(docId).then((rows) => alive && setComments(rows || [])).catch(() => {});
          }
        } catch (e) { /* transient — ignore */ }
      };
      beat();
      const t = setInterval(beat, 4000);
      return () => { alive = false; clearInterval(t); };
    }, [docId]);

    // soft-lock indicator: outline blocks a collaborator is currently editing
    useEffect(() => {
      const locks = {};
      presence.forEach((u) => { if (u.editing_block) locks[u.editing_block] = u.name || u.email; });
      document.querySelectorAll('.sheet .tb[data-block-id]').forEach((el) => {
        const who = locks[el.dataset.blockId];
        el.classList.toggle('blk-locked', !!who);
        if (who) el.setAttribute('data-locked-by', who.split(' ')[0]);
        else el.removeAttribute('data-locked-by');
      });
    }, [presence, blocks, space]);

    // ===================== ambient section Visualize =====================
    // A "section" is a heading (h1/h2) plus the text blocks under it, up to the
    // next heading. As you scroll / edit / hover, the active section gets a left
    // accent bar and a ✦ Visualize button in the gutter. Sections that look like
    // a good diagram (lists, steps, several points) get a "suggested" emphasis.
    // Manual text selection still works and takes priority (we hide this then).
    const htmlText = (html) => { const d = document.createElement('div'); d.innerHTML = html || ''; return (d.textContent || '').trim(); };
    function looksVisualizable(htmls, texts) {
      if (htmls.some((h) => /<(ul|ol|li)\b/i.test(h || ''))) return true;
      if (texts.length >= 3) return true;
      const joined = texts.join(' ');
      const enumParts = joined.split(/[;•]|(?:,| and )/i).map((s) => s.trim()).filter((s) => s.length > 2);
      if (enumParts.length >= 4) return true;
      if (/\b(first|second|third|then|next|finally|step\s*\d|phase\s*\d)\b/i.test(joined) && texts.length >= 2) return true;
      return false;
    }
    const sections = React.useMemo(() => {
      const secs = [];
      let cur = null;
      blocks.forEach((b) => {
        const heading = b.kind === 'text' && (b.tag === 'h1' || b.tag === 'h2');
        if (heading) { cur = { key: b.id, headingId: b.id, title: htmlText(b.html), ids: [b.id], bodyIds: [], barFirst: b.id, barLast: b.id, sawVisual: false }; secs.push(cur); }
        else if (b.kind === 'text') {
          if (!cur) { cur = { key: '__intro', headingId: null, title: '', ids: [], bodyIds: [], barFirst: null, barLast: null, sawVisual: false }; secs.push(cur); }
          cur.ids.push(b.id); cur.bodyIds.push(b.id);
          // the highlight bar covers only the contiguous text under the heading,
          // up to the first visual — so a visual below the text isn't highlighted
          if (cur.barFirst == null) cur.barFirst = b.id;
          if (!cur.sawVisual) cur.barLast = b.id;
        } else if (cur) { cur.ids.push(b.id); cur.sawVisual = true; } // a visual is in the range, not the source text
      });
      secs.forEach((s) => {
        const htmls = s.bodyIds.map((id) => (blocks.find((x) => x.id === id) || {}).html || '');
        const texts = htmls.map(htmlText).filter(Boolean);
        s.bodyText = texts.join('\n');
        s.text = (s.headingId && s.title ? s.title + '\n' : '') + s.bodyText;
        s.lastId = s.bodyIds.length ? s.bodyIds[s.bodyIds.length - 1] : s.headingId;
        s.canViz = s.bodyText.replace(/\s/g, '').length >= 16;
        s.suggested = s.canViz && looksVisualizable(htmls, texts);
      });
      return secs.filter((s) => s.canViz);
    }, [blocks]);
    const sectionsRef = useRef(sections);
    sectionsRef.current = sections;
    const activeKeyRef = useRef(null); // section key chosen by the last interaction
    const [secFab, setSecFab] = useState(null); // { key, top, left, sec }

    // place the gutter ✦ at the active section (last interaction wins; falls back
    // to the top-most visible section). Re-runs on scroll/hover/caret/resize.
    const positionSecFab = useCallback(() => {
      if (fabRef.current || pickerRef.current || blockSelRef.current || spaceRef.current !== 'doc') { setSecFab(null); return; }
      const secs = sectionsRef.current;
      if (!secs.length) { setSecFab(null); return; }
      let sec = secs.find((s) => s.key === activeKeyRef.current) || secs[0];
      const el = document.querySelector('.sheet [data-block-id="' + (sec.headingId || sec.ids[0]) + '"]');
      const sheet = document.querySelector('.sheet');
      if (!el || !sheet) { setSecFab(null); return; }
      const r = el.getBoundingClientRect();
      const sr = sheet.getBoundingClientRect();
      // the bar covers the section's contiguous TEXT under the heading (barFirst →
      // barLast), so a visual below the text never gets highlighted
      const firstEl = document.querySelector('.sheet [data-block-id="' + (sec.barFirst || sec.ids[0]) + '"]');
      const lastEl = document.querySelector('.sheet [data-block-id="' + (sec.barLast || sec.barFirst || sec.ids[0]) + '"]');
      const fr = (firstEl || el).getBoundingClientRect();
      const lr = (lastEl || el).getBoundingClientRect();
      // keep the gutter ✦ and the accent bar below the navbar and within the section's text band,
      // so scrolling a long section doesn't drag the icon up over (and past) the topbar
      const topbar = document.querySelector('.topbar');
      const navBottom = topbar ? topbar.getBoundingClientRect().bottom : 54;
      const lowB = navBottom + 8;
      const barTop = Math.max(fr.top, navBottom);
      const icoTop = Math.min(Math.max(r.top + 2, lowB), Math.max(lowB, lr.bottom - 30));
      setSecFab({
        key: sec.key,
        top: Math.round(icoTop),
        left: Math.round(Math.max(12, sr.left - 46)),
        bar: { top: Math.round(barTop), height: Math.max(0, Math.round(lr.bottom - barTop)), left: Math.round(sr.left) },
        sec,
      });
    }, []);
    const keyFromBlock = (bid) => {
      const s = bid && sectionsRef.current.find((x) => x.ids.indexOf(bid) !== -1);
      return s ? s.key : null;
    };

    useEffect(() => {
      let raf = 0, lastHover = null;
      const schedule = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; positionSecFab(); }); };
      const onMove = (e) => {
        const tb = e.target.closest && e.target.closest('.sheet .tb[data-block-id]');
        if (!tb || tb.dataset.blockId === lastHover) return; // only when hovering a NEW block
        lastHover = tb.dataset.blockId;
        const k = keyFromBlock(lastHover);
        if (k) { activeKeyRef.current = k; schedule(); }
      };
      const onSel = () => {
        const s = window.getSelection();
        if (!s || !s.isCollapsed || !s.anchorNode) return;
        const el = s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode;
        const tb = el && el.closest && el.closest('.sheet .tb[data-block-id]');
        const k = tb && keyFromBlock(tb.dataset.blockId);
        if (k) { activeKeyRef.current = k; schedule(); }
      };
      const onScroll = () => {
        // scrolling re-targets to the top-most visible section
        const scroll = document.querySelector('.doc-scroll');
        const secs = sectionsRef.current;
        if (scroll && secs.length) {
          const line = scroll.getBoundingClientRect().top + 90;
          let key = secs[0].key;
          secs.forEach((s) => {
            const el = document.querySelector('.sheet [data-block-id="' + (s.headingId || s.ids[0]) + '"]');
            if (el && el.getBoundingClientRect().top <= line) key = s.key;
          });
          activeKeyRef.current = key;
        }
        schedule();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('scroll', onScroll, true);
      document.addEventListener('selectionchange', onSel);
      window.addEventListener('resize', schedule);
      return () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('scroll', onScroll, true);
        document.removeEventListener('selectionchange', onSel);
        window.removeEventListener('resize', schedule);
      };
    }, [positionSecFab]);
    useEffect(() => { positionSecFab(); }, [sections, fab, picker, space, blockSel, positionSecFab]);

    // ----- comment actions -----
    const startComment = useCallback(() => {
      if (!GC) return;
      const cid = GC.newCid();
      const ids = blockSelRef.current;
      const anchor = ids ? GC.wrapBlocks(cid, ids) : GC.wrapRange(cid);
      if (!anchor) { toast('Select some text to comment on'); return; }
      clearBlockSel();
      setFab(null);
      setCommentDraft({ cid, anchor });
      setActiveCid(cid); // floating composer appears next to the section
    }, [toast, clearBlockSel]);

    const submitNewComment = async (body) => {
      if (!commentDraft) return;
      const mentions = GC.mentionsIn(body, members);
      try {
        const row = await window.MarkwiseAPI.addComment(docId, { cid: commentDraft.cid, anchor: commentDraft.anchor, body, mentions });
        setComments((cs) => [...cs, row]);
        setCommentDraft(null);
      } catch (e) { toast(e.message || 'Could not post comment'); }
    };
    const cancelNewComment = () => {
      if (commentDraft) { GC.unwrap(commentDraft.cid); setCommentDraft(null); }
      setActiveCid(null);
    };
    const replyComment = async (parentId, body) => {
      const mentions = GC.mentionsIn(body, members);
      try {
        const row = await window.MarkwiseAPI.replyComment(docId, parentId, body, mentions);
        setComments((cs) => [...cs, row]);
      } catch (e) { toast(e.message || 'Could not reply'); }
    };
    const resolveComment = async (commentId, currentlyResolved) => {
      try {
        await window.MarkwiseAPI.resolveComment(docId, commentId, currentlyResolved);
        setComments((cs) => cs.map((c) => (c.id === commentId ? { ...c, resolved: !currentlyResolved } : c)));
      } catch (e) { toast(e.message || 'Could not update'); }
    };
    const deleteComment = async (commentId) => {
      const top = commentsRef.current.find((c) => c.id === commentId && !c.parent_id);
      try {
        const r = await window.MarkwiseAPI.deleteComment(docId, commentId);
        setComments((cs) => cs.filter((c) => c.id !== commentId && c.parent_id !== commentId));
        const cid = (top && top.cid) || (r && r.cid);
        if (cid) GC.unwrap(cid);
      } catch (e) { toast(e.message || 'Could not delete'); }
    };
    const activateThread = (cid) => { setActiveCid(cid); if (GC) GC.scrollToCid(cid); };
    const closeComments = () => { cancelNewComment(); setShowComments(false); };

    // ----- generation flow -----
    async function generateFrom(text, blockId) {
      if (!text || text.replace(/\s/g, '').length < 12) return;
      setFab(null);
      clearBlockSel();
      window.getSelection() && window.getSelection().removeAllRanges();
      setPicker({ phase: 'loading', text, blockId });
      const spec = await window.GlyphAI.generate(text);
      const others = (spec.best || []).slice(1, 4).filter((t) => window.DIAGRAMS[t]);
      setPicker((p) => (p && p.text === text ? { ...p, phase: 'ready', spec, specs: {}, tailoring: others } : p));
      // each of the other top picks gets its OWN content, shaped for that type (best[0] is already
      // the AI's tailored pick). They fill in progressively so the picker stays responsive.
      if (window.GlyphAI && window.GlyphAI.reshape) {
        others.forEach(async (t) => {
          const r = await window.GlyphAI.reshape(text, t);
          setPicker((p) => {
            if (!p || p.text !== text || p.blockId !== blockId) return p;
            const specs = { ...(p.specs || {}) };
            if (r && r.items && r.items.length) specs[t] = { title: r.title, items: r.items, best: spec.best };
            return { ...p, specs, tailoring: (p.tailoring || []).filter((x) => x !== t) };
          });
        });
      }
    }
    function startGenerate() { if (fab) generateFrom(fab.text, fab.blockId); }

    function insertVisual(type) {
      const p = pickerRef.current;
      if (!p || !p.spec) return;
      const chosen = (p.specs && p.specs[type]) || p.spec; // use the content tailored for this type
      const v = {
        id: uid(), type, style: pickStyle, palette: pickPal,
        conn: {}, layout: {}, notes: [],
        source: p.text,
        spec: JSON.parse(JSON.stringify({ title: chosen.title, items: chosen.items, best: p.spec.best })),
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
      // Changing the layout/variant (or diagram type) re-flows the whole arrangement, so the
      // manual drag/scale overrides in visual.layout — keyed to the OLD positions — no longer
      // make sense and would jumble the new layout. Drop them on a structural change.
      // Content edits (spec text) and direct drag patches keep their positions untouched.
      setBlocks((bs) => bs.map((b) => {
        if (!(b.kind === 'visual' && b.visual.id === id)) return b;
        const structural = ('type' in patch && patch.type !== b.visual.type)
          || ('variant' in patch && patch.variant !== b.visual.variant);
        // Keep the canvas board position (layout.canvas) — only the arrangement-specific
        // drag/scale overrides are stale after a re-flow.
        const cv = b.visual.layout && b.visual.layout.canvas;
        const next = (structural && !('layout' in patch))
          ? { ...patch, layout: cv ? { canvas: cv } : {} }
          : patch;
        return { ...b, visual: { ...b.visual, ...next } };
      }));
    }
    const addTextAfter = useCallback((id) => {
      const bs = blocksRef.current;
      const i = bs.findIndex((b) => b.id === id);
      // Notion-like: if there's already an empty line right after, just put the
      // cursor there instead of stacking another blank block.
      const nx = bs[i + 1];
      if (nx && nx.kind === 'text' && !(nx.html || '').replace(/<br>/gi, '').trim()) {
        focusEdge(nx.id, 'start');
        return;
      }
      const nid = newBlockId();
      setBlocks((cur) => {
        const j = cur.findIndex((b) => b.id === id);
        const next = cur.slice();
        next.splice(j + 1, 0, { id: nid, kind: 'text', tag: 'p', html: '', autoFocus: true });
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
    // re-tailor the SAME content specifically for the current diagram type (on-demand reshape)
    async function tailorVisual() {
      if (!selVisual || tailorBusy || !(window.GlyphAI && window.GlyphAI.reshape)) return;
      const src = selVisual.source || (selVisual.spec.items || []).map((it) => (it.label || '') + (it.detail ? ': ' + it.detail : '') + (it.value ? ' (' + it.value + ')' : '')).join('\n');
      if (!src) return;
      const type = selVisual.type;
      setTailorBusy(true);
      try {
        const out = await window.GlyphAI.reshape(src, type);
        if (out && out.items && out.items.length) {
          patchVisual(selVisual.id, { spec: { title: out.title || selVisual.spec.title, items: out.items, best: selVisual.spec.best }, layout: {} });
          toast('Content tailored for ' + ((window.DIAGRAMS[type] || {}).name || type));
        } else {
          toast('Could not tailor — kept current content');
        }
      } finally {
        setTailorBusy(false);
      }
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
            {presence.length ? (
              <div className="presence-stack">
                {presence.slice(0, 4).map((u) => (
                  <span
                    key={u.id}
                    className={'presence-ava' + (u.editing_block ? ' editing' : '')}
                    data-name={(u.name || u.email) + (u.editing_block ? ' · editing' : ' · viewing')}
                  >
                    {(u.name || u.email || '?').charAt(0).toUpperCase()}
                  </span>
                ))}
                {presence.length > 4 ? (
                  <span className="presence-ava more" data-name={presence.slice(4).map((u) => u.name || u.email).join(', ')}>+{presence.length - 4}</span>
                ) : null}
              </div>
            ) : null}
            <span className="save-state" style={{ color: saveState === 'error' ? '#b3422f' : 'var(--grey)' }}>
              {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : 'Saved'}
            </span>
            <button className="icon-btn topbar-icon" onClick={undo} title="Undo last change (⌘Z)" aria-label="Undo">↺</button>
            <button
              className={'icon-btn topbar-icon' + (showComments ? ' on' : '')}
              onClick={() => (showComments ? closeComments() : setShowComments(true))}
              title="Comments" aria-label="Comments"
            >
              💬{comments.filter((c) => !c.parent_id && !c.resolved).length ? <span className="topbar-badge">{comments.filter((c) => !c.parent_id && !c.resolved).length}</span> : null}
            </button>
            <span className="topbar-sep"></span>
            <button className="secondary-btn" onClick={() => setDocExport(true)}>Export</button>
            <button className="secondary-btn" onClick={() => setDeck(true)}>▶ Present</button>
            <button className="primary-btn" onClick={() => setShare(true)}>Share</button>
            <div className="more-wrap">
              <button className="icon-btn topbar-icon" onClick={() => setMoreOpen((o) => !o)} title="More" aria-label="More actions">⋯</button>
              {moreOpen ? (
                <div className="more-menu">
                  <button className="more-item" onClick={() => { setMoreOpen(false); loadGallery(); }}>Visual gallery</button>
                  <button className="more-item" onClick={() => { setMoreOpen(false); resetDoc(); }}>Reset document</button>
                </div>
              ) : null}
            </div>
            <div className="avatar-wrap">
              <button
                className="avatar"
                onClick={() => setAvatarOpen((o) => !o)}
                title={boot.user.name || boot.user.email}
                aria-label="Account menu"
              >
                {(boot.user.name || 'U').charAt(0).toUpperCase()}
              </button>
              {avatarOpen ? (
                <div className="more-menu avatar-menu">
                  <div className="avatar-head">
                    <div className="avatar-name">{boot.user.name || 'You'}</div>
                    <div className="avatar-email">{boot.user.email}</div>
                  </div>
                  <div className="more-div"></div>
                  <a className="more-item" href="/docs">My documents</a>
                  <a className="more-item" href="/settings">Account settings</a>
                  {boot.user.is_app_owner ? <a className="more-item" href="/admin">Admin panel</a> : null}
                  <div className="more-div"></div>
                  <button className="more-item danger" onClick={() => { setAvatarOpen(false); if (window.confirm('Sign out of Markwise?')) window.MarkwiseAPI.logout(); }}>Sign out</button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className={'main' + (selVisual ? ' with-panel' : '') + (showComments && space === 'doc' ? ' comments-open' : '')
          + (!showComments && space === 'doc' && (commentDraft || comments.some((c) => !c.parent_id && !c.resolved)) ? ' comments-float' : '')}>
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
            <main className="doc-scroll" onClick={(e) => { setSelVis(null); if (e.target === e.currentTarget) focusLastText(); }}>
              <div className="sheet" onClick={(e) => { if (e.target === e.currentTarget) focusLastText(); else e.stopPropagation(); }}>
                <PageMarkers deps={blocksView.length} />
                {blocksView.map((b, bi) => (
                  <React.Fragment key={b.id}>
                    {dropIdx === bi ? <div className="drop-line" contentEditable={false}></div> : null}
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
                        onDragStart={startBlockDrag}
                        dragging={dragBlk === b.id}
                      />
                    )}
                    <div className="block-gap" contentEditable={false} onClick={() => addTextAfter(b.id)} title="Click to add a line">
                      <span className="block-gap-btn">+ Text</span>
                    </div>
                  </React.Fragment>
                ))}
                {dropIdx === blocksView.length ? <div className="drop-line" contentEditable={false}></div> : null}
              </div>
              {!showComments && GC && (commentDraft || comments.some((c) => !c.parent_id && !c.resolved)) ? (
                <GC.FloatingComments
                  comments={comments}
                  draft={commentDraft}
                  members={members}
                  user={boot.user}
                  activeCid={activeCid}
                  docRev={blocks}
                  onActivate={activateThread}
                  onSubmitNew={submitNewComment}
                  onCancelNew={cancelNewComment}
                  onReply={replyComment}
                  onResolve={resolveComment}
                  onDelete={deleteComment}
                />
              ) : null}
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
              onTailor={tailorVisual}
              tailorBusy={tailorBusy}
            />
          ) : null}
          {showComments && space === 'doc' && GC ? (
            <GC.CommentsRail
              comments={comments}
              draft={commentDraft}
              members={members}
              user={boot.user}
              activeCid={activeCid}
              onActivate={activateThread}
              onSubmitNew={submitNewComment}
              onCancelNew={cancelNewComment}
              onReply={replyComment}
              onResolve={resolveComment}
              onDelete={deleteComment}
              onClose={closeComments}
            />
          ) : null}
        </div>

        <FormatBar fab={fab} onTag={onTag} onComment={startComment} />
        <VizFab fab={fab} onVisualize={startGenerate} />
        {secFab && !fab && !picker && space === 'doc' && !blockSel && secFab.bar ? (
          <div className="sec-bar" style={{ top: secFab.bar.top, height: secFab.bar.height, left: secFab.bar.left }}></div>
        ) : null}
        {secFab && !fab && !picker && space === 'doc' && !blockSel ? (
          <button
            className={'sec-viz' + (secFab.sec.suggested ? ' suggested' : '')}
            style={{ top: secFab.top, left: secFab.left }}
            title={secFab.sec.suggested
              ? 'Visualize this section — looks like a good fit'
              : (secFab.sec.headingId ? 'Visualize “' + (secFab.sec.title || 'this section') + '”' : 'Visualize this section')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => generateFrom(secFab.sec.text, secFab.sec.lastId)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6.5" cy="17.5" r="2.2" /><circle cx="17.5" cy="6.5" r="2.2" /><circle cx="17.5" cy="17.5" r="2.2" />
              <path d="M8.6 16.2 15.4 8M17.5 9v6" />
            </svg>
          </button>
        ) : null}
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
        {deck ? <DeckOverlay docTitle={docTitle} blocks={blocks} docId={docId} onClose={() => setDeck(false)} toast={toast} /> : null}
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
