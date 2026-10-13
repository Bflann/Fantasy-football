const $ = (id) => document.getElementById(id);
const LABEL = { W: 'Won', L: 'Lost', T: 'Tied' };

function cell(col, row) {
  const td = document.createElement('td');
  if (col.type === 'num') td.className = 'num';
  const v = row[col.key];
  if (col.type === 'result') {
    const b = document.createElement('span');
    b.className = `badge ${v}`;
    b.textContent = LABEL[v] || v;
    td.append(b);
  } else {
    td.textContent = col.key === 'points' || col.key === 'opponentPoints' ? v.toFixed(2) : v;
    if (col.key === 'week' && row.playoff) td.textContent += ' (playoffs)';
  }
  return td;
}

// Served by the Node server (live ESPN data) or as static JSON on GitHub Pages.
let staticMode = false;
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
  f.append(el('input', { type: 'search', name: 'q', placeholder: 'Search team, opponent, owner…' }));
  if (rows.some((r) => 'season' in r)) {
    f.append(select('season', 'Season', uniq('season').sort((a, b) => b - a).map((v) => ({ value: v, label: v }))));
  }
  if (rows.some((r) => 'team' in r)) {
    f.append(select('team', 'Team', uniq('team').sort().map((v) => ({ value: v, label: v }))));
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
  if (f.team && row.team !== f.team) return false;
  if (f.result && row.result !== f.result) return false;
  if (f.playoff && String(!!row.playoff) !== f.playoff) return false;
  if (f.q) {
    const hay = [row.team, row.opponent, row.owner].filter(Boolean).join(' ').toLowerCase();
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
    const active = sort && sort.key === c.key;
    const th = el('th', { className: c.type === 'num' ? 'num sortable' : 'sortable', tabIndex: 0, textContent: c.label + (active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '') });
    th.setAttribute('aria-sort', active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
    const toggle = () => {
      const first = c.type === 'num' || c.type === 'result' ? 'desc' : 'asc';
      const next = !active ? first : sort.dir === 'asc' ? 'desc' : 'asc';
      view.sort = { key: c.key, dir: next };
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

async function show(a) {
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.id === a.id));
  $('desc').textContent = a.description;
  $('summary').textContent = '';
  $('table').innerHTML = '';
  $('count').textContent = '';
  $('filters').hidden = true;
  $('status').className = 'muted';
  $('status').textContent = 'Loading from ESPN… (first load can take a few seconds)';
  try {
    const res = await fetch(apiUrl(a.id));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    $('status').textContent = `Seasons: ${data.seasons.slice().sort().join(', ')}`;
    $('summary').textContent = data.summary || '';
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
  for (const a of list) {
    const b = document.createElement('button');
    b.textContent = a.title;
    b.dataset.id = a.id;
    b.onclick = () => show(a);
    $('tabs').append(b);
  }
  show(list[0]);
})();
