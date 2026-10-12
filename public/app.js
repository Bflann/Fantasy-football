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

async function show(a) {
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.id === a.id));
  $('desc').textContent = a.description;
  $('summary').textContent = '';
  $('table').innerHTML = '';
  $('status').className = 'muted';
  $('status').textContent = 'Loading from ESPN… (first load can take a few seconds)';
  try {
    const res = await fetch(`/api/analyses/${a.id}`);
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
  const list = await (await fetch('/api/analyses')).json();
  for (const a of list) {
    const b = document.createElement('button');
    b.textContent = a.title;
    b.dataset.id = a.id;
    b.onclick = () => show(a);
    $('tabs').append(b);
  }
  show(list[0]);
})();
