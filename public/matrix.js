// Head-to-head matrix: rows are owners, columns are opponents, each box is the row owner's record.
(function () {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids.filter((k) => k !== null && k !== undefined));
    return n;
  };
  const pct = (w, l, t) => (w + l + t ? (w + t / 2) / (w + l + t) : null);
  const rec = (c) => (c.t ? `${c.w}-${c.l}-${c.t}` : `${c.w}-${c.l}`);
  const games = (c) => c.w + c.l + c.t;
  const sum = (cells) => cells.reduce((s, c) => ({ w: s.w + c.w, l: s.l + c.l, t: s.t + c.t, pf: s.pf + c.pf, pa: s.pa + c.pa }), { w: 0, l: 0, t: 0, pf: 0, pa: 0 });

  const METRICS = {
    record: { label: 'Record (W-L)', main: (c) => rec(c), sub: (c) => `${Math.round(pct(c.w, c.l, c.t) * 100)}%` },
    winpct: { label: 'Win %', main: (c) => `${Math.round(pct(c.w, c.l, c.t) * 100)}%`, sub: (c) => rec(c) },
    margin: {
      label: 'Avg points margin',
      main: (c) => { const m = (c.pf - c.pa) / games(c); return `${m > 0 ? '+' : ''}${m.toFixed(1)}`; },
      sub: (c) => rec(c),
    },
  };

  // Green for a winning record, red for losing, neutral for even; stronger colour = bigger gap.
  function shade(td, p) {
    if (p === null) return;
    const strength = Math.round(Math.abs(p - 0.5) * 2 * 55);
    if (strength === 0) return;
    td.style.background = `color-mix(in srgb, var(${p > 0.5 ? '--w' : '--l'}) ${strength}%, transparent)`;
  }

  function select(label, options, value, onChange) {
    const s = h('select', { onchange: (e) => onChange(e.target.value) });
    for (const [v, text] of options) s.append(h('option', { value: v, textContent: text, selected: String(v) === String(value) }));
    return h('label', { className: 'mx-control' }, h('span', { textContent: label }), s);
  }

  window.renderMatrix = function (root, m, ownerHref) {
    const state = { season: 'all', scope: 'all', metric: 'record' };

    const draw = () => {
      root.innerHTML = '';
      const cells = (m.views[`${state.season}:${state.scope}`]) || {};
      const metric = METRICS[state.metric];
      // Only owners who actually played in this view get a row and column.
      const owners = m.owners.filter((o) => Object.values(cells[o.ownerId] || {}).some((c) => games(c) > 0));

      root.append(
        h('div', { className: 'mx-controls' },
          select('Season', [['all', 'All seasons'], ...m.seasons.map((s) => [s, String(s)])], state.season, (v) => { state.season = v; draw(); }),
          select('Games', [['all', 'All games'], ['regular', 'Regular season'], ['playoffs', 'Playoffs']], state.scope, (v) => { state.scope = v; draw(); }),
          select('Show', Object.entries(METRICS).map(([k, x]) => [k, x.label]), state.metric, (v) => { state.metric = v; draw(); }),
        ),
        h('p', { className: 'mx-help' },
          h('strong', { textContent: 'How to read this: ' }),
          'find an owner in the left column, then look across to the opponent\u2019s column. The box shows ',
          h('em', { textContent: 'the left owner\u2019s' }),
          ' record against that opponent. Green means they usually win that matchup, red means they usually lose. Hover a box for the full details.'),
      );

      if (!owners.length) {
        root.append(h('p', { className: 'muted', textContent: 'No games match these filters.' }));
        return;
      }

      const table = h('table', { className: 'mx' });
      const head = table.createTHead().insertRow();
      head.append(h('th', { className: 'mx-corner', textContent: 'Owner  ↓   vs  →' }));
      for (const o of owners) head.append(h('th', { className: 'mx-col', title: `${o.name} — ${o.team}` }, h('a', { href: ownerHref(o.slug), textContent: o.short })));
      head.append(h('th', { className: 'mx-col mx-total', textContent: 'Overall' }));

      const body = table.createTBody();
      for (const row of owners) {
        const tr = body.insertRow();
        tr.append(h('th', { className: 'mx-row' },
          h('a', { href: ownerHref(row.slug), textContent: row.name }),
          h('span', { className: 'mx-team', textContent: row.team })));
        for (const col of owners) {
          const td = tr.insertCell();
          if (row.ownerId === col.ownerId) { td.className = 'mx-self'; td.textContent = '—'; continue; }
          const c = (cells[row.ownerId] || {})[col.ownerId];
          if (!c || !games(c)) { td.className = 'mx-none'; td.textContent = '·'; td.title = `${row.name} and ${col.name} haven\u2019t played in this view`; continue; }
          td.className = 'mx-cell';
          td.title = `${row.name} vs ${col.name}: ${rec(c)} (${Math.round(pct(c.w, c.l, c.t) * 100)}%) over ${games(c)} game${games(c) === 1 ? '' : 's'}\n`
            + `Points: ${c.pf.toFixed(1)} for, ${c.pa.toFixed(1)} against`;
          shade(td, pct(c.w, c.l, c.t));
          td.append(h('div', { className: 'mx-main', textContent: metric.main(c) }), h('div', { className: 'mx-sub', textContent: metric.sub(c) }));
        }
        const total = sum(Object.values(cells[row.ownerId] || {}));
        const tt = tr.insertCell();
        tt.className = 'mx-cell mx-total';
        tt.title = `${row.name} overall: ${rec(total)} over ${games(total)} games`;
        shade(tt, pct(total.w, total.l, total.t));
        tt.append(h('div', { className: 'mx-main', textContent: metric.main(total) }), h('div', { className: 'mx-sub', textContent: metric.sub(total) }));
      }

      root.append(
        h('div', { className: 'scroll' }, table),
        h('div', { className: 'mx-legend' },
          h('span', { textContent: 'Mostly losses' }),
          h('span', { className: 'mx-ramp' }),
          h('span', { textContent: 'Mostly wins' }),
          h('span', { className: 'muted', textContent: '— same owner · no games played' })),
      );
    };
    draw();
  };
})();
