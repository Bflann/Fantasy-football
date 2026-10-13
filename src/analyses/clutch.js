// Do owners score more or less when it counts? Compares weekly scoring in the championship bracket
// with the same owner's regular season. Some playoff matchups span two scoring weeks (their score is the
// two-week sum), so playoff points are always divided by the weeks the matchup covered.
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };
const BRACKET = 'WINNERS_BRACKET'; // consolation brackets are not "playoffs" for this purpose

module.exports = {
  id: 'clutch',
  title: 'Playoff clutch rating',
  description: 'Weekly scoring in the championship bracket vs the same owner’s regular season. Two-week playoff matchups are split per week. The rating is the difference in league standard deviations (about 28 points), so +1.0 means a full “typical swing” better in the playoffs.',
  run(games, { limit } = {}) {
    const reg = games.filter((g) => !g.playoff && g.ownerId);
    const leagueSd = sd(reg.map((g) => g.points)) || 1;

    // Regular-season average per owner-season, the baseline for that season's playoff run.
    const base = new Map();
    for (const g of reg) {
      const k = `${g.season}|${g.ownerId}`;
      const b = base.get(k) || { sum: 0, n: 0 };
      b.sum += g.points; b.n++;
      base.set(k, b);
    }

    const playoff = games.filter((g) => g.playoff && g.tier === BRACKET && g.ownerId);
    const byOwner = new Map();
    for (const g of playoff) {
      if (!byOwner.has(g.ownerId)) byOwner.set(g.ownerId, []);
      byOwner.get(g.ownerId).push(g);
    }

    const all = [];
    for (const [id, gs] of byOwner) {
      const weeks = gs.reduce((s, g) => s + g.periods, 0);
      const pts = gs.reduce((s, g) => s + g.points, 0);
      const perWeek = pts / weeks;

      // Baseline: that owner's regular-season average in each season they made it, weighted by playoff weeks.
      const runs = new Map();
      for (const g of gs) {
        const r = runs.get(g.season) || { weeks: 0, pts: 0 };
        r.weeks += g.periods; r.pts += g.points;
        runs.set(g.season, r);
      }
      let baseSum = 0;
      for (const [season, r] of runs) {
        const b = base.get(`${season}|${id}`);
        baseSum += (b ? b.sum / b.n : perWeek) * r.weeks;
      }
      const baseline = baseSum / weeks;
      const diff = perWeek - baseline;

      const wins = gs.filter((g) => g.result === 'W').length;
      const losses = gs.filter((g) => g.result === 'L').length;
      const runText = [...runs]
        .sort((a, b) => b[0] - a[0])
        .map(([season, r]) => {
          const b = base.get(`${season}|${id}`);
          const d = r.pts / r.weeks - (b ? b.sum / b.n : r.pts / r.weeks);
          return `${season} ${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}`;
        })
        .join(' · ');
      const latest = [...gs].sort((a, b) => b.season - a.season)[0];
      all.push({
        owner: latest.owner,
        ownerId: id,
        team: latest.team,
        runs: runs.size,
        games: gs.length,
        weeks,
        record: `${wins}-${losses}`,
        playoffAvg: r1(perWeek),
        regularAvg: r1(baseline),
        diff: r1(diff),
        rating: r2(diff / leagueSd),
        bySeason: runText,
        sample: weeks >= 4 ? '' : 'Small sample',
      });
    }
    all.sort((a, b) => b.rating - a.rating || b.weeks - a.weeks);
    const rows = all.slice(0, limit || undefined).map((r, i) => ({ rank: i + 1, ...r }));

    const best = rows[0];
    const worst = rows[rows.length - 1];
    return {
      columns: [
        { key: 'rank', label: '#', type: 'num' },
        { key: 'owner', label: 'Owner', type: 'owner' },
        { key: 'team', label: 'Latest team' },
        { key: 'rating', label: 'Clutch rating', type: 'num' },
        { key: 'diff', label: 'Playoff − regular', type: 'num' },
        { key: 'playoffAvg', label: 'Playoff avg / wk', type: 'num' },
        { key: 'regularAvg', label: 'Regular avg / wk', type: 'num' },
        { key: 'record', label: 'Playoff record' },
        { key: 'weeks', label: 'Weeks', type: 'num' },
        { key: 'bySeason', label: 'By season (pts/wk vs reg. season)' },
        { key: 'sample', label: '' },
      ],
      rows,
      summary: rows.length
        ? `Most clutch: ${best.owner} (${best.diff >= 0 ? '+' : ''}${best.diff} points per week in the playoffs, over ${best.weeks} weeks). Least: ${worst.owner} (${worst.diff} per week, ${worst.weeks} weeks). Playoff samples are small, so treat ratings built on a few weeks as a hint, not a verdict.`
        : '',
    };
  },
};
