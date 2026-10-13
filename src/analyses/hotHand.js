// Is there a hot hand in fantasy? After a team has a top-3 week in the league, does it keep scoring above
// its own norm the next week, compared with after a bottom-3 week? Scores are measured against each team's
// own season average (excluding the week being predicted), so good teams don't get credit for being good.
// Regular season only; only back-to-back weeks count.
const TOP = 3;
const MIN_SAMPLE = 8; // fewer top or bottom weeks than this and the verdict is flagged as a small sample
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const variance = (a) => { const m = mean(a); return a.length > 1 ? a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1) : 0; };

function summarize(pairs) {
  const top = pairs.filter((p) => p.prev === 'top');
  const bottom = pairs.filter((p) => p.prev === 'bottom');
  const d = (g) => g.map((p) => p.delta);
  const diff = top.length && bottom.length ? mean(d(top)) - mean(d(bottom)) : null;
  const se = top.length > 1 && bottom.length > 1 ? Math.sqrt(variance(d(top)) / top.length + variance(d(bottom)) / bottom.length) : null;
  const z = diff !== null && se ? diff / se : null;
  let verdict = 'Not enough data';
  if (z !== null) verdict = z >= 1.64 ? 'Hot hand looks real' : z <= -1.64 ? 'Reverses (cools off)' : 'Looks like noise';
  if (z !== null && (top.length < MIN_SAMPLE || bottom.length < MIN_SAMPLE)) verdict = `Small sample (${verdict.toLowerCase()})`;
  return {
    afterTop: top.length,
    afterTopAvg: top.length ? r1(mean(d(top))) : 0,
    afterBottom: bottom.length,
    afterBottomAvg: bottom.length ? r1(mean(d(bottom))) : 0,
    effect: diff === null ? 0 : r1(diff),
    z: z === null ? 0 : r2(z),
    repeat: top.length ? r1((top.filter((p) => p.nextTop).length / top.length) * 100) : 0,
    expectedRepeat: top.length ? r1(mean(top.map((p) => p.baseTop)) * 100) : 0,
    winPct: top.length ? r1((top.filter((p) => p.won).length / top.length) * 100) : 0,
    verdict,
  };
}

module.exports = {
  id: 'hot-hand',
  title: 'Weekly hot hand',
  description: `Does a big week predict another one? After a top-${TOP} week, how a team scores the following week compared with its own average, against how it scores after a bottom-${TOP} week. "Noise" means the gap is within what random luck produces.`,
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
        const pair = { prev, delta: rels[i + 1] - baseline, nextTop: ni.rank <= TOP, baseTop, won: nxt.result === 'W' };
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
        { key: 'z', label: 'z-score', type: 'num' },
        { key: 'repeat', label: `Top-${TOP} again %`, type: 'num' },
        { key: 'expectedRepeat', label: 'Expected %', type: 'num' },
        { key: 'winPct', label: 'Won next game %', type: 'num' },
        { key: 'verdict', label: 'Verdict' },
      ],
      rows,
      summary: `League-wide: after a top-${TOP} week teams scored ${league.afterTopAvg >= 0 ? '+' : ''}${league.afterTopAvg} points vs their own norm the next week (n=${league.afterTop}), after a bottom-${TOP} week ${league.afterBottomAvg >= 0 ? '+' : ''}${league.afterBottomAvg} (n=${league.afterBottom}). ${league.verdict}. They landed in the top ${TOP} again ${league.repeat}% of the time, vs ${league.expectedRepeat}% expected from how often those same teams finish top-${TOP} anyway.`,
    };
  },
};
