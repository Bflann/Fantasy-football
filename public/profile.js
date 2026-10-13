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

  // Bars for each week's score (green win / red loss), with the league average that week as a tick.
  function weeklyBars(weeks) {
    const NS = 'http://www.w3.org/2000/svg';
    const W = 720, H = 190, L = 34, R = 8, T = 10, B = 26;
    const top = Math.ceil(Math.max(...weeks.flatMap((w) => [w.points, w.leagueAvg || 0])) / 20) * 20;
    const x = (i) => L + (i + 0.5) * ((W - L - R) / weeks.length);
    const bw = Math.min(34, ((W - L - R) / weeks.length) * 0.65);
    const y = (v) => T + (1 - v / top) * (H - T - B);
    const mk = (tag, attrs, text) => {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text !== undefined) n.textContent = text;
      return n;
    };
    const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, class: 'weekly', role: 'img' });
    for (let v = 0; v <= top; v += top / 4) {
      svg.append(mk('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'wk-grid' }), mk('text', { x: L - 6, y: y(v) + 3, class: 'wk-axis', 'text-anchor': 'end' }, String(Math.round(v))));
    }
    weeks.forEach((w, i) => {
      const cls = w.result === 'W' ? 'wk-win' : w.result === 'L' ? 'wk-loss' : 'wk-tie';
      const bar = mk('rect', { x: x(i) - bw / 2, y: y(w.points), width: bw, height: Math.max(H - B - y(w.points), 1), class: cls });
      bar.append(mk('title', {}, `Week ${w.week}${w.playoff ? ' (playoffs)' : ''}: ${pts(w.points)} vs ${w.opponent} ${pts(w.opponentPoints)} · league average ${w.leagueAvg}`));
      svg.append(bar);
      if (w.leagueAvg) svg.append(mk('line', { x1: x(i) - bw / 2 - 3, x2: x(i) + bw / 2 + 3, y1: y(w.leagueAvg), y2: y(w.leagueAvg), class: 'wk-avg' }));
      svg.append(mk('text', { x: x(i), y: H - 9, class: 'wk-axis', 'text-anchor': 'middle' }, w.playoff ? `P${w.week}` : String(w.week)));
    });
    return svg;
  }

  window.renderTeamSeason = function (root, p, hrefs) {
    root.innerHTML = '';
    const s = p.summary;
    const reg = p.weeks.filter((w) => !w.playoff);
    const seasonLinks = h('p', { className: 'muted' }, 'Other seasons: ');
    p.seasons.forEach((y, i) => {
      if (i) seasonLinks.append(' · ');
      seasonLinks.append(y === p.season ? h('strong', { textContent: String(y) }) : h('a', { href: hrefs.team(p.slug, y), textContent: String(y) }));
    });

    const cards = [
      card('Record', s.record, `Playoffs: ${s.playoffs}`),
      card('Regular-season finish', s.finish, `${s.games} games`),
      card('Avg score', pts(s.avgPoints), `High ${pts(s.highScore)} · Low ${pts(s.lowScore)}`),
      card('Points for', pts(s.pointsFor), `Against ${pts(s.pointsAgainst)}`),
    ];
    if (p.efficiency) cards.push(card('Lineup efficiency', `${p.efficiency.efficiency}%`, `${pts(p.efficiency.left)} points left on the bench`));
    if (p.universes) cards.push(card('Wins in other schedules', String(p.universes.avgWins), `Actual: ${p.universes.actual} wins`));

    root.append(
      h('a', { href: hrefs.owner(p.slug), className: 'back', textContent: `← ${p.owner}` }),
      h('h2', { textContent: p.team }),
      h('p', { className: 'muted', textContent: `${p.owner} · ${p.season} season` }),
      seasonLinks,
      h('div', { className: 'cards' }, ...cards),

      h('h3', { textContent: 'Weekly scores' }),
      h('div', { className: 'panel' }, weeklyBars(p.weeks),
        h('p', { className: 'muted legend-note', textContent: 'Green = win, red = loss, tick = league average that week. P = playoff week.' })),
      table([
        { label: 'Week', render: (w) => `${w.week}${w.playoff ? ' (playoffs)' : ''}` },
        { label: 'Team', side: 'team-a', render: () => p.team },
        { label: 'Score', num: true, side: 'score-a', render: (w) => h('span', { className: w.points > w.opponentPoints ? 'score-win' : 'score-lose', textContent: pts(w.points) }) },
        { label: 'Opp.', num: true, side: 'score-b', render: (w) => h('span', { className: w.opponentPoints > w.points ? 'score-win' : 'score-lose', textContent: pts(w.opponentPoints) }) },
        { label: 'Opponent', side: 'team-b', render: (w) => (w.opponentOwnerId ? h('a', { href: hrefs.team(hrefs.slug(w.opponentOwnerId), p.season), textContent: w.opponent }) : w.opponent) },
        { label: 'Result', render: (w) => h('span', { className: `badge ${w.result}`, textContent: RESULT[w.result] }) },
        { label: 'League avg', num: true, render: (w) => (w.leagueAvg === null ? '–' : pts(w.leagueAvg)) },
        { label: 'Best lineup', num: true, render: (w) => (w.optimal === null ? '–' : pts(w.optimal)) },
      ], p.weeks),
    );

    // Fingerprint + distribution side by side.
    const grid = h('div', { className: 'two-col' });
    if (p.fingerprint) {
      const r = p.fingerprint.radar;
      const fp = h('div', { className: 'panel' }, h('h3', { textContent: 'Scoring fingerprint' }));
      const svg = hrefs.radar(r);
      svg.classList.add('big');
      fp.append(svg, table([
        { label: 'Position', key: 'pos' },
        { label: 'Share', num: true, render: (x) => `${x.share.toFixed(1)}%` },
        { label: 'League', num: true, render: (x) => `${x.league.toFixed(1)}%` },
        { label: 'Diff', num: true, render: (x) => h('span', { className: `diff-inline ${x.diff > 0.05 ? 'up' : x.diff < -0.05 ? 'down' : ''}`, textContent: `${x.diff > 0 ? '+' : ''}${x.diff.toFixed(1)}` }) },
      ], r.labels.map((pos, i) => ({ pos, share: r.shares[i], league: r.league[i], diff: r.shares[i] - r.league[i] }))));
      grid.append(fp);
    }
    if (p.consistency) {
      const c = p.consistency;
      const box = c.plot;
      const lo = Math.floor(box.min / 10) * 10;
      const hi = Math.ceil(box.max / 10) * 10;
      const panel = h('div', { className: 'panel' }, h('h3', { textContent: 'Score distribution' }));
      const svg = hrefs.boxplot(box, { min: lo, max: hi });
      svg.classList.add('wide');
      panel.append(svg, h('p', { className: 'muted legend-note', textContent: `Axis ${lo}–${hi}. Box = middle half of weeks, line = median, whiskers = typical range, dots = outlier weeks.` }),
        table([{ label: '', key: 'k' }, { label: '', key: 'v', num: true }], [
          { k: 'Average', v: pts(c.mean) }, { k: 'Median', v: pts(c.median) }, { k: 'Std deviation', v: pts(c.stdDev) },
          { k: 'Low', v: pts(box.min) }, { k: 'High', v: pts(box.max) },
        ]));
      grid.append(panel);
    }
    if (grid.childNodes.length) root.append(grid);

    if (p.universes) {
      const u = p.universes;
      const panel = h('div', { className: 'panel' }, h('h3', { textContent: 'Parallel universes' }));
      const svg = hrefs.strip({ values: u.values, actual: u.actual }, { min: 0, max: u.max });
      svg.classList.add('wide');
      panel.append(
        h('p', { className: 'muted', textContent: `Wins this team would have had on each other owner's schedule (dots), and what actually happened (ringed). Axis 0–${u.max}.` }),
        svg,
        h('p', { textContent: `Average across universes: ${u.avgWins} wins · actual: ${u.actual} wins.` }));
      root.append(panel);
    }

    if (p.draft.length) {
      root.append(h('h3', { textContent: 'Draft' }), table([
        { label: 'Round', key: 'round', num: true },
        { label: 'Pick', key: 'pick', num: true },
        { label: 'Player', key: 'player' },
        { label: 'Pos', key: 'position' },
        { label: 'Points', num: true, render: (d) => pts(d.points) },
        { label: 'Finish', key: 'finish', num: true },
        { label: 'Value', num: true, render: (d) => `${d.value > 0 ? '+' : ''}${d.value}` },
      ], p.draft));
    }

    if (p.heartbreaks.length) {
      root.append(h('h3', { textContent: 'Heartbreakers' }), table([
        { label: 'Week', key: 'week', num: true },
        { label: 'Score', num: true, side: 'score-a', render: (x) => pts(x.points) },
        { label: 'Opp.', num: true, side: 'score-b', render: (x) => pts(x.opponentPoints) },
        { label: 'Opponent', side: 'team-b', key: 'opponent' },
        { label: 'Lost by', num: true, render: (x) => pts(x.margin) },
        { label: 'Should have won by', num: true, render: (x) => (x.regret > 0 ? pts(x.regret) : '–') },
        { label: 'The swaps that won it', render: (x) => x.swaps },
      ], p.heartbreaks));
    }
  };

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
        { label: 'Season', num: true, render: (s) => h('a', { href: `#team/${p.slug}/${s.season}`, textContent: String(s.season) }) },
        { label: 'Team', render: (s) => h('a', { href: `#team/${p.slug}/${s.season}`, textContent: s.team }) },
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
