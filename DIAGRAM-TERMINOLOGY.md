# Diagram terminology & layout-variant naming

A reference so variant names stay consistent and describe what's actually drawn.
Use the **shared vocabulary** below, then the **per-type tables** to rename variants.

Variant names live in each renderer as `D9.<type>.variants = [{ id, name }]`
(`app/diagrams-*.jsx`). The `id` is the stored value (don't rename casually — it's
persisted in saved docs); the `name` is the label shown in the Layouts gallery and
is safe to reword anytime.

---

## Shared component vocabulary

Words to reuse so every diagram describes its parts the same way.

| Term | What it names | Used by |
|---|---|---|
| **Root** | The central origin box of a *hierarchy* (holds the title). | tree, bracket |
| **Hub** | The central node of a *wheel/radial* layout (holds the title). | spokes, radial, diverge, converge, infohub |
| **Node** | Any discrete item — a box, circle, or chip. | most |
| **Pill** | A capsule-shaped node (rounded-rectangle, fully rounded ends). | spokes, mindmap, list |
| **Leaf** | A terminal node with no children. | tree, mindmap |
| **Branch** | A line from a hub/root **out to a node** (carries meaning/flow). | mindmap, tree, diverge, converge |
| **Spoke** | A branch in a literal *wheel* (radiates from a hub). | spokes |
| **Leader line** | A thin line connecting a shape to its **off-to-the-side label**. | callouts, nested, sidefunnel |
| **Brace** | The curly `{` shape that groups items under a root. | bracket |
| **Tie** | The short stub linking the root to the brace's vertex. | bracket |
| **Connector / elbow** | A right-angled (L-shaped) link between two points. | tree, spokes-split |
| **Chevron** | An arrow-shaped segment `>` (a step that points forward). | chevron, flow |
| **Ring** | Nodes arranged on a circle. | cycle, radial, ringcards |
| **Lane / Row / Column** | Straight-line arrangement axes (horizontal lane, vertical column). | flow, list, rowtable |

### The distinction you were missing: **"Two columns" vs "Two sides"**

These are **different layouts** and should never share a name:

| Name | Meaning | Reading order | Examples |
|---|---|---|---|
| **Two columns** | The *same* one-directional layout duplicated into two parallel vertical strips. No center; items 1–4 fill the left column, 5–8 the right. | Down column 1, then down column 2. | list, ribbon, rowtable, pencil |
| **Two sides** (a.k.a. *two-sided* / *mirrored*) | A *central* hub/root with items **mirrored** left and right around it. The left side is a horizontal flip of the right. | Outward from the center, both directions. | mindmap, **spokes-split**, **bracket-split**, diverge, converge, infohub-split |

> The Bracket bug you hit: its split was built as **two columns** (two root-left/items-right
> brackets stacked side by side) but *named* and *expected* as **two sides**. It's now a true
> two-sided (mirrored) bracket: one centered root, one brace opening right, a mirrored brace
> opening left. Renamed `Two columns` → **`Two-sided brackets`**.

---

## Variant tables by type

Legend: ✅ name is accurate · ✏️ suggested reword · 🐛 was fixed this pass.

### Hub / radial family (center + items around it)

| Type | What it is | Key components | Variant `id` | Current name | Notes |
|---|---|---|---|---|---|
| **spokes** | A wheel: hub in the middle, pill nodes on spokes. | hub, spoke, pill | `radial` | Hub & spokes | ✅ |
| | | | `split` | Two sides | 🐛 spokes now **radiate from the hub on both sides** (were straight combs). ✅ |
| **diverge** | One source fanning out to many outcomes. | hub, branch, node | `radial` | Hub & branches | ✅ |
| | | | `split` | Two sides | ✅ mirrored around the hub |
| **converge** | Many inputs merging into one. | hub, branch, node | `radial` | Hub & branches | ✅ |
| | | | `split` | Two sides | ✅ |
| **infohub** | Central topic card wired to info banners. | hub (card), leader line, banner | `hub-right` | Hub left | ✅ name correct (hub sits left). ✏️ `id` is misleading — it means "info on the right". Consider `id: 'hub-left'`. |
| | | | `split` | Two sides | ✅ mirrored |
| **mindmap** | Central idea, branches to topics (and sub-topics). | center, branch, node, sub-node | `branches` | Branches | ✅ single level |
| | | | `subnodes` | Sub-branches | ✅ multi-level (nodes carry children) |
| **radial** | Items on a circle/arc around a center. | center, ring, node | `open` / `semi` / `full` | Open ring / Semicircle / Full circle | ✅ describe arc sweep |

### Hierarchy family (root + descendants)

| Type | What it is | Key components | Variant `id` | Current name | Notes |
|---|---|---|---|---|---|
| **tree** | A root with peer items branching off. | root, branch, connector, leaf | `twosided` | Two sides | ✅ root centered, peers left+right |
| | | | `indented` | Indented | ✅ file-explorer spine |
| | | | `grid` | Top-down grid | ✅ classic org-chart grid |
| **bracket** | A root grouped to items by a curly brace. | root, brace, tie, node | `normal` | Single bracket | ✅ |
| | | | `split` | **Two-sided brackets** | 🐛 was "Two columns"; now a centered root with a brace each side (mirrored). |

### Column / list family (parallel strips — genuine "two columns")

| Type | What it is | Key components | Variant `id` | Current name | Notes |
|---|---|---|---|---|---|
| **list** | A vertical list of items. | row, node | `one` / `two` | Single column / Two columns | ✅ truly two parallel columns |
| **ribbon** | Ribbon-styled item rows. | ribbon row | `normal` / `split` | Single column / Two columns | ✅ parallel columns (correct — not mirrored) |
| **rowtable** | Table-like rows of label/detail/value. | row, cell | `normal` / `split` | Single column / Two columns | ✅ |
| **pencil** | "Pencil" list rows with a nib motif. | row, nib | `normal` / `split` | Single column / Two columns | ✅ |

### Linear / flow family

| Type | What it is | Key components | Variant `id` | Current name | Notes |
|---|---|---|---|---|---|
| **flow** | Steps connected left→right. | step, chevron/arrow, lane | `snake` / `rows` / `row` | Snake / Rows / Single row | ✅ describe wrapping |
| **chevron** | Arrow-shaped steps. | chevron | `auto` / `row` / `stack` | Auto / Single row / Stacked | ✅ |
| **timeline** | Events along an axis. | axis, marker, label | `alternate` / `above` / `below` | Alternate / Labels above / Labels below | ✅ label placement |
| **segments** | Labeled segments along a bar. | bar, segment, label | `alternate` / `above` / `below` | Alternate / Labels above / Labels below | ✅ |
| **steps / stairs** | Ascending steps. | step, riser | — | — | (no variants) |

### Shape / proportion family

| Type | What it is | Key components | Variant `id` | Current name | Notes |
|---|---|---|---|---|---|
| **pyramid** | Stacked tiers, widest at base. | tier, apex, base | `point` / `flat` / `inverted` | Pointed / Flat top / Inverted | ✅ |
| **stats** | Big-number stat cards. | stat card, figure, label | `auto` / `stack` / `row` | Auto grid / Two-up / Single row | ✅ |
| **cycle** | A repeating loop of stages. | ring, stage node, arrow | `ring` / `horseshoe` / `pills` | Ring / Horseshoe / Pill ring | ✅ |
| **honeycomb** | Hex-tiled cells. | hex cell, cluster | `auto` / `balanced` / `row` | Cluster / Balanced rows / Single row | ✅ |
| **ringcards** | A ring paired with detail cards. | ring, card | `top` / `bottom` | Ring on top / Ring below | ✅ |
| **sidefunnel** | A funnel with side callouts. | funnel band, leader line, callout | `plain` / `intake` | Funnel + callouts / With intake dots | ✅ |
| **discfunnel** | A funnel drawn as 3D discs/cone. | disc, cone, banner | `discs` / `banners` | 3D discs / Cone + banners | ✅ |

---

## How to rename a variant

1. Edit the `name` in `D9.<type>.variants` (in the matching `app/diagrams-*.jsx`).
   This is purely the gallery label — safe to change.
2. **Do not** change an existing `id` unless you also migrate saved docs — `visual.variant`
   stores the `id`, so an old doc would fall back to the default layout. (`infohub`'s
   `hub-right` id is the only one I'd flag, and even that is cosmetic.)
3. The Layouts gallery (`app/variant-gallery.jsx`) reads these names live — no other change needed.
