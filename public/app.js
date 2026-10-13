const $ = (id) => document.getElementById(id);
const LABEL = { W: 'Won', L: 'Lost', T: 'Tied' };
// Owner ids are ESPN account GUIDs like "{ABC-…}"; pages use them lowercase and unbraced.
const ownerSlug = (id) => String(id || '').replace(/[{}]/g, '').toLowerCase();
const ownerHref = (slug) => `#owner/${slug}`;
const teamHref = (slug, season) => `#team/${slug}/${season}`;

// Inline box-and-whisker plot on an axis shared by every row (col.axis) so rows compare directly.
function boxPlot(box, { min, max }) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 300, H = 26, PAD = 6, MID = H / 2;
  const x = (v) => PAD + ((v - min) / (max - min || 1)) * (W - 2 * PAD);
  const mk = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'boxplot', role: 'img' });
  svg.setAttribute('aria-label', `Scores from ${box.min} to ${box.max}, median ${box.median}, middle half ${box.q1} to ${box.q3}`);
  svg.append(mk('title', {}));
  svg.firstChild.textContent = `min ${box.min} · Q1 ${box.q1} · median ${box.median} · Q3 ${box.q3} · max ${box.max}`;
  svg.append(
    mk('line', { x1: x(box.whiskerLow), x2: x(box.q1), y1: MID, y2: MID, class: 'bp-line' }),
    mk('line', { x1: x(box.q3), x2: x(box.whiskerHigh), y1: MID, y2: MID, class: 'bp-line' }),
    mk('line', { x1: x(box.whiskerLow), x2: x(box.whiskerLow), y1: MID - 5, y2: MID + 5, class: 'bp-line' }),
    mk('line', { x1: x(box.whiskerHigh), x2: x(box.whiskerHigh), y1: MID - 5, y2: MID + 5, class: 'bp-line' }),
    mk('rect', { x: x(box.q1), y: MID - 8, width: Math.max(x(box.q3) - x(box.q1), 1), height: 16, class: 'bp-box' }),
    mk('line', { x1: x(box.median), x2: x(box.median), y1: MID - 8, y2: MID + 8, class: 'bp-median' }),
  );
  for (const o of box.outliers) svg.append(mk('circle', { cx: x(o), cy: MID, r: 2.5, class: 'bp-out' }));
  return svg;
}

// Dots on a 0..max axis, one per alternate universe; duplicates stack. The real outcome is ringed.
function stripPlot({ values, actual }, { min, max }) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 220, H = 30, PAD = 8, R = 3.2;
  const x = (v) => PAD + ((v - min) / (max - min || 1)) * (W - 2 * PAD);
  const mk = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, class: 'strip', role: 'img' });
  svg.append(mk('line', { x1: PAD, x2: W - PAD, y1: H - 7, y2: H - 7, class: 'bp-line' }));
  const stack = new Map();
  for (const v of values) {
    const n = stack.get(v) || 0;
    stack.set(v, n + 1);
    svg.append(mk('circle', { cx: x(v), cy: H - 7 - R - 1 - n * (R * 2 + 0.5), r: R, class: 'st-dot' }));
  }
  svg.append(mk('circle', { cx: x(actual), cy: H - 7, r: 4.5, class: 'st-actual' }));
  const title = mk('title', {});
  title.textContent = `Actual: ${actual} wins · other universes: ${[...values].sort((a, b) => a - b).join(', ')}`;
  svg.append(title);
  return svg;
}

// Weekly scores as a line, with the league average that week as a dotted line.
function sparkline({ points, avg, weeks }) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 220, H = 40, PX = 6, PY = 5;
  // Each row is scaled to its own range so the shape reads clearly; the dotted line keeps league context.
  const all = [...points, ...avg];
  const min = Math.min(...all), max = Math.max(...all);
  const x = (i) => PX + (points.length > 1 ? (i / (points.length - 1)) * (W - 2 * PX) : (W - 2 * PX) / 2);
  const y = (v) => H - PY - ((v - min) / (max - min || 1)) * (H - 2 * PY);
  const mk = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const line = (arr) => arr.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, class: 'spark', role: 'img' });
  svg.append(
    mk('polyline', { points: line(avg), class: 'sp-avg' }),
    mk('polyline', { points: line(points), class: 'sp-line' }),
    mk('circle', { cx: x(points.length - 1), cy: y(points[points.length - 1]), r: 2.5, class: 'sp-end' }),
  );
  const title = mk('title', {});
  title.textContent = points.map((p, i) => `wk ${weeks[i]}: ${p} (avg ${avg[i]})`).join('\n');
  svg.append(title);
  return svg;
}

// Radar of position shares relative to the league (1.0 = league average, drawn as the dashed ring).
function radarPlot({ labels, values, shares, league }) {
  const NS = 'http://www.w3.org/2000/svg';
  const S = 96, C = S / 2, R = 30, MAX = 1.8;
  const n = labels.length;
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const r = (Math.min(v, MAX) / MAX) * R;
    return [C + Math.cos(a) * r, C + Math.sin(a) * r];
  };
  const mk = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };
  const ring = (v) => labels.map((_, i) => pt(i, v).map((c) => c.toFixed(1)).join(',')).join(' ');
  const svg = mk('svg', { viewBox: `0 0 ${S} ${S}`, class: 'radar', role: 'img' });
  svg.append(mk('polygon', { points: ring(MAX), class: 'rd-frame' }), mk('polygon', { points: ring(1), class: 'rd-league' }));
  labels.forEach((_, i) => { const [x, y] = pt(i, MAX); svg.append(mk('line', { x1: C, y1: C, x2: x.toFixed(1), y2: y.toFixed(1), class: 'rd-frame' })); });
  svg.append(mk('polygon', { points: values.map((v, i) => pt(i, v).map((c) => c.toFixed(1)).join(',')).join(' '), class: 'rd-shape' }));
  labels.forEach((label, i) => {
    const [x, y] = pt(i, MAX * 1.22);
    const t = mk('text', { x: x.toFixed(1), y: (y + 2.5).toFixed(1), class: 'rd-label', 'text-anchor': 'middle' });
    t.textContent = label;
    svg.append(t);
  });
  const title = mk('title', {});
  title.textContent = labels.map((l, i) => `${l}: ${shares[i]}% (league ${league[i]}%)`).join('\n');
  svg.append(title);
  return svg;
}

function cell(col, row) {
  const td = document.createElement('td');
  if (col.type === 'num') td.className = 'num';
  if (col.side) td.classList.add(`side-${col.side}`);
  if (col.wrap) td.classList.add('wrap');
  if (col.key === 'team') td.classList.add('team-name');
  const v = row[col.key];
  if (col.type === 'boxplot') {
    td.append(boxPlot(v, col.axis));
  } else if (col.type === 'strip') {
    td.append(stripPlot(v, col.axis));
  } else if (col.type === 'radar') {
    td.append(radarPlot(v));
  } else if (col.type === 'share') {
    td.className = 'num';
    td.append(`${v.toFixed(1)}%`);
    const d = v - col.league;
    td.append(Object.assign(document.createElement('span'), { className: `diff ${d > 0.05 ? 'up' : d < -0.05 ? 'down' : ''}`, textContent: `${d > 0 ? '+' : ''}${d.toFixed(1)}` }));
  } else if (col.type === 'sparkline') {
    td.append(sparkline(v));
  } else if (col.type === 'result') {
    const b = document.createElement('span');
    b.className = `badge ${v}`;
    b.textContent = LABEL[v] || v;
    td.append(b);
  } else if (col.type === 'owner' && row.ownerId) {
    td.append(Object.assign(document.createElement('a'), { href: ownerHref(ownerSlug(row.ownerId)), textContent: v }));
  } else if (col.key === 'team' && row.ownerId) {
    // A team name belongs to one season, so it goes to that team's season page when we know the season.
    const href = typeof row.season === 'number' ? teamHref(ownerSlug(row.ownerId), row.season) : ownerHref(ownerSlug(row.ownerId));
    td.append(Object.assign(document.createElement('a'), { href, textContent: v }));
  } else if (col.key === 'opponent' && row.opponentOwnerId) {
    const href = typeof row.season === 'number' ? teamHref(ownerSlug(row.opponentOwnerId), row.season) : ownerHref(ownerSlug(row.opponentOwnerId));
    td.append(Object.assign(document.createElement('a'), { href, textContent: v }));
  } else {
    td.textContent = col.key === 'points' || col.key === 'opponentPoints' ? v.toFixed(2)
      : col.key === 'winPct' ? `${(v * 100).toFixed(1)}%` : v;
    if (col.key === 'week' && row.playoff) td.textContent += ' (playoffs)';
  }
  // In a matchup block the higher score is bold and the lower one muted, like a scoreboard.
  if ((col.side === 'score-a' || col.side === 'score-b') && typeof row.points === 'number' && typeof row.opponentPoints === 'number') {
    const mine = col.side === 'score-a' ? row.points : row.opponentPoints;
    const theirs = col.side === 'score-a' ? row.opponentPoints : row.points;
    td.classList.add(mine > theirs ? 'score-win' : mine < theirs ? 'score-lose' : 'score-tie');
  }
  return td;
}

// Served by the Node server (live ESPN data) or as static JSON on GitHub Pages.
let staticMode = false;
const teamUrl = (slug, season) => (staticMode ? `data/teams/${slug}-${season}.json` : `api/teams/${slug}/${season}`);
const ownerUrl = (slug) => (staticMode ? `data/owners/${slug}.json` : `api/owners/${slug}`);
const apiUrl = (path) => (staticMode ? `data/${path || 'analyses'}.json` : `api/analyses${path ? '/' + path : ''}`);

// Table state for the current analysis: sorting + filtering happen client-side.
let view = null;

function el(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
}

function select(name, label, values) {
  const s = el('select', { name }, el('option', { value: '', textContent: `${label}: all` }));
  for (const v of values) s.append(el('option', { value: v.value, textContent: v.label }));
  return s;
}

function buildFilters(data) {
  const f = $('filters');
  f.innerHTML = '';
  const rows = data.rows;
  const uniq = (key) => [...new Set(rows.map((r) => r[key]))];
  f.append(el('input', { type: 'search', name: 'q', placeholder: 'Search team, owner, player…' }));
  if (rows.some((r) => 'season' in r)) {
    f.append(select('season', 'Season', uniq('season').sort((a, b) => b - a).map((v) => ({ value: v, label: v }))));
  }
  if (rows.some((r) => r.ownerId)) {
    // Owners are keyed by their stable account id; team names change from season to season.
    const owners = new Map();
    for (const r of rows) {
      const o = owners.get(r.ownerId) || { names: new Set(), latest: -Infinity, label: r.owner };
      o.names.add(r.team);
      if (r.season >= o.latest) { o.latest = r.season; o.label = `${r.owner || 'Unknown'} (${r.team})`; }
      owners.set(r.ownerId, o);
    }
    f.append(select('ownerId', 'Owner', [...owners].map(([value, o]) => ({ value, label: o.label })).sort((a, b) => a.label.localeCompare(b.label))));
  } else if (rows.some((r) => 'team' in r)) {
    f.append(select('team', 'Team', uniq('team').sort().map((v) => ({ value: v, label: v }))));
  }
  if (rows.some((r) => r.arc)) {
    f.append(select('arc', 'Arc', uniq('arc').sort().map((v) => ({ value: v, label: v }))));
  }
  if (rows.some((r) => r.kind)) {
    f.append(select('kind', 'Type', uniq('kind').sort().map((v) => ({ value: v, label: v }))));
  }
  if (rows.some((r) => r.position)) {
    f.append(select('position', 'Position', uniq('position').filter(Boolean).sort().map((v) => ({ value: v, label: v }))));
  }
  if (rows.some((r) => 'result' in r)) {
    f.append(select('result', 'Result', ['W', 'L', 'T'].filter((r) => uniq('result').includes(r)).map((v) => ({ value: v, label: LABEL[v] }))));
  }
  if (rows.some((r) => 'playoff' in r)) {
    f.append(select('playoff', 'Games', [{ value: 'false', label: 'Regular season' }, { value: 'true', label: 'Playoffs' }]));
  }
  f.append(el('button', { type: 'reset', textContent: 'Reset' }));
  f.hidden = false;
}

function matches(row, f) {
  if (f.season && String(row.season) !== f.season) return false;
  if (f.ownerId && row.ownerId !== f.ownerId) return false;
  if (f.team && row.team !== f.team) return false;
  if (f.position && row.position !== f.position) return false;
  if (f.kind && row.kind !== f.kind) return false;
  if (f.arc && row.arc !== f.arc) return false;
  if (f.result && row.result !== f.result) return false;
  if (f.playoff && String(!!row.playoff) !== f.playoff) return false;
  if (f.q) {
    const hay = [row.team, row.opponent, row.owner, row.player].filter(Boolean).join(' ').toLowerCase();
    if (!hay.includes(f.q.toLowerCase())) return false;
  }
  return true;
}

function render() {
  const { data, sort } = view;
  const f = Object.fromEntries(new FormData($('filters')));
  let rows = data.rows.filter((r) => matches(r, f));
  if (sort) {
    const dir = sort.dir === 'asc' ? 1 : -1;
    rows = rows.slice().sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return c * dir;
    });
  }
  $('count').textContent = `Showing ${rows.length} of ${data.rows.length}`;
  const table = $('table');
  table.innerHTML = '';
  const head = table.createTHead().insertRow();
  for (const c of data.columns) {
    const sortKey = c.sortKey || c.key;
    const active = sort && sort.key === sortKey;
    const th = el('th', { className: `${c.type === 'num' ? 'num ' : ''}sortable${c.side ? ` side-${c.side}` : ''}`, tabIndex: 0, textContent: c.label + (active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '') });
    th.setAttribute('aria-sort', active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
    const toggle = () => {
      const first = c.type === 'num' || c.type === 'result' || c.type === 'boxplot' || c.type === 'strip' || c.type === 'sparkline' || c.type === 'radar' || c.type === 'share' ? 'desc' : 'asc';
      const next = !active ? first : sort.dir === 'asc' ? 'desc' : 'asc';
      view.sort = { key: sortKey, dir: next };
      render();
    };
    th.onclick = toggle;
    th.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
    head.append(th);
  }
  const body = table.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    for (const c of data.columns) tr.append(cell(c, row));
  }
  if (!rows.length) body.insertRow().insertCell().textContent = 'No rows match these filters.';
}

function showView(name) {
  $('home').hidden = name !== 'home';
  $('analysis').hidden = name !== 'analysis';
  $('profile').hidden = name !== 'profile';
  if (name !== 'analysis') document.querySelectorAll('nav button').forEach((b) => b.classList.remove('active'));
}

// Landing page: just links. Grouping is presentation only; unknown analyses fall into "More".
const HOME_GROUPS = [
  ['League history', ['top-weeks', 'standings', 'head-to-head']],
  ['Drafts and rosters', ['draft', 'efficiency', 'heartbreak', 'fingerprint']],
  ['Schedule and luck', ['parallel-universe']],
  ['Trends and streaks', ['consistency', 'season-arc', 'clutch', 'hot-hand']],
];

const HOME_BLURBS = {
  'top-weeks': 'The highest single-week scores ever, and whether they won.',
  standings: 'Every owner’s all-time record, with links to their pages.',
  'head-to-head': 'A matrix of every owner’s record against every other.',
  draft: 'Every pick ranked by how the player finished vs where he went.',
  efficiency: 'How much of each roster’s potential made it into the lineup.',
  heartbreak: 'Losses that a different lineup (or a few points) would have flipped.',
  fingerprint: 'Where each team’s points came from, by position.',
  'parallel-universe': 'Each season replayed on every other owner’s schedule.',
  consistency: 'Weekly score spread per team, with box plots.',
  'season-arc': 'The shape of each season, week by week.',
  clutch: 'Playoff scoring vs the same owner’s regular season.',
  'hot-hand': 'What happens the week after a big (or awful) week.',
};

function showHome() {
  document.title = 'Fantasy Football Analyzer';
  showView('home');
  const root = $('home');
  root.innerHTML = '';
  const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
  root.append(
    el('h2', { className: 'home-title', textContent: 'Your league, in numbers' }),
    el('p', { className: 'muted', textContent: 'Pick an analysis below. Click any owner or team name inside a table to open their page.' }),
  );
  const byId = new Map(analyses.map((a) => [a.id, a]));
  const used = new Set();
  const groups = HOME_GROUPS.map(([title, ids]) => [title, ids.filter((id) => byId.has(id)).map((id) => byId.get(id))]);
  for (const [, list] of groups) list.forEach((a) => used.add(a.id));
  const rest = analyses.filter((a) => !used.has(a.id));
  if (rest.length) groups.push(['More', rest]);
  for (const [title, list] of groups) {
    if (!list.length) continue;
    root.append(el('h3', { className: 'home-group', textContent: title }));
    const grid = el('div', { className: 'home-grid' });
    for (const a of list) {
      grid.append(el('a', { className: 'home-card', href: `#a/${a.id}` }, el('strong', { textContent: a.title }), el('span', { textContent: HOME_BLURBS[a.id] || a.description })));
    }
    root.append(grid);
  }
}

async function showProfile(slug) {
  showView('profile');
  const root = $('profile');
  root.innerHTML = '';
  root.append(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Loading…' }));
  try {
    const res = await fetch(ownerUrl(slug));
    const p = await res.json();
    if (!res.ok) throw new Error(p.error);
    document.title = `${p.owner} · Fantasy Football Analyzer`;
    renderProfile(root, p, ownerHref);
    window.scrollTo(0, 0);
  } catch (e) {
    root.innerHTML = '';
    root.append(Object.assign(document.createElement('p'), { className: 'error', textContent: e.message }));
  }
}

async function showTeamSeason(slug, season) {
  showView('profile');
  const root = $('profile');
  root.innerHTML = '';
  root.append(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Loading… (builds the season from weekly rosters; the first load can take a few seconds)' }));
  try {
    const res = await fetch(teamUrl(slug, season));
    const p = await res.json();
    if (!res.ok) throw new Error(p.error);
    document.title = `${p.team} ${p.season} · Fantasy Football Analyzer`;
    renderTeamSeason(root, p, { team: teamHref, owner: ownerHref, slug: ownerSlug, radar: radarPlot, boxplot: boxPlot, strip: stripPlot });
    window.scrollTo(0, 0);
  } catch (e) {
    root.innerHTML = '';
    root.append(Object.assign(document.createElement('p'), { className: 'error', textContent: e.message }));
  }
}

let analyses = [];
let currentAnalysis = null;
function route() {
  const t = location.hash.match(/^#team\/([\w-]+)\/(\d{4})$/);
  if (t) return showTeamSeason(t[1], t[2]);
  const m = location.hash.match(/^#owner\/([\w-]+)$/);
  if (m) return showProfile(m[1]);
  const a = location.hash.match(/^#a\/([\w-]+)$/);
  const found = a && analyses.find((x) => x.id === a[1]);
  if (found) {
    document.title = `${found.title} · Fantasy Football Analyzer`;
    showView('analysis');
    if (currentAnalysis !== found.id) { currentAnalysis = found.id; return show(found); }
    document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.id === found.id));
    return;
  }
  showHome();
}
window.addEventListener('hashchange', route);

async function show(a) {
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.id === a.id));
  $('desc').textContent = a.description;
  $('summary').textContent = '';
  $('table').innerHTML = '';
  $('count').textContent = '';
  $('filters').hidden = true;
  $('matrix').hidden = true;
  $('status').className = 'muted';
  $('status').textContent = 'Loading from ESPN… (first load can take a few seconds)';
  try {
    const res = await fetch(apiUrl(a.id));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    $('status').textContent = `Seasons: ${data.seasons.slice().sort().join(', ')}`;
    $('summary').textContent = data.summary || '';
    if (data.matrix) {
      view = null;
      renderMatrix($('matrix'), data.matrix, ownerHref);
      $('matrix').hidden = false;
      return;
    }
    view = { data, sort: null };
    buildFilters(data);
    render();
  } catch (e) {
    $('status').className = 'error';
    $('status').textContent = e.message;
  }
}

$('filters').addEventListener('input', () => view && render());
$('filters').addEventListener('reset', () => setTimeout(() => view && render()));
$('filters').addEventListener('submit', (e) => e.preventDefault());

(async () => {
  let res = await fetch(apiUrl()).catch(() => null);
  if (!res || !res.ok || !(res.headers.get('content-type') || '').includes('json')) {
    staticMode = true;
    res = await fetch(apiUrl());
  }
  const list = await res.json();
  analyses = list;
  for (const a of list) {
    const b = document.createElement('button');
    b.textContent = a.title;
    b.dataset.id = a.id;
    b.onclick = () => { location.hash = `#a/${a.id}`; };
    $('tabs').append(b);
  }
  route();
})();
