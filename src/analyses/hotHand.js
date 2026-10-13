// Is there a hot hand in fantasy? After a team has a top-3 week in the league, does it keep scoring above
// its own norm the next week, compared with after a bottom-3 week? Scores are measured against each team's
// own season average (excluding the week being predicted), so good teams don't get credit for being good.
// Regular season only; only back-to-back weeks count.
const TOP = 3;
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);

function summarize(pairs) {
  const top = pairs.filter((p) => p.prev === 'top');
  const bottom = pairs.filter((p) => p.prev === 'bottom');
  const d = (g) => g.map((p) => p.delta);
  const diff = top.length && bottom.length ? mean(d(top)) - mean(d(bottom)) : null;
  return {
    afterTop: top.length,
    afterTopAvg: top.length ? r1(mean(d(top))) : 0,
    afterBottom: bottom.length,
    afterBottomAvg: bottom.length ? r1(mean(d(bottom))) : 0,
    effect: diff === null ? 0 : r1(diff),
    repeat: top.length ? r1((top.filter((p) => p.nextTop).length / top.length) * 100) : 0,
    expectedRepeat: top.length ? r1(mean(top.map((p) => p.baseTop)) * 100) : 0,
    winPct: top.length ? r1((top.filter((p) => p.won).length / top.length) * 100) : 0,
    expectedWinPct: top.length ? r1(mean(top.map((p) => p.baseWin)) * 100) : 0,
  };
}

module.exports = {
  id: 'hot-hand',
  title: 'Weekly hot hand',
  description: `How teams score the week after a top-${TOP} week, and the week after a bottom-${TOP} week, compared with their own season average.`,
  run(games) {
    const reg = games.filter((g) => !g.playoff);
    const weeks = new Map();
    for (const g of reg) {
      const k = `${g.season}|${g.week}`;
      if (!weeks.has(k)) weeks.set(k, []);
      weeks.get(k).push(g);
    }
    // League rank (1 = highest score) and week average for every team-week.
    const info = new Map();
    for (const [k, gs] of weeks) {
      const sorted = [...gs].sort((a, b) => b.points - a.points);
      const avg = mean(gs.map((g) => g.points));
      sorted.forEach((g, i) => info.set(`${k}|${g.ownerId || g.team}`, { rank: i + 1, size: gs.length, rel: g.points - avg }));
    }

    const series = new Map();
    for (const g of reg) {
      const k = `${g.season}|${g.ownerId || g.team}`;
      if (!series.has(k)) series.set(k, []);
      series.get(k).push(g);
    }

    const byOwner = new Map();
    const everyone = [];
    for (const gs of series.values()) {
      if (gs.length < 4) continue;
      gs.sort((a, b) => a.week - b.week);
      const rels = gs.map((g) => info.get(`${g.season}|${g.week}|${g.ownerId || g.team}`).rel);
      const total = rels.reduce((s, v) => s + v, 0);
      const wins = gs.filter((g) => g.result === 'W').length + gs.filter((g) => g.result === 'T').length / 2;
      const topWeeks = gs.filter((g) => info.get(`${g.season}|${g.week}|${g.ownerId || g.team}`).rank <= TOP).length;
      for (let i = 0; i < gs.length - 1; i++) {
        const cur = gs[i];
        const nxt = gs[i + 1];
        if (nxt.week !== cur.week + 1) continue;
        const ci = info.get(`${cur.season}|${cur.week}|${cur.ownerId || cur.team}`);
        const ni = info.get(`${nxt.season}|${nxt.week}|${nxt.ownerId || nxt.team}`);
        const prev = ci.rank <= TOP ? 'top' : ci.rank > ci.size - TOP ? 'bottom' : 'middle';
        const baseline = (total - rels[i + 1]) / (gs.length - 1); // own season norm without the target week
        // How often this team finishes top-3 in the season's other weeks: what "repeating" would look like with no streakiness.
        const baseTop = (topWeeks - (ni.rank <= TOP ? 1 : 0)) / (gs.length - 1);
        // The team's win rate in its other games: good teams win more no matter what, so compare against this.
        const nextWin = nxt.result === 'W' ? 1 : nxt.result === 'T' ? 0.5 : 0;
        const baseWin = (wins - nextWin) / (gs.length - 1);
        const pair = { prev, delta: rels[i + 1] - baseline, nextTop: ni.rank <= TOP, baseTop, won: nextWin === 1, baseWin };
        everyone.push(pair);
        if (cur.ownerId) {
          if (!byOwner.has(cur.ownerId)) byOwner.set(cur.ownerId, { owner: cur.owner, team: cur.team, season: cur.season, pairs: [] });
          const o = byOwner.get(cur.ownerId);
          o.pairs.push(pair);
          if (cur.season >= o.season) { o.season = cur.season; o.team = cur.team; o.owner = cur.owner; }
        }
      }
    }

    const league = { scope: 'Whole league', owner: 'Whole league', team: '', ...summarize(everyone) };
    const owners = [...byOwner].map(([id, o]) => ({ scope: o.owner, owner: o.owner, ownerId: id, team: o.team, ...summarize(o.pairs) }));
    owners.sort((a, b) => b.effect - a.effect);
    const rows = [league, ...owners].map((r, i) => ({ rank: i, ...r }));

    return {
      columns: [
        { key: 'owner', label: 'Owner', type: 'owner' },
        { key: 'afterTop', label: `After top-${TOP}`, type: 'num' },
        { key: 'afterTopAvg', label: 'Next week vs own avg', type: 'num' },
        { key: 'afterBottom', label: `After bottom-${TOP}`, type: 'num' },
        { key: 'afterBottomAvg', label: 'Next week vs own avg', type: 'num' },
        { key: 'effect', label: 'Hot-hand effect', type: 'num' },
        { key: 'repeat', label: `Top-${TOP} again %`, type: 'num' },
        { key: 'expectedRepeat', label: 'Expected %', type: 'num' },
        { key: 'winPct', label: 'Won next game %', type: 'num' },
        { key: 'expectedWinPct', label: 'Their usual win %', type: 'num' },
      ],
      rows,
      summary: `Whole league: ${league.afterTopAvg >= 0 ? '+' : ''}${league.afterTopAvg} points vs their own average the week after a top-${TOP} week (${league.afterTop} weeks), ${league.afterBottomAvg >= 0 ? '+' : ''}${league.afterBottomAvg} after a bottom-${TOP} week (${league.afterBottom} weeks).`,    };
  },
};
