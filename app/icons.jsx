// Glyph — auto-icon engine: keyword-matched line icons (24×24 stroke paths), Napkin-style
(function () {
  const P = {
    gear: 'M15.2 12a3.2 3.2 0 1 0-6.4 0 3.2 3.2 0 1 0 6.4 0M18.8 12h3M5.2 12h-3M12 5.2v-3M12 18.8v3M16.8 7.2l2.1-2.1M7.2 16.8l-2.1 2.1M16.8 16.8l2.1 2.1M7.2 7.2 5.1 5.1',
    chartup: 'M4 18l5.5-5.5 3.5 3 7-8M15.5 7.5H20V12',
    pen: 'M14.5 4.5l5 5M4 20l1.5-5.5L16 4l4 4L9.5 18.5 4 20z',
    megaphone: 'M4 10v5M4 10l11-5v14L4 15M17 9.5a3.5 3.5 0 0 1 0 6',
    briefcase: 'M5 9h14v10H5zM9 9V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M5 13h14',
    people: 'M11.5 9a2.8 2.8 0 1 0-5.6 0 2.8 2.8 0 1 0 5.6 0M4 19c0-3 2.2-4.8 4.7-4.8s4.7 1.8 4.7 4.8M18.3 10.4a2.3 2.3 0 1 0-4.6 0 2.3 2.3 0 1 0 4.6 0M15.5 14.6c2.4 0 4.5 1.7 4.5 4.4',
    clock: 'M20 12a8 8 0 1 0-16 0 8 8 0 1 0 16 0M12 7v5l3.2 2',
    dollar: 'M12 3.5v17M16 7.5c0-1.6-1.9-2.6-4-2.6s-4 .9-4 2.7 1.9 2.3 4 2.4 4 .8 4 2.6-1.9 2.7-4 2.7-4-1-4-2.6',
    bulb: 'M9.5 17.5h5M10.2 20.5h3.6M12 3a6 6 0 0 1 3.4 10.9c-.8.6-1.4 1.1-1.4 2.1h-4c0-1-.6-1.5-1.4-2.1A6 6 0 0 1 12 3z',
    bars: 'M5 20v-8M10 20V7M15 20v-6M20 20V4',
    shield: 'M12 3l7 2.8v5.4c0 4.8-3.4 7.7-7 9.8-3.6-2.1-7-5-7-9.8V5.8L12 3z',
    target: 'M20 12a8 8 0 1 0-16 0 8 8 0 1 0 16 0M16.4 12a4.4 4.4 0 1 0-8.8 0 4.4 4.4 0 1 0 8.8 0M13.4 12a1.4 1.4 0 1 0-2.8 0 1.4 1.4 0 1 0 2.8 0',
    doc: 'M7 3h7l4 4v14H7V3zM14 3v4h4M10 12h5M10 16h5',
    search: 'M16 10.5a5.5 5.5 0 1 0-11 0 5.5 5.5 0 1 0 11 0M14.6 14.6 20 20',
    heart: 'M12 20C5.5 15 4 11 6.5 8.3a4 4 0 0 1 5.5.4 4 4 0 0 1 5.5-.4C20 11 18.5 15 12 20z',
    star: 'M12 3.5l2.4 5.2 5.6.6-4.2 3.9 1.2 5.6L12 16l-5 2.8 1.2-5.6L4 9.3l5.6-.6L12 3.5z',
    flag: 'M6 21V4M6 5h11l-2.6 3.5L17 12H6',
    globe: 'M20 12a8 8 0 1 0-16 0 8 8 0 1 0 16 0M4 12h16M12 4c3 2.6 3 13.4 0 16-3-2.6-3-13.4 0-16z',
    link: 'M9.5 14.5l5-5M8.5 12 6 14.5a3.5 3.5 0 0 0 5 5l2.5-2.5M15.5 12 18 9.5a3.5 3.5 0 0 0-5-5L10.5 7',
    rocket: 'M12 3c3 2 4.2 5.8 4.2 9L12 16.2 7.8 12c0-3.2 1.2-7 4.2-9zM8 12.5l-3 3 1 2.2 3.2-1.2M16 12.5l3 3-1 2.2-3.2-1.2M13.5 9a1.5 1.5 0 1 0-3 0 1.5 1.5 0 1 0 3 0',
    mail: 'M4 6h16v12H4zM4 8l8 6 8-6',
    check: 'M5 13l4.5 4.5L19 7',
    layers: 'M12 3l8 4.5-8 4.5-8-4.5L12 3zM4.5 12.5 12 16.7l7.5-4.2M4.5 16.5 12 20.7l7.5-4.2',
    spark: 'M12 3l2 6.2 6.2 2-6.2 2L12 19.4l-2-6.2-6.2-2 6.2-2L12 3z',
  };
  const KEY = [
    [/work\s?flow|process|operat|automat|stream|system|pipeline/, 'gear'],
    [/productiv|growth|grow|increase|boost|improve|scal|revenue|sales up|trend/, 'chartup'],
    [/design|creat(?!ure)|craft|draw|brand/, 'pen'],
    [/market|promot|campaign|advert|outreach|announce/, 'megaphone'],
    [/business|owner|manag|enterprise|company|portfolio/, 'briefcase'],
    [/team|collab|people|user|customer|audience|community|partner|stakeholder/, 'people'],
    [/time|speed|fast|schedul|deadline|wait|hour|instant/, 'clock'],
    [/money|cost|price|pricing|budget|fund|profit|afford|spend/, 'dollar'],
    [/idea|innovat|insight|brainstorm|think|smart/, 'bulb'],
    [/data|chart|report|metric|analy|statistic|measure|dashboard/, 'bars'],
    [/secur|safe|protect|risk|privacy|trust|compli/, 'shield'],
    [/goal|target|focus|objective|aim|precision|accura/, 'target'],
    [/doc|content|write|text|note|article|blog|copy/, 'doc'],
    [/search|research|discover|explor|find|identif/, 'search'],
    [/support|help|care|service|wellness|health|love/, 'heart'],
    [/quality|excellen|best|premium|review|rating|reward|recogni/, 'star'],
    [/milestone|phase|launch plan|stage|flag|goal post/, 'flag'],
    [/global|world|international|web|online|remote/, 'globe'],
    [/integrat|connect|link|api|sync|share|network/, 'link'],
    [/launch|start|kick|deploy|ship|accelerat/, 'rocket'],
    [/email|mail|message|communicat|inbox|newsletter|feedback/, 'mail'],
    [/done|complete|assur|verify|valid|approv|check|task/, 'check'],
    [/layer|stack|foundation|structure|architecture|tier/, 'layers'],
  ];
  function pick(text) {
    const t = String(text || '').toLowerCase();
    for (const [re, name] of KEY) if (re.test(t)) return name;
    return 'spark';
  }
  function draw(x, y, size, nameOrText, color, sw) {
    const name = P[nameOrText] ? nameOrText : pick(nameOrText);
    return (
      <g transform={`translate(${(x - size / 2).toFixed(1)} ${(y - size / 2).toFixed(1)}) scale(${(size / 24).toFixed(3)})`}>
        <path d={P[name]} fill="none" stroke={color} strokeWidth={sw || 1.9} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    );
  }
  window.GlyphIcons = { draw, pick, PATHS: P };
})();
