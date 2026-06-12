// Glyph — VariantGallery: floating gallery of live thumbnail previews — layout variants of the
// current type plus same-category sibling types, all rendered with the visual's own data
(function () {
  function VariantGallery({ visual, onPick, onPreview, onClose, inline, typesToo }) {
    const preview = onPreview || (() => {});
    // always clear any live preview when the gallery goes away
    React.useEffect(() => () => { (onPreview || (() => {}))(null); }, []);
    const includeTypes = typesToo == null ? !inline : typesToo;
    const variants = ((window.DIAGRAMS[visual.type] || {}).variants || []);
    const cats = window.TYPE_CATEGORIES || [];
    const cat = cats.find((c) => c.types.indexOf(visual.type) !== -1);
    const sibs = includeTypes && cat ? cat.types.filter((t) => t !== visual.type && window.DIAGRAMS[t]).slice(0, 10) : [];
    if (!variants.length && !sibs.length) return null;

    const card = (key, name, cur, payload, vis) => (
      <button
        key={key}
        className={'vg-card' + (cur ? ' on' : '')}
        onMouseEnter={() => preview(payload)}
        onClick={(e) => { e.stopPropagation(); onPick(payload); preview(null); if (onClose) onClose(); }}
      >
        <span className="vg-thumb"><window.Diagram visual={vis} /></span>
        <span className="vg-name">{name}</span>
      </button>
    );

    const body = (
      <div onMouseLeave={() => preview(null)}>
        {variants.length ? (
          <div className="vg-grid">
            {variants.map((vt) => card(
              'v' + vt.id, vt.name,
              (visual.variant || variants[0].id) === vt.id,
              { variant: vt.id },
              { ...visual, variant: vt.id }
            ))}
          </div>
        ) : null}
        {sibs.length ? (
          <React.Fragment>
            <div className="vg-sect">{variants.length ? 'More like this' : (cat ? cat.name : 'Alternatives')}</div>
            <div className="vg-grid">
              {sibs.map((tp) => card(
                't' + tp, window.DIAGRAMS[tp].name,
                false,
                { type: tp },
                { ...visual, type: tp, variant: null }
              ))}
            </div>
          </React.Fragment>
        ) : null}
      </div>
    );

    if (inline) return <div className="vg-inline">{body}</div>;
    return (
      <div className="vg-pop" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        <div className="vg-head">
          <b>Layouts</b>
          <button className="icon-btn sm" onClick={() => { preview(null); onClose(); }} aria-label="Close layouts">✕</button>
        </div>
        {body}
      </div>
    );
  }

  window.GlyphVariants = { VariantGallery };
})();
