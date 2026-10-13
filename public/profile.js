// Renders one owner's personal page from /api/owners/<slug> (or data/owners/<slug>.json).
(function () {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids.filter((k) => k !== null && k !== undefined));
    return n;
  };
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  const pts = (v) => Number(v).toFixed(2);
  const RESULT = { W: 'Won', L: 'Lost', T: 'Tied' };

  function card(label, value, sub) {
    return h('div', { className: 'card' }, h('div', { className: 'card-label', textContent: label }),
      h('div', { className: 'card-value', textContent: value }), sub ? h('div', { className: 'card-sub', textContent: sub }) : null);
  }

  function table(columns, rows, empty = 'Nothing to show yet.') {
    if (!rows.length) return h('p', { className: 'muted', textContent: empty });
    const t = h('table');
    const head = t.createTHead().insertRow();
    for (const c of columns) head.append(h('th', { className: `${c.num ? 'num' : ''}${c.side ? ` side-${c.side}` : ''}`.trim(), textContent: c.label }));
    const body = t.createTBody();
    for (const r of rows) {
      const tr = body.insertRow();
      for (const c of columns) {
        const td = tr.insertCell();
        if (c.num) td.className = 'num';
        if (c.side) td.classList.add(`side-${c.side}`);
        const content = c.render ? c.render(r) : r[c.key];
        if (content instanceof Node) td.append(content); else td.textContent = content;
      }
    }
    return h('div', { className: 'scroll' }, t);
  }

  const gameLabel = (g) => `${g.season} wk ${g.week}${g.playoff ? ' (playoffs)' : ''}`;
  const gameLine = (g) => g ? `${pts(g.points)}–${pts(g.opponentPoints)} vs ${g.opponent} · ${gameLabel(g)}` : '–';

  window.renderProfile = function (root, p, linkFor) {
    root.innerHTML = '';
    const back = h('a', { href: '#', className: 'back', textContent: '← Back to tables' });
    const teams = p.teams.map((t) => `${t.season}: ${t.team}`).join(' · ');
    const r = p.records;

    root.append(
      back,
      h('h2', { textContent: p.owner }),
      h('p', { className: 'muted', textContent: teams }),
      h('div', { className: 'cards' },
        card('All-time record', p.record, `${p.games} games · ${pct(p.winPct)}`),
        card('Regular season', p.regularSeason, `Playoffs: ${p.playoffs}`),
        card('Avg score', pts(p.avgPoints), `${pts(p.pointsFor)} total`),
        card('High score', pts(r.high.points), gameLabel(r.high)),
        card('Longest win streak', String(r.streaks.win), `Longest losing streak: ${r.streaks.loss}`),
        card('Points against', pts(p.pointsAgainst), `${pts(p.pointsAgainst / p.games)} per game`),
      ),

      h('h3', { textContent: 'Seasons' }),
      table([
        { label: 'Season', key: 'season', num: true },
        { label: 'Team', key: 'team' },
        { label: 'Record', key: 'record' },
        { label: 'Finish', key: 'finish' },
        { label: 'Playoffs', key: 'playoffs' },
        { label: 'Avg score', num: true, render: (s) => pts(s.avgPoints) },
        { label: 'Points for', num: true, render: (s) => pts(s.pointsFor) },
        { label: 'Points against', num: true, render: (s) => pts(s.pointsAgainst) },
      ], p.seasonsTable),

      h('h3', { textContent: 'Highlights' }),
      table([{ label: '', key: 'label' }, { label: '', key: 'detail' }], [
        { label: 'Best week', detail: gameLine(r.high) },
        { label: 'Worst week', detail: gameLine(r.low) },
        { label: 'Biggest win', detail: gameLine(r.biggestWin) },
        { label: 'Worst loss', detail: gameLine(r.worstLoss) },
        { label: 'Closest win', detail: gameLine(r.closestWin) },
        { label: 'Closest loss', detail: gameLine(r.closestLoss) },
      ]),

      h('h3', { textContent: 'Top scoring weeks' }),
      table([
        { label: 'When', render: gameLabel },
        { label: 'Team', side: 'team-a', render: (g) => g.team },
        { label: 'Score', num: true, side: 'score-a', render: (g) => h('span', { className: g.points > g.opponentPoints ? 'score-win' : 'score-lose', textContent: pts(g.points) }) },
        { label: 'Opp.', num: true, side: 'score-b', render: (g) => h('span', { className: g.opponentPoints > g.points ? 'score-win' : 'score-lose', textContent: pts(g.opponentPoints) }) },
        { label: 'Opponent', side: 'team-b', key: 'opponent' },
        { label: 'Result', render: (g) => h('span', { className: `badge ${g.result}`, textContent: RESULT[g.result] }) },
      ], p.bestWeeks),

      h('h3', { textContent: 'Head to head' }),
      table([
        { label: 'Opponent', render: (o) => h('a', { href: linkFor(o.slug), textContent: o.owner }) },
        { label: 'Record', key: 'record' },
        { label: 'Win %', num: true, render: (o) => pct(o.winPct) },
        { label: 'Games', key: 'games', num: true },
        { label: 'Points for', num: true, render: (o) => pts(o.pointsFor) },
        { label: 'Points against', num: true, render: (o) => pts(o.pointsAgainst) },
      ], p.headToHead),

      h('h3', { textContent: 'Draft' }),
    );

    const d = p.draft;
    if (!d.picks) {
      root.append(h('p', { className: 'muted', textContent: 'No draft data available.' }));
      return;
    }
    const mix = Object.entries(d.positions).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ');
    const pickCols = [
      { label: 'Player', key: 'player' },
      { label: 'Pos', key: 'position' },
      { label: 'Season', key: 'season', num: true },
      { label: 'Pick', key: 'pick', num: true },
      { label: 'Points', num: true, render: (x) => pts(x.points) },
      { label: 'Finish', key: 'finish', num: true },
      { label: 'Value', key: 'value', num: true },
    ];
    root.append(
      h('p', { className: 'muted', textContent: `${d.picks} picks · average value ${d.avgValue > 0 ? '+' : ''}${d.avgValue} · ${mix}` }),
      h('h4', { textContent: 'Best picks' }), table(pickCols, d.best),
      h('h4', { textContent: 'Biggest busts' }), table(pickCols, d.worst),
    );
  };
})();
