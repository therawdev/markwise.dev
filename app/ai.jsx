// Glyph — AI generation: Claude call + deterministic fallback parser
(function () {
  const TYPES = () => window.TYPE_ORDER || ['flow', 'list', 'timeline', 'cycle', 'mindmap', 'funnel', 'pyramid', 'venn', 'comparison', 'stats', 'steps', 'matrix'];

  const PROMPT = (text) => `You turn a passage of text into a diagram spec.
Respond with ONLY valid JSON. No markdown fences, no commentary.
Schema:
{"title":"short title, 3-6 words",
 "items":[{"label":"2-5 word phrase","detail":"supporting phrase, max 9 words or null","value":"short stat like 40%, $2M, Sep 15, else null"}],
 "best":["type","type","type"]}
Rules:
- 3 to 12 items, drawn faithfully from the passage. Never invent facts. Use as many items as the passage genuinely contains.
- label is the NAME of the thing itself (e.g. "Security Misconfiguration"), not a sentence fragment; what happened or why goes in detail; a compact stat or rank move like "#5 → #2" goes in value.
- "best" = the 3 diagram types that fit this content best, most fitting first.
- Allowed types: ${TYPES().join(',')}.
- Use chart types (stats,bars,columns,donut,pie,waterfall,segments,heatgrid) in best only if the passage contains numbers. Use "timeline","gantt" or "agenda" only for dates or ordered phases.
- Rank or position changes between two editions or years ("moved from No. 5 to No. 2", "remains No. 1") are NOT timelines and NOT a versus — prefer "rowtable","list","slope". "versus" requires exactly two competing options.
- "funnel"/"horn" fit narrowing stages, "pyramid" hierarchy, "journey"/"flow"/"chevron" processes, "proscons"/"comparison"/"balance" trade-offs, "versus" a head-to-head face-off between exactly two options, "iceberg" hidden-vs-visible, "cycle"/"gridcycle"/"gears"/"gearring" loops, "spokes"/"hub"/"mindmap"/"diverge" one-to-many ideas, "lens"/"converge" many-into-one, "nested" containment levels, "bulb" creative ideas, "puzzlering" complementary parts, "milestones" ordered achievements or numbered phases, "cascade" benefits or capabilities each paired with an outcome, "ringcards" items with percentages or completeness, "table" attribute-and-description pairs, "semicircle" a fan of 3-6 stages, "ringchain" step-by-step processes with longer step descriptions, "cone" funnel-style narrowing into one outcome, "infohub" one central topic wired to detailed callout banners, "rowtable" rows pairing a short label with a longer description (and optional metric), "sidefunnel" funnel stages that each need an explanatory side caption, "funnelarrows" funnel stages as alternating arrows with side notes, "discfunnel" funnel stages as stacked discs with a numbered legend, "sidehub" one core entity with 4-6 numbered callouts flanking it, "gaugerow" 2-4 percentage stats as gauge rings, "pencil" education or learning-related lists, "snake" a winding step-by-step path, "metro" stops along a route or schedule, "filmstrip" scenes or releases in sequence, "sticky" brainstorm notes, "bento" one featured item plus supporting tiles, "shelf" resources or references, "lollipop"/"bullet"/"pictobar" compact numeric comparisons, "bowtie" inputs converging then fanning out into outputs, "ripple" effects radiating from one change, "overlap" adjacent concepts sharing ground, "rocket" an ascent toward a goal, "hourglass" many inputs filtered down then expanded into outcomes, "burst" one topic radiating 5-10 facets, each with an icon node, short name and caption (great for top-10 style breakdowns).
PASSAGE:
"""${text.slice(0, 1500)}"""`;

  function cap(s) { s = String(s || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // sentence split that does not break on abbreviations like "No. 1", "vs.", "e.g."
  const SENT_SPLIT = /(?<=[.!?])(?<!\b(?:No|vs|etc|Fig|Dr|Mr|Mrs|Ms|St|Inc|Ltd)\.)(?<!\b[ei]\.[ge]\.)\s+(?=["'(\[]?[A-Z0-9])/;

  // split a statement into subject (label) + what happened (detail)
  const VERB_RE = /\b(remains?|remained|moved|moves|is|are|was|were|has|have|had|will|became|becomes?|replaced|replaces|renamed|renames|changed|changes|updated|updates|dropped|drops|rose|fell|stays?|stayed|continues?|jumped|climbed|slipped|went|gets?|got|now|launches?|launched|opens?|opened)\b/i;
  function splitItem(clean) {
    const m = clean.match(VERB_RE);
    let label, detail;
    if (m && m.index > 2 && m.index < 52) {
      label = clean.slice(0, m.index).trim();
      detail = clean.slice(m.index).trim();
    } else {
      const w = clean.split(/\s+/);
      label = w.slice(0, 5).join(' ');
      detail = w.length > 5 ? w.slice(5).join(' ') : null;
    }
    label = label.replace(/[,;:\-\u2013\s]+(which|that|who)?\s*$/i, '');
    const lw = label.split(/\s+/);
    if (lw.length > 6) {
      detail = lw.slice(6).join(' ') + (detail ? ' ' + detail : '');
      label = lw.slice(0, 6).join(' ');
    }
    if (detail) {
      detail = detail.replace(/^\W+/, '');
      const dw = detail.split(/\s+/);
      if (dw.length > 16) detail = dw.slice(0, 16).join(' ') + '…';
    }
    return { label: cap(label), detail: detail ? cap(detail) : null };
  }

  function fallbackTitle(text) {
    let first = String(text).trim().split(/\n+/)[0];
    first = first.split(SENT_SPLIT)[0] || first;
    const w = first.replace(/[\-\*\u2022]+/g, ' ').trim().split(/\s+/).slice(0, 7);
    const weak = /^(a|an|the|and|or|of|in|on|at|to|from|with|for|is|are|was|were|its|their|both|no\.?|remains?|moved|now)$/i;
    while (w.length > 2 && weak.test(w[w.length - 1])) w.pop();
    return cap(w.join(' ').replace(/[,;:]+$/, ''));
  }

  function fallbackSpec(text) {
    let parts = text.split(/\n+/).map((s) => s.trim()).filter((s) => s.length > 2);
    if (parts.length < 3) parts = text.split(SENT_SPLIT).map((s) => s.trim()).filter((s) => s.length > 2);
    if (parts.length < 3) parts = text.split(/,| and /).map((s) => s.trim()).filter((s) => s.length > 2);
    parts = parts.slice(0, 12);
    if (!parts.length) parts = [text.trim() || 'Item'];
    const items = parts.map((p) => {
      const clean = p.replace(/^[\-\*\u2022\d.\)\s]+/, '').replace(/[.!?]+$/, '');
      const { label, detail } = splitItem(clean);
      const vm = p.match(/[$\u20ac\u00a3]\s?\d[\d,.]*\s*[MBKmbk]?|\d+(?:\.\d+)?\s*%/);
      return { label, detail, value: vm ? vm[0].trim() : null };
    });
    while (items.length < 3) items.push({ label: 'Point ' + (items.length + 1), detail: null, value: null });
    const lower = text.toLowerCase();
    let best;
    if (/\bno\.\s*\d|\brank(ed|ing)?\b|\btop\s+\d|moved\s+(up|down)|\bclimbed\b|\bslipped\b/i.test(text)) best = ['rowtable', 'list', 'slope'];
    else if (/\bvs\b|versus|compare|compared|while|whereas/.test(lower)) best = ['comparison', 'venn', 'list'];
    else if ((text.match(/\d[\d,.]*\s*%|\$\s?\d/g) || []).length >= 2) best = ['stats', 'list', 'funnel'];
    else if (/\b(19|20)\d\d\b|january|february|march|april|may|june|july|august|september|october|november|december|\bq[1-4]\b|phase|week \d/i.test(text)) best = ['timeline', 'flow', 'list'];
    else if (/cycle|loop|repeat|iterat|feedback/.test(lower)) best = ['cycle', 'flow', 'mindmap'];
    else if (/step|then|first|next|finally|process/.test(lower)) best = ['flow', 'list', 'timeline'];
    else best = ['mindmap', 'list', 'flow'];
    return { title: fallbackTitle(text), items, best, _fallback: true };
  }

  function sanitize(j, text) {
    if (!j || typeof j !== 'object' || !Array.isArray(j.items)) return fallbackSpec(text);
    let items = j.items
      .filter((it) => it && (it.label || it.detail))
      .map((it) => ({
        label: String(it.label || it.detail || '').trim().slice(0, 60),
        detail: it.detail ? String(it.detail).trim().slice(0, 90) : null,
        value: it.value ? String(it.value).trim().slice(0, 16) : null,
      }))
      .slice(0, 12);
    if (items.length < 3) return fallbackSpec(text);
    let best = Array.isArray(j.best) ? j.best.map((b) => String(b).toLowerCase().trim()).filter((b) => TYPES().includes(b)) : [];
    if (!best.length) best = fallbackSpec(text).best;
    return { title: String(j.title || 'Untitled').trim().slice(0, 70), items, best: best.slice(0, 3) };
  }

  // ---------- slide bullet condensing (deck view + PPTX export) ----------
  function splitSentences(t) {
    return String(t).split(SENT_SPLIT).map((s) => s.trim()).filter((s) => s.length > 1);
  }

  function trimBullet(s, max) {
    max = max || 130;
    s = String(s).trim().replace(/[\s.;,]+$/, '');
    if (s.length <= max) return s;
    const cut = s.slice(0, max - 1);
    const sp = cut.lastIndexOf(' ');
    return (sp > 40 ? cut.slice(0, sp) : cut).replace(/[,;:.\s]+$/, '') + '…';
  }

  function fallbackBullets(paras) {
    const out = [];
    (paras || []).forEach((p) => splitSentences(p).forEach((s) => out.push(trimBullet(s))));
    return out.length ? out.slice(0, 6) : (paras || []).map((p) => trimBullet(p)).slice(0, 6);
  }

  function needsCondense(paras) {
    if (!paras || !paras.length) return false;
    if (paras.length > 6) return true;
    return paras.some((p) => p.length > 110 || splitSentences(p).length > 1);
  }

  const BULLETS_PROMPT = (title, paras) => `You rewrite slide body text as crisp presentation bullet points.
Respond with ONLY valid JSON. No markdown fences, no commentary.
Schema: {"bullets":["short bullet", ...]}
Rules:
- 3 to 6 bullets. Each bullet is ONE idea, maximum 12 words.
- Draw every bullet faithfully from the text. Never invent facts.
- Keep all numbers, dates, and proper names exactly as written.
- If one sentence packs several facts, split them into separate bullets.
- Cover the whole text — do not drop the later sentences.
- No trailing punctuation.
SLIDE TITLE: ${title || 'Untitled'}
TEXT:
"""${(paras || []).join('\n').slice(0, 2400)}"""`;

  async function condense(title, paras) {
    if (!(window.claude && window.claude.complete)) return fallbackBullets(paras);
    try {
      const raw = await window.claude.complete(BULLETS_PROMPT(title, paras));
      const m = String(raw).match(/\{[\s\S]*\}/);
      if (!m) return fallbackBullets(paras);
      const j = JSON.parse(m[0]);
      const bullets = (Array.isArray(j.bullets) ? j.bullets : [])
        .map((b) => trimBullet(String(b || ''), 110))
        .filter((b) => b.length > 1)
        .slice(0, 6);
      if (bullets.length < 2) return fallbackBullets(paras);
      return bullets;
    } catch (e) {
      console.warn('Glyph AI bullets fallback:', e);
      return fallbackBullets(paras);
    }
  }

  const SUB_PROMPT = (text) => `You shorten a slide subtitle.
Respond with ONLY valid JSON. No markdown fences.
Schema: {"sub":"one sentence"}
Rules: one faithful sentence, maximum 24 words, keep numbers and dates exactly, never invent facts.
TEXT:
"""${String(text).slice(0, 1200)}"""`;

  async function condenseSub(text) {
    if (!(window.claude && window.claude.complete)) return trimBullet(text, 200);
    try {
      const raw = await window.claude.complete(SUB_PROMPT(text));
      const m = String(raw).match(/\{[\s\S]*\}/);
      const s = m ? String((JSON.parse(m[0]) || {}).sub || '').trim() : '';
      return s && s.length <= 260 ? s : trimBullet(text, 200);
    } catch (e) {
      return trimBullet(text, 200);
    }
  }

  async function generate(text) {
    if (!(window.claude && window.claude.complete)) return fallbackSpec(text);
    try {
      const raw = await window.claude.complete(PROMPT(text));
      const m = String(raw).match(/\{[\s\S]*\}/);
      if (!m) return fallbackSpec(text);
      return sanitize(JSON.parse(m[0]), text);
    } catch (e) {
      console.warn('Glyph AI fallback:', e);
      return fallbackSpec(text);
    }
  }

  window.GlyphAI = { generate, fallbackSpec, condense, condenseSub, needsCondense, fallbackBullets };
})();
