// Glyph — gallery: a showcase document with one example visual for every diagram type
(function () {
  const uid = () => 'g' + Math.random().toString(36).slice(2, 9);
  const it = (label, detail, value) => {
    const o = { label };
    if (detail) o.detail = detail;
    if (value) o.value = value;
    return o;
  };

  // category fallbacks
  const FALLBACK = {
    'Flow & process': () => ({ title: 'Orbit 2.0 launch plan', items: [it('Discover', 'Interviews and market scan'), it('Design', 'Prototype and validate'), it('Build', 'Core platform and integrations'), it('Ship', 'Beta, GA and follow-through')] }),
    'Lists & boards': () => ({ title: 'Release checklist', items: [it('Docs updated', 'Guides cover the new editor'), it('Pricing live', 'Plans page reflects new tiers'), it('Support briefed', 'Macros and FAQ ready'), it('Status page ready', 'Components mapped to services'), it('Announcement queued', 'Email and social scheduled')] }),
    'Charts & data': () => ({ title: 'ARR by quarter', items: [it('Q1', null, '$1.2M'), it('Q2', null, '$1.8M'), it('Q3', null, '$2.6M'), it('Q4', null, '$3.4M')] }),
    'Relationships': () => ({ title: 'Platform ecosystem', items: [it('APIs', 'Public endpoints and webhooks'), it('Apps', 'Marketplace extensions'), it('Partners', 'Resellers and integrators'), it('Community', 'Forums and champions')] }),
    'Metaphors': () => ({ title: 'Growth strategy', items: [it('Land', 'Win the first team'), it('Expand', 'Grow seats and usage'), it('Deepen', 'Adopt more workflows'), it('Advocate', 'Turn users into referrers')] }),
  };

  const SPECS = {
    ringchain: () => ({ title: 'Business success process', items: [it('Analyze', 'Audit operations and market trends'), it('Plan', 'Set goals, owners and timelines'), it('Invest', 'Fund the highest-return bets'), it('Execute', 'Ship with weekly checkpoints'), it('Optimize', 'Tune from live metrics')] }),
    journey: () => ({ title: 'Customer journey', items: [it('Awareness', 'Finds Orbit through content'), it('Consideration', 'Compares plans and reviews'), it('Purchase', 'Starts on the Growth plan'), it('Advocacy', 'Refers two teammates')] }),
    cycle: () => ({ title: 'Feedback loop', items: [it('Collect', 'In-app surveys and interviews'), it('Analyze', 'Cluster themes weekly'), it('Act', 'Ship the top fix'), it('Measure', 'Track impact on NPS')] }),
    semicircle: () => ({ title: 'Rollout in five steps', items: [it('Pilot', 'Two friendly accounts'), it('Beta', 'Invite-only cohort'), it('Self-serve', 'Open signups'), it('Scale', 'Lift rate limits'), it('Global', 'EU and APAC regions')] }),
    gridcycle: () => ({ title: 'Sprint rhythm', items: [it('Plan', 'Pick the sprint goal'), it('Build', 'Heads-down focus time'), it('Review', 'Demo to stakeholders'), it('Test', 'Dogfood and QA'), it('Ship', 'Release behind a flag'), it('Retro', 'Capture one improvement')] }),
    timeline: () => ({ title: 'Roadmap 2026', items: [it('Private beta', '200 design partners', 'July'), it('Early access', 'Self-serve with referrals', 'August'), it('General availability', 'New pricing goes live', 'Sep 15'), it('Expansion', 'Enterprise SSO, EU residency', 'Q4')] }),
    milestones: () => ({ title: 'Launch milestones', items: [it('Beta opens', '200 design partners', 'July'), it('Early access', 'Referral invites', 'August'), it('GA', 'Public launch day', 'Sep 15'), it('EU residency', 'Frankfurt region live', 'Q4')] }),
    gantt: () => ({ title: 'First-half schedule', items: [it('Discovery', null, 'Jan – Feb'), it('Build', null, 'Feb – Apr'), it('Beta', null, 'Apr – May'), it('Launch', null, 'Jun')] }),
    fishbone: () => ({ title: 'Churn root causes', items: [it('Pricing', 'Annual plans feel rigid'), it('Product', 'Missing mobile app'), it('Support', 'Slow first response'), it('Competition', 'Aggressive discounting')] }),
    cascade: () => ({ title: 'Platform benefits', items: [it('Automation', 'Workflows replace busywork', '12 hrs saved / wk'), it('Insights', 'Live dashboards for every team', '3x faster reporting'), it('Integrations', 'Connects the whole stack', '40+ connectors'), it('Security', 'Enterprise-grade controls', 'SOC 2 Type II')] }),
    bracket: () => ({ title: 'Naming playoff', items: [it('Orbit'), it('Nova'), it('Pulse'), it('Vega')] }),
    tree: () => ({ title: 'Growth options', items: [it('Build', 'New product line in-house'), it('Buy', 'Acquire a niche player'), it('Partner', 'Co-sell with platforms'), it('Expand', 'New regions for the core product')] }),

    table: () => ({ title: 'Team roles', items: [it('Product', 'Roadmap and priorities'), it('Engineering', 'Build and operate the platform'), it('Design', 'Research and product UX'), it('Marketing', 'Positioning and demand')] }),
    rowtable: () => ({ title: 'Action plans', items: [it('Outreach', 'Personalized emails to dormant accounts', '10% response'), it('Loyalty', 'Quarterly perks for power users', '500 retained'), it('Webinars', 'Monthly product deep dives', '1k signups')] }),
    matrix: () => ({ title: 'Effort vs impact', items: [it('Quick wins', 'Low effort, high impact'), it('Big bets', 'High effort, high impact'), it('Fill-ins', 'Low effort, low impact'), it('Time sinks', 'High effort, low impact')] }),
    honeycomb: () => ({ title: 'Culture principles', items: [it('Default to open'), it('Ship to learn'), it('Own the outcome'), it('Stay curious'), it('Win as a team')] }),
    puzzle: () => ({ title: 'Integrated suite', items: [it('Docs', 'Plan together'), it('Boards', 'Track the work'), it('Chat', 'Decide quickly'), it('Analytics', 'See the impact')] }),
    puzzlering: () => ({ title: 'Integrated suite', items: [it('Docs', 'Plan together'), it('Boards', 'Track the work'), it('Chat', 'Decide quickly'), it('Analytics', 'See the impact')] }),

    stats: () => ({ title: 'Q3 highlights', items: [it('Uptime', 'Rolling 90 days', '99.98%'), it('NPS', 'Up 9 points', '62'), it('ARR', 'Up 31% QoQ', '$2.6M'), it('Churn', 'Best quarter yet', '1.8%')] }),
    ringcards: () => ({ title: 'Goal progress', items: [it('Activation', 'Target 80%', '78%'), it('Retention', 'Target 70%', '64%'), it('Referrals', 'Target 50%', '41%'), it('Expansion', 'Target 60%', '55%')] }),
    donut: () => ({ title: 'Revenue mix', items: [it('Subscriptions', null, '62%'), it('Services', null, '21%'), it('Marketplace', null, '11%'), it('Other', null, '6%')] }),
    pie: () => ({ title: 'Revenue mix', items: [it('Subscriptions', null, '62%'), it('Services', null, '21%'), it('Marketplace', null, '11%'), it('Other', null, '6%')] }),
    radial: () => ({ title: 'Team capacity', items: [it('Platform', null, '85%'), it('Mobile', null, '70%'), it('Data', null, '55%'), it('Design', null, '40%')] }),
    gauge: () => ({ title: 'Customer satisfaction', items: [it('CSAT', 'Last 30 days', '87%'), it('CES', 'Effort score', '74%'), it('NPS', 'Promoters minus detractors', '62%')] }),
    gaugerow: () => ({ title: 'Adoption by segment', items: [it('Enterprise', 'Rolled out via SSO', '72%'), it('Mid-market', 'Champion-led growth', '64%'), it('SMB', 'Self-serve onboarding', '58%')] }),
    waterfall: () => ({ title: 'Cash bridge', items: [it('Opening', null, '$4.0M'), it('New sales', null, '+$1.6M'), it('Churn', null, '-$0.4M'), it('Costs', null, '-$1.1M'), it('Closing', null, '$4.1M')] }),

    venn: () => ({ title: 'The sweet spot', items: [it('Desirable', 'What customers want'), it('Feasible', 'What we can build'), it('Viable', 'What sustains the business')] }),
    comparison: () => ({ title: 'Build vs buy', items: [it('Build', 'Full control, slower start'), it('Buy', 'Faster start, license costs')] }),
    versus: () => ({ title: 'Orbit vs legacy suite', items: [it('Orbit', 'Modern, API-first'), it('Legacy suite', 'Entrenched, full-featured'), it('Hours to onboard'), it('Weeks to onboard'), it('Usage-based pricing'), it('Seat licenses')] }),
    proscons: () => ({ title: 'Remote-first policy', items: [it('Wider talent pool'), it('Lower office costs'), it('Async by default'), it('Harder onboarding'), it('Limited timezone overlap'), it('Culture takes effort')] }),
    balance: () => ({ title: 'Speed vs quality', items: [it('Speed', 'Ship weekly, learn fast'), it('Quality', 'Earn trust with polish')] }),
    target: () => ({ title: 'North star', items: [it('Weekly active teams', 'The metric that matters'), it('Activation and retention', 'Direct drivers'), it('Onboarding and education', 'Inputs we control')] }),
    nested: () => ({ title: 'Market sizing', items: [it('TAM', 'All team software', '$8B'), it('SAM', 'Mid-market knowledge teams', '$2.1B'), it('SOM', 'Reachable in 3 years', '$300M')] }),
    infohub: () => ({ title: 'Platform pillars', items: [it('Analytics', 'Dashboards, funnels and cohorts'), it('Automation', 'Triggers, schedules and rules'), it('Integrations', 'Native apps plus open API'), it('Security', 'SSO, audit logs, residency'), it('Support', '24/5 chat with real engineers')] }),
    sidehub: () => ({ title: 'Launch team', items: [it('Product', 'Scope and sequencing'), it('Engineering', 'Build and reliability'), it('Design', 'Story and polish'), it('Marketing', 'Message and demand'), it('Sales', 'Pipeline readiness'), it('Support', 'Docs and escalation')] }),

    funnel: () => ({ title: 'Sales funnel', items: [it('Visitors', null, '48k'), it('Signups', null, '6.2k'), it('Activated', null, '2.9k'), it('Paying', null, '940')] }),
    sidefunnel: () => ({ title: 'Sales funnel', items: [it('Visitors', 'Organic and paid traffic', '48k'), it('Signups', 'Free workspace created', '6.2k'), it('Activated', 'First project shipped', '2.9k'), it('Paying', 'Upgraded within 30 days', '940')] }),
    funnelarrows: () => ({ title: 'Hiring pipeline', items: [it('Applied', 'All inbound and sourced', '1,240'), it('Screened', 'Recruiter calls', '320'), it('Interviewed', 'Full loops', '88'), it('Offers', 'Accepted: 10', '12')] }),
    discfunnel: () => ({ title: 'Marketing funnel', items: [it('Awareness', 'Saw the campaign', '120k'), it('Interest', 'Visited pricing', '36k'), it('Evaluation', 'Started a trial', '9k'), it('Purchase', 'Became customers', '2.1k')] }),
    cone: () => ({ title: 'Lead qualification', items: [it('All leads', 'Everything in the CRM', '5,400'), it('Qualified', 'Fit and intent confirmed', '1,800'), it('Opportunities', 'Active evaluations', '420'), it('Closed won', 'New logos this year', '96')] }),
    pyramid: () => ({ title: 'Brand pyramid', items: [it('Essence', 'Why we exist'), it('Values', 'How we behave'), it('Benefits', 'What customers gain'), it('Features', 'What we offer')] }),
    iceberg: () => ({ title: 'Cost of an outage', items: [it('Lost revenue', 'Checkout downtime'), it('Refunds', 'Goodwill credits'), it('Trust erosion', 'Quiet churn over months'), it('Team burnout', 'On-call fatigue')] }),
    pencil: () => ({ title: 'Enablement tracks', items: [it('Product basics', 'First-week essentials'), it('Advanced workflows', 'Automations and templates'), it('Admin and security', 'Roles, SSO and audit'), it('Analytics mastery', 'Dashboards that persuade')] }),
    stairs: () => ({ title: 'Data maturity', items: [it('Reporting', 'Know what happened'), it('Insights', 'Know why'), it('Predictions', 'Know what is next'), it('Automation', 'Act without asking')] }),
    ladder: () => ({ title: 'Data maturity', items: [it('Reporting', 'Know what happened'), it('Insights', 'Know why'), it('Predictions', 'Know what is next'), it('Automation', 'Act without asking')] }),
    pillars: () => ({ title: 'Strategy pillars', items: [it('Self-serve growth', 'Frictionless first mile'), it('Enterprise readiness', 'Security and scale'), it('Ecosystem', 'Partners and platform'), it('Operational excellence', 'Reliability as a feature')] }),
    bridge: () => ({ title: 'Closing the gap', items: [it('Today', 'Manual weekly reports'), it('The gap', 'No shared data layer'), it('Tomorrow', 'Live dashboards for everyone')] }),
    gears: () => ({ title: 'Operating cadence', items: [it('Strategy', 'Quarterly bets'), it('Planning', 'Monthly priorities'), it('Execution', 'Weekly shipping')] }),
    gearring: () => ({ title: 'Operating cadence', items: [it('Strategy', 'Quarterly bets'), it('Planning', 'Monthly priorities'), it('Execution', 'Weekly shipping')] }),

    snake: () => ({ title: 'Onboarding path', items: [it('Sign up', 'Email or SSO'), it('Invite team', 'Three seats to start'), it('Import data', 'CSV or live sync'), it('First project', 'Template gallery'), it('Automate', 'Set one workflow'), it('Master', 'Power-user shortcuts')] }),
    metro: () => ({ title: 'Launch route', items: [it('Kickoff', 'Scope locked', 'Week 1'), it('Alpha', 'Internal dogfood', 'Week 4'), it('Beta', 'Design partners in', 'Week 8'), it('GA', 'Public release', 'Week 12')] }),
    filmstrip: () => ({ title: 'Release highlights', items: [it('New editor', 'Blocks and slash commands', 'v2.0'), it('Automations', 'Triggers and schedules', 'v2.1'), it('Mobile app', 'iOS and Android', 'v2.2'), it('AI assist', 'Drafts and summaries', 'v2.3')] }),
    sticky: () => ({ title: 'Brainstorm wall', items: [it('Referral program', 'Give a month, get a month'), it('Template store', 'Community-built starters'), it('Usage pricing', 'Pay for what you run'), it('Partner API', 'Co-build with platforms'), it('Annual summit', 'Bring customers together'), it('Status academy', 'Certification course')] }),
    bento: () => ({ title: 'Q4 priorities', items: [it('Enterprise SSO', 'Unblocks the five largest deals in pipeline', 'Top bet'), it('EU residency', 'Frankfurt region'), it('Mobile beta', '500 testers'), it('New onboarding', 'Halve time-to-value'), it('SOC 2', 'Audit closes Nov')] }),
    shelf: () => ({ title: 'Reading list', items: [it('Positioning', null, 'Apr'), it('Continuous Discovery', null, 'May'), it('Good Strategy', null, 'Jun'), it('Demand Side Sales', null, 'Jul'), it('Output Management', null, 'Aug')] }),
    lollipop: () => ({ title: 'Feature requests', items: [it('API access', null, '320'), it('Dark mode', null, '270'), it('Offline mode', null, '180'), it('Custom roles', null, '140')] }),
    bullet: () => ({ title: 'Goal attainment', items: [it('New ARR', null, '82%'), it('Activation', null, '74%'), it('Retention', null, '91%'), it('Hiring', null, '60%')] }),
    pictobar: () => ({ title: 'Team allocation', items: [it('Platform', null, '8'), it('Mobile', null, '6'), it('Data', null, '4'), it('Design', null, '3')] }),
    overlap: () => ({ title: 'Where we win', items: [it('Design', 'Craft people feel'), it('Engineering', 'Speed without debt'), it('Data', 'Decisions with evidence')] }),
    bowtie: () => ({ title: 'Deal flow', items: [it('Inbound', 'Content and referrals'), it('Outbound', 'Targeted sequences'), it('Partners', 'Co-sell motions'), it('Qualified', 'Fit and intent'), it('Nurture', 'Not yet ready'), it('Closed won', 'New customers')] }),
    ripple: () => ({ title: 'Pricing change effects', items: [it('Revenue', 'Immediate uplift on renewals'), it('Churn', 'Watch the next two cohorts'), it('Brand', 'Premium perception shift'), it('Partners', 'Margin renegotiation')] }),
    rocket: () => ({ title: 'Path to $10M ARR', items: [it('Find PMF', 'Ten devoted teams'), it('Repeatable sales', 'Playbook that closes'), it('Scale channels', 'Two that compound'), it('Expand globally', 'EU then APAC')] }),
    hourglass: () => ({ title: 'Hiring to impact', items: [it('1,200 applicants', 'All sources'), it('80 interviews', 'Structured loops'), it('12 offers', 'Ten accepted'), it('Onboarded', 'Productive in 30 days'), it('Shipping', 'Owning roadmap items'), it('Leading', 'Raising the bar')] }),
    burst: () => ({ title: 'Customer health signals', items: [it('Logins', 'Weekly active trend'), it('Support load', 'Tickets per account'), it('Adoption', 'Breadth of features used'), it('Billing', 'Failed payments and downgrades'), it('Champions', 'Power users per team'), it('Feedback', 'NPS and review verbatims'), it('Integrations', 'Connected tools count'), it('Security posture', 'SSO and audit usage')] }),
  };

  function specFor(type, catName) {
    const f = SPECS[type] || FALLBACK[catName] || FALLBACK['Flow & process'];
    return f();
  }

  function galleryBlocks() {
    const cats = window.TYPE_CATEGORIES || [];
    const D9 = window.DIAGRAMS || {};
    const blocks = [];
    blocks.push({ id: uid(), kind: 'text', tag: 'h1', html: 'Glyph Visual Gallery' });
    blocks.push({ id: uid(), kind: 'text', tag: 'p', html: 'One worked example of every visual type. Click any visual to restyle, recolor, or switch its layout.' });
    let vi = 0;
    cats.forEach((cat) => {
      blocks.push({ id: uid(), kind: 'text', tag: 'h2', html: cat.name });
      cat.types.forEach((type) => {
        if (!D9[type]) return;
        const spec = specFor(type, cat.name);
        const source = spec.title + ': ' + spec.items.map((x) => x.label + (x.detail ? ' — ' + x.detail : '') + (x.value ? ' (' + x.value + ')' : '')).join('; ') + '.';
        blocks.push({ id: uid(), kind: 'text', tag: 'p', html: '<b>' + (D9[type].name || type) + '</b>' });
        blocks.push({
          id: uid(),
          kind: 'visual',
          visual: { id: uid(), type, style: 'clean', palette: [7, 8, 9][vi++ % 3], conn: {}, layout: {}, notes: [], source, spec: { title: spec.title, items: spec.items } },
        });
      });
    });
    return blocks;
  }

  window.GlyphGallery = { galleryBlocks };
})();
