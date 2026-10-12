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

async function show(a) {
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.id === a.id));
  $('desc').textContent = a.description;
  $('summary').textContent = '';
  $('table').innerHTML = '';
  $('status').className = 'muted';
  $('status').textContent = 'Loading from ESPN… (first load can take a few seconds)';
  try {
    const res = await fetch(apiUrl(a.id));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    $('status').textContent = `Seasons: ${data.seasons.slice().sort().join(', ')}`;
    $('summary').textContent = data.summary || '';
    const thead = $('table').createTHead().insertRow();
    for (const c of data.columns) {
      const th = document.createElement('th');
      th.textContent = c.label;
      if (c.type === 'num') th.className = 'num';
      thead.append(th);
    }
    const body = $('table').createTBody();
    for (const row of data.rows) {
      const tr = body.insertRow();
      for (const c of data.columns) tr.append(cell(c, row));
    }
  } catch (e) {
    $('status').className = 'error';
    $('status').textContent = e.message;
  }
}

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
