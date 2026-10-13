// Lineup efficiency: points the team actually started vs. the best lineup its roster could have fielded
// that week (same slots, hindsight picks, IR excluded). Regular season only.
const r2 = (n) => Math.round(n * 100) / 100;

module.exports = {
  id: 'efficiency',
  title: 'Roster efficiency',
  description: 'How much of each roster’s potential made it into the starting lineup. Efficiency is points started ÷ best possible lineup in hindsight; "left on bench" is the gap.',
  needs: 'lineups',
  run(lineups, { limit } = {}) {
    const groups = new Map();
    for (const l of lineups) {
      if (l.playoff) continue;
      const key = `${l.season}|${l.ownerId || l.team}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(l);
    }

    const all = [];
    for (const ls of groups.values()) {
      const actual = ls.reduce((s, l) => s + l.actual, 0);
      const optimal = ls.reduce((s, l) => s + l.optimal, 0);
      const worst = ls.reduce((w, l) => (l.optimal - l.actual > w.optimal - w.actual ? l : w), ls[0]);
      const lost = worst.optimal - worst.actual;
      all.push({
        season: ls[0].season,
        team: ls[0].team,
        owner: ls[0].owner,
        ownerId: ls[0].ownerId,
        games: ls.length,
        actual: r2(actual),
        optimal: r2(optimal),
        left: r2(optimal - actual),
        leftPerWeek: r2((optimal - actual) / ls.length),
        efficiency: r2((actual / optimal) * 100),
        perfect: ls.filter((l) => l.optimal - l.actual < 0.005).length,
        worstWeek: lost < 0.005 ? '–' : `Wk ${worst.week}: −${r2(lost)}${worst.topBench ? ` (${worst.topBench.player} benched for ${worst.topBench.points})` : ''}`,
      });
    }
    all.sort((a, b) => b.efficiency - a.efficiency || b.actual - a.actual);
    const rows = all.slice(0, limit || undefined).map((r, i) => ({ rank: i + 1, ...r }));

    const best = rows[0];
    const worst = rows[rows.length - 1];
    return {
      columns: [
        { key: 'rank', label: '#', type: 'num' },
        { key: 'team', label: 'Team' },
        { key: 'season', label: 'Season', type: 'num' },
        { key: 'efficiency', label: 'Efficiency %', type: 'num' },
        { key: 'left', label: 'Left on bench', type: 'num' },
        { key: 'leftPerWeek', label: 'Per week', type: 'num' },
        { key: 'actual', label: 'Started', type: 'num' },
        { key: 'optimal', label: 'Optimal', type: 'num' },
        { key: 'perfect', label: 'Perfect weeks', type: 'num' },
        { key: 'games', label: 'Games', type: 'num' },
        { key: 'worstWeek', label: 'Worst week' },
      ],
      rows,
      summary: rows.length
        ? `Most efficient: ${best.team} (${best.season}) at ${best.efficiency}%. Least efficient: ${worst.team} (${worst.season}) at ${worst.efficiency}%, leaving ${worst.left} points on the bench.`
        : '',
    };
  },
};
