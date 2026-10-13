// What would each team's record have been under every other owner's schedule?
// In universe B, owner A faces whoever B faced each week (and faces B itself in the weeks B played A).
// That gives N-1 alternate universes plus the real one; the spread shows how much of a record was schedule.
// Regular season only.
const r2 = (n) => Math.round(n * 100) / 100;
const MIN_GAMES = 3;

module.exports = {
  id: 'parallel-universe',
  title: 'Parallel universes',
  description: 'Each team’s season replayed against every other owner’s schedule. The dots show the wins they would have had in each universe; the ringed dot is what actually happened.',
  run(games, { limit } = {}) {
    const seasons = new Map();
    for (const g of games) {
      if (g.playoff || !g.ownerId) continue;
      if (!seasons.has(g.season)) seasons.set(g.season, new Map());
      const owners = seasons.get(g.season);
      if (!owners.has(g.ownerId)) owners.set(g.ownerId, new Map());
      owners.get(g.ownerId).set(g.week, g);
    }

    const all = [];
    for (const [season, owners] of seasons) {
      for (const [a, aWeeks] of owners) {
        if (aWeeks.size < MIN_GAMES) continue;
        const mine = [...aWeeks.values()];
        const actualWins = mine.reduce((s, g) => s + (g.result === 'W' ? 1 : g.result === 'T' ? 0.5 : 0), 0);
        const universes = [];
        for (const [b, bWeeks] of owners) {
          if (b === a) continue;
          let wins = 0;
          for (const g of mine) {
            const theirs = bWeeks.get(g.week);
            if (!theirs) continue;
            const opp = theirs.opponentOwnerId === a ? theirs.points : theirs.opponentPoints;
            wins += g.points > opp ? 1 : g.points === opp ? 0.5 : 0;
          }
          universes.push(wins);
        }
        if (!universes.length) continue;
        const everything = [...universes, actualWins];
        const mean = everything.reduce((x, y) => x + y, 0) / everything.length;
        const better = universes.filter((w) => w > actualWins).length;
        const first = mine[0];
        const t = mine.reduce((acc, g) => { acc[g.result.toLowerCase()]++; return acc; }, { w: 0, l: 0, t: 0 });
        all.push({
          season,
          team: first.team,
          owner: first.owner,
          ownerId: first.ownerId,
          games: mine.length,
          record: t.t ? `${t.w}-${t.l}-${t.t}` : `${t.w}-${t.l}`,
          wins: actualWins,
          avgWins: r2(mean),
          luck: r2(actualWins - mean),
          best: Math.max(...universes),
          worst: Math.min(...universes),
          better: `${better} of ${universes.length}`,
          universes: { values: universes, actual: actualWins },
        });
      }
    }
    // Biggest schedule screw-job first: the largest gap below the typical-universe win total.
    all.sort((a, b) => a.luck - b.luck || b.avgWins - a.avgWins);
    const rows = all.slice(0, limit || undefined).map((r, i) => ({ rank: i + 1, ...r }));
    const maxGames = Math.max(1, ...rows.map((r) => r.games));

    const top = rows[0];
    const lucky = rows[rows.length - 1];
    return {
      columns: [
        { key: 'rank', label: '#', type: 'num' },
        { key: 'team', label: 'Team' },
        { key: 'season', label: 'Season', type: 'num' },
        { key: 'record', label: 'Actual' },
        { key: 'avgWins', label: 'Avg universe', type: 'num' },
        { key: 'luck', label: 'Schedule luck', type: 'num' },
        { key: 'universes', label: `Wins in each universe (0–${maxGames})`, type: 'strip', sortKey: 'avgWins', axis: { min: 0, max: maxGames } },
        { key: 'better', label: 'Better universes' },
        { key: 'best', label: 'Best', type: 'num' },
        { key: 'worst', label: 'Worst', type: 'num' },
      ],
      rows,
      summary: rows.length
        ? `Most hurt by schedule: ${top.team} (${top.season}) went ${top.record} but averages ${top.avgWins} wins across universes. Luckiest: ${lucky.team} (${lucky.season}), ${lucky.record} vs ${lucky.avgWins} typical.`
        : '',
    };
  },
};
