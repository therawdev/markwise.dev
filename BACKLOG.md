# Markwise — Backlog

Bugs, limitations, and planned features. Newest thinking at the top of each
section. When you pick something up, move it to **In progress**; when it ships,
move it to **Recently shipped** with the commit/date.

Legend: **[S]** small · **[M]** medium · **[L]** large/multi-session · 🐛 bug · ✨ feature · ⚠️ known limitation

---

## In progress

_(nothing currently)_

---

## Features — planned

### ✨ [L] Stage 2 — Live co-editing (CRDT) — the big one
Today collaboration is **Stage 1**: presence avatars, soft "X is editing" locks,
and per-block auto-sync via 4s polling with last-writer-wins. Stage 2 upgrades to
true Google-Docs-style concurrent editing.

- **Approach:** make each text block's content a `Y.Text` and the block list a
  `Y.Array` (Yjs CRDT); attach a WebSocket provider for real-time sync. Delete the
  soft-lock; Yjs owns conflict resolution. **Do not** hand-roll OT.
- **Why it's staged cleanly:** Stage 1 was built forward-compatibly —
  - comments are sync-independent (anchored by `<mark data-cid>` + stored quote), so the rail, threads, resolve, and mentions all carry over untouched;
  - sync is already **block-granular** (each block has a stable id + a `rev`), so this is a migration of the sync engine, not a rewrite;
  - presence is its own channel and becomes Yjs *awareness*.
- **Tasks:**
  - [ ] Add a WebSocket server (the app is plain Express today — no realtime infra).
  - [ ] Vendor or CDN-import Yjs + a provider into the **no-build-step** frontend
        (Babel-standalone in the browser) — biggest unknown; see ⚠️ below.
  - [ ] Bind `Y.Text` ↔ the contenteditable blocks; map `Y.Array` ↔ the block list.
  - [ ] Server-side Yjs doc persistence + snapshot to the existing `documents.blocks` for export/back-compat.
  - [ ] Live cursors / remote selection carets (replace the block-level soft lock).
- **Caveat:** the no-build frontend constrains how Yjs ships (ESM via esm.sh/skypack, or a pre-built vendored bundle). Decide this first.

### ✨ Comments — enhancements
- [ ] **[S]** Render `@mentions` highlighted inside the comment body (currently the mention notifies but shows as plain text).
- [ ] **[S]** Email notification for `@mention` / reply (today they only surface in the in-app bell).
- [ ] **[M]** Orphaned-thread handling: if a commented section is fully deleted, the `<mark>` anchor is lost — detect and surface these threads (e.g. an "Anchor removed" badge in the rail) instead of silently dropping them.
- [ ] **[S]** Comment reactions (👍 / emoji) on a comment.
- [ ] **[S]** "Commenter" access for per-email shares (today email-shared users are view-only; let them comment without edit rights).
- [ ] **[S]** Keyboard shortcut to add a comment (⌘/Ctrl+Alt+M) on the current selection.

### ✨ Presence / collaboration
- [ ] **[M]** Live cursor positions & remote text selections (depends on Stage 2 awareness).
- [ ] **[S]** "Last edited by X · time" indicator per block.
- [ ] **[S]** Release presence on tab close via `navigator.sendBeacon` (today rows expire after 15s).

### ✨ Editor & diagrams
- [ ] **[M]** Manual sub-node editing for multi-level mindmaps on the canvas — a "+ sub-node" affordance to add a child directly (deferred when the Sub-branches layout shipped).
- [ ] **[S]** AI auto-suggests the two-sided **split** layout when an item set has 7+ items.
- [ ] **[S]** Rename misleading variant id `infohub` → `hub-left` (the displayed name is already correct; id is cosmetic — needs a saved-doc migration, see DIAGRAM-TERMINOLOGY.md).

### ✨ Platform
- [ ] **[M]** Real-time bell (push new notifications without the periodic poll) — naturally falls out of the Stage 2 WebSocket channel.

---

## Known issues & limitations ⚠️

- ⚠️ **Concurrent edits to the *same* block can clobber.** Stage 1 sync is
  last-writer-wins per block; the soft lock only *discourages* two people editing
  one block at once. Fixed by Stage 2 (CRDT).
- ⚠️ **Sync latency up to ~4s** (polling interval). Fine for small org teams;
  WebSockets (Stage 2) make it instant and cheaper at higher concurrency.
- ⚠️ **No-build frontend** (in-browser Babel) constrains adding libraries like
  Yjs — must come via CDN ESM or a vendored bundle.
- ⚠️ **Comment anchor lost on full-section delete** — see "Orphaned-thread handling" above.

---

## Recently shipped

- ✨ Comments (Google-Docs style): anchored ranges (single + multi-section),
  floating margin cards + sidebar rail, replies, resolve/reopen, @mentions.
- ✨ Collaboration Stage 1: presence avatars, soft section locks, per-block auto-sync.
- ✨ Multi-level mindmaps (Sub-branches) + selectable Tree layouts.
- ✨ Two-sided Bracket & Spokes split layouts; diagram terminology reference.
- 🐛 Reset stale drag positions when a visual's layout changes.
