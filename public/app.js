const $ = (id) => document.getElementById(id);
const LABEL = { W: 'Won', L: 'Lost', T: 'Tied' };
// Owner ids are ESPN account GUIDs like "{ABC-…}"; pages use them lowercase and unbraced.
const ownerSlug = (id) => String(id || '').replace(/[{}]/g, '').toLowerCase();
const ownerHref = (slug) => `#owner/${slug}`;

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

function cell(col, row) {
  const td = document.createElement('td');
  if (col.type === 'num') td.className = 'num';
  const v = row[col.key];
  if (col.type === 'boxplot') {
    td.append(boxPlot(v, col.axis));
  } else if (col.type === 'strip') {
    td.append(stripPlot(v, col.axis));
  } else if (col.type === 'result') {
    const b = document.createElement('span');
    b.className = `badge ${v}`;
    b.textContent = LABEL[v] || v;
    td.append(b);
  } else if ((col.type === 'owner' || col.key === 'team') && row.ownerId) {
    td.append(Object.assign(document.createElement('a'), { href: ownerHref(ownerSlug(row.ownerId)), textContent: v }));
  } else if (col.key === 'opponent' && row.opponentOwnerId) {
    td.append(Object.assign(document.createElement('a'), { href: ownerHref(ownerSlug(row.opponentOwnerId)), textContent: v }));
  } else {
    td.textContent = col.key === 'points' || col.key === 'opponentPoints' ? v.toFixed(2)
      : col.key === 'winPct' ? `${(v * 100).toFixed(1)}%` : v;
    if (col.key === 'week' && row.playoff) td.textContent += ' (playoffs)';
  }
  return td;
}

// Served by the Node server (live ESPN data) or as static JSON on GitHub Pages.
let staticMode = false;
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
    const th = el('th', { className: c.type === 'num' ? 'num sortable' : 'sortable', tabIndex: 0, textContent: c.label + (active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '') });
    th.setAttribute('aria-sort', active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
    const toggle = () => {
      const first = c.type === 'num' || c.type === 'result' || c.type === 'boxplot' || c.type === 'strip' ? 'desc' : 'asc';
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
  $('analysis').hidden = name !== 'analysis';
  $('profile').hidden = name !== 'profile';
  if (name === 'profile') document.querySelectorAll('nav button').forEach((b) => b.classList.remove('active'));
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

let analyses = [];
function route() {
  const m = location.hash.match(/^#owner\/([\w-]+)$/);
  if (m) return showProfile(m[1]);
  document.title = 'Fantasy Football Analyzer';
  showView('analysis');
  if (!view && analyses.length) show(analyses[0]);
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
    b.onclick = () => { showView('analysis'); if (location.hash) history.pushState(null, '', location.pathname + location.search); show(a); };
    $('tabs').append(b);
  }
  if (location.hash.startsWith('#owner/')) route(); else show(list[0]);
})();
