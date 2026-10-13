// Draft value: where each player was picked vs. how many fantasy points they actually scored.
// "Value" is overall pick minus the player's finish rank among everyone drafted that season,
// so +40 means he finished 40 spots better than he was picked. "vs round avg" compares his points
// with the average for that round in the same season (so a partial current season isn't skewed).
module.exports = {
  id: 'draft',
  title: 'Draft value',
  description: 'Every draft pick ranked by value: how a player’s season points compare with where he was picked. Sort ascending to see the biggest busts.',
  needs: 'draft',
  run(picks, { limit } = {}) {
    const rankIn = new Map(); // season -> player points sorted desc
    for (const p of picks) {
      if (!rankIn.has(p.season)) rankIn.set(p.season, []);
      rankIn.get(p.season).push(p.points);
    }
    for (const list of rankIn.values()) list.sort((a, b) => b - a);

    const roundAvg = new Map();
    for (const p of picks) {
      const k = `${p.season}|${p.round}`;
      const r = roundAvg.get(k) || { sum: 0, n: 0 };
      r.sum += p.points; r.n++;
      roundAvg.set(k, r);
    }

    const round2 = (n) => Math.round(n * 100) / 100;
    const all = picks.map((p) => {
      const finish = rankIn.get(p.season).indexOf(p.points) + 1; // ties share the best rank
      const avg = roundAvg.get(`${p.season}|${p.round}`);
      return {
        season: p.season,
        pick: p.pick,
        round: p.round,
        player: p.player,
        position: p.position,
        team: p.team,
        owner: p.owner,
        ownerId: p.ownerId,
        points: p.points,
        finish,
        value: p.pick - finish,
        vsRound: round2(p.points - avg.sum / avg.n),
      };
    });
    all.sort((a, b) => b.value - a.value || b.points - a.points);
    const rows = all.slice(0, limit || undefined).map((r, i) => ({ rank: i + 1, ...r }));

    const best = rows[0];
    const bust = rows[rows.length - 1];
    return {
      columns: [
        { key: 'rank', label: '#', type: 'num' },
        { key: 'player', label: 'Player' },
        { key: 'position', label: 'Pos' },
        { key: 'team', label: 'Drafted by' },
        { key: 'season', label: 'Season', type: 'num' },
        { key: 'round', label: 'Round', type: 'num' },
        { key: 'pick', label: 'Pick', type: 'num' },
        { key: 'points', label: 'Points', type: 'num' },
        { key: 'finish', label: 'Finish', type: 'num' },
        { key: 'value', label: 'Value', type: 'num' },
        { key: 'vsRound', label: 'vs round avg', type: 'num' },
      ],
      rows,
      summary: rows.length
        ? `Best value: ${best.player} (${best.season}, pick ${best.pick}, finished ${best.finish}). Biggest bust: ${bust.player} (${bust.season}, pick ${bust.pick}, finished ${bust.finish}).`
        : '',
    };
  },
};
