# Napkin App Clone

_Started 2026-06-11 16:47 UTC_

---

## User

Create an clone of napkin.ai clone not the website but the app itself.

## Assistant

_[tool: questions_v2]_

Quick note before we start: I can't recreate Napkin's exact branded interface, but I can absolutely build you an original, fully working **text-to-visual app** — the same core concept (write text, select it, generate diagrams/visuals from it) with its own design language. That's a fun build: a document editor, a "generate visual" flow, a visual picker with multiple diagram styles, and inline editing of generated graphics.

To do this well I need to understand what you want:

## User

Questions answered:
- core_scope: Select text → generate visual flow, Visual style picker (browse multiple diagram options), Editing a generated visual (colors, icons, labels), Export / share screen, Document editor (write/edit text)
- visual_types: Flowcharts / process arrows, Lists & pyramids / funnels, Timelines, Mindmaps / hierarchies, Stat / metric callouts, Cycle diagrams, Venn & comparison diagrams, add more 
- generation: Use real AI (Claude) to interpret text and pick/fill diagrams
- aesthetic: Clean minimal SaaS — crisp whites, one accent color
- hand_drawn: Both — user picks a style per visual
- platform: Desktop web app (full browser layout)
- variations: One polished direction
- sample_content: Product launch plan

## Assistant

_[tool: read_skill_prompt]_

_[tool: update_todos]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: done]_

_[tool: fork_verifier_agent]_

**Glyph** is live — an original text-to-visual workspace (Napkin-style concept, original design):

- **Editor** — a sample Orbit 2.0 launch plan document, fully editable; title and Reset in the top bar
- **✦ Visualize flow** — highlight any passage (12+ chars) and a floating button appears; Claude reads the text and fills a diagram spec
- **Picker** — 10 diagram types (flow, list, timeline, stats, cycle, mindmap, funnel, pyramid, venn, compare) previewed live, AI's best pick first, with Clean/Sketch style toggle and 5 color palettes
- **Edit panel** — click any inserted visual to switch type/style/palette, edit labels, details and values, regenerate with AI
- **Export/Share** — PNG, SVG, copy-as-text per visual; share-link modal for the doc

Caveats: AI calls fall back to a deterministic parser if rate-limited (tagged "offline parse" in the picker), and PNG exports of sketch-style visuals may use a system font instead of the handwritten one. Try selecting the **Success metrics** paragraph — it makes a nice stats card row.

## User

Improve the app add more styles, more themes, multicolor and more

## Assistant

_[tool: write_file]_

_[tool: write_file]_

Good call — I'll add three more render styles (**Bold**, **Soft**, **Mono/technical**) on top of Clean & Sketch, **multicolor palettes** (each item gets its own hue), more single-color themes, plus two new diagram types (**Steps** and **2×2 Matrix**).

_[tool: write_file]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: done]_

_[tool: fork_verifier_agent]_

Upgrades are in:

- **5 render styles** — Clean, Sketch (hand-drawn), **Bold** (heavy strokes, punchy weights), **Soft** (borderless, rounded fills), **Mono** (technical, square corners, uppercase monospace labels)
- **10 themes** — the original 5 plus Lagoon, Rose, and three **multicolor palettes** (Festival, Sunset, Tide) where every item gets its own hue; multicolor swatches show as gradient squares
- **2 new diagram types** — **Steps** (ascending stage bars) and **Matrix** (2×2 quadrants), now 12 total; Claude knows about them when picking the best fit

Everything composes: any type × any style × any theme, switchable live from the picker or the Edit panel. A verifier is double-checking the new combinations in the background — I'll fix anything it flags.

## User

No issues found

## Assistant

_[tool: snip]_

All verified ✓ — the new styles, multicolor themes, and Steps/Matrix types are working cleanly. Try selecting the **Risks** or **Channel strategy** paragraph and flipping through Bold + Festival or Mono + Tide in the picker. Anything else you'd like — more diagram types, a dark workspace theme, or doc-level export?

## User

add 30 more diagram styles. Also each diagram at one of time has single color not multiple example each step color, each circle different color or user can choose single color
Improve the render styles and add 5 more

## Assistant

_[tool: write_file]_

Big upgrade — I'll add **30 new diagram types** (42 total), a **color-mode control** (One color ↔ Multicolor — every item its own hue, or strictly single-hue, regardless of theme), **5 new render styles** (Outline, Pop, Serif, Marker, Stitch — 10 total), and improve the existing ones. Writing the core first:

