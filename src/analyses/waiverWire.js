// Players a team picked up off the waiver wire or free agency (anyone on a roster they did not draft),
// ranked by the points they scored while in that team's starting lineup.
// Source: the weekly rosters, so a pickup shows from the first week the player appears on the roster.
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

module.exports = {
  id: 'waiver',
  title: 'Waiver wire heroes',
  description: 'Every player added from the waiver wire or free agency, ranked by the points they scored while starting for the team that added them. A week-1 add may have been picked up in the preseason.',
  needs: 'lineups',
  run(lineups, { limit } = {}) {
    const adds = new Map();
    for (const l of [...lineups].sort((a, b) => a.season - b.season || a.week - b.week)) {
      if (!l.pickups) continue;
      for (const p of l.pickups) {
        const k = `${l.season}|${l.ownerId || l.team}|${p.playerId}`;
        let a = adds.get(k);
        if (!a) {
          a = {
            season: l.season, team: l.team, owner: l.owner, ownerId: l.ownerId,
            player: p.player, position: p.position, firstWeek: l.week,
            weeks: 0, starts: 0, startedPoints: 0, benchPoints: 0, best: 0, bestWeek: null, lastWeek: l.week, playoffStarts: 0,
          };
          adds.set(k, a);
        }
        a.weeks++;
        a.lastWeek = l.week;
        if (p.started) {
          a.starts++;
          a.startedPoints += p.points;
          if (l.playoff) a.playoffStarts++;
          if (p.points >= a.best) { a.best = p.points; a.bestWeek = l.week; }
        } else {
          a.benchPoints += p.points;
        }
      }
    }

    const all = [...adds.values()]
      .filter((a) => a.starts > 0)
      .map((a) => ({
        season: a.season,
        team: a.team,
        owner: a.owner,
        ownerId: a.ownerId,
        player: a.player,
        position: a.position,
        addedWeek: a.firstWeek,
        weeks: a.weeks,
        starts: a.starts,
        points: r1(a.startedPoints),
        perStart: r1(a.startedPoints / a.starts),
        best: r1(a.best),
        bestWeek: a.bestWeek,
      }));
    all.sort((a, b) => b.points - a.points || b.perStart - a.perStart);
    const rows = all.slice(0, limit || undefined).map((r, i) => ({ rank: i + 1, ...r }));

    const best = rows[0];
    return {
      columns: [
        { key: 'rank', label: '#', type: 'num' },
        { key: 'player', label: 'Player' },
        { key: 'position', label: 'Pos' },
        { key: 'team', label: 'Added by' },
        { key: 'season', label: 'Season', type: 'num' },
        { key: 'addedWeek', label: 'Added (wk)', type: 'num' },
        { key: 'points', label: 'Points started', type: 'num' },
        { key: 'starts', label: 'Starts', type: 'num' },
        { key: 'perStart', label: 'Per start', type: 'num' },
        { key: 'best', label: 'Best week', type: 'num' },
        { key: 'weeks', label: 'Weeks rostered', type: 'num' },
      ],
      rows,
      summary: rows.length
        ? `${all.length} pickups started at least once. Most points: ${best.player} for ${best.team} in ${best.season}, ${best.points} across ${best.starts} starts.`
        : '',
    };
  },
};
