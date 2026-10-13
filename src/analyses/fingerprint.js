// Where each team's points come from: share of started points by position, compared with the
// league-wide share. A "fingerprint" is the radar of those ratios (1.0 = same as the league).
// Regular season only.
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'D/ST'];
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
// Short seasons give lopsided shares from a handful of games; wait until a team has this many.
const MIN_GAMES = 6;
const KEY = { QB: 'qb', RB: 'rb', WR: 'wr', TE: 'te', K: 'k', 'D/ST': 'dst' };

module.exports = {
  id: 'fingerprint',
  title: 'Scoring fingerprint',
  description: 'The share of each team’s points that came from each position, against the league average. On the radar the dashed ring is the league average, so a spike toward the edge is a team that leaned on that position.',
  needs: 'lineups',
  POSITIONS,
  run(lineups, { limit } = {}) {
    const reg = lineups.filter((l) => !l.playoff && l.positions);
    const leagueTotals = Object.fromEntries(POSITIONS.map((p) => [p, 0]));
    for (const l of reg) for (const p of POSITIONS) leagueTotals[p] += l.positions[p] || 0;
    const leagueSum = POSITIONS.reduce((s, p) => s + leagueTotals[p], 0) || 1;
    const league = Object.fromEntries(POSITIONS.map((p) => [p, (leagueTotals[p] / leagueSum) * 100]));

    const groups = new Map();
    for (const l of reg) {
      const key = `${l.season}|${l.ownerId || l.team}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(l);
    }

    const all = [];
    for (const ls of groups.values()) {
      if (ls.length < MIN_GAMES) continue;
      const totals = Object.fromEntries(POSITIONS.map((p) => [p, ls.reduce((s, l) => s + (l.positions[p] || 0), 0)]));
      const sum = POSITIONS.reduce((s, p) => s + totals[p], 0);
      if (!sum) continue;
      const share = Object.fromEntries(POSITIONS.map((p) => [p, (totals[p] / sum) * 100]));
      const ratio = POSITIONS.map((p) => share[p] / league[p]);
      const row = {
        season: ls[0].season,
        team: ls[0].team,
        owner: ls[0].owner,
        ownerId: ls[0].ownerId,
        games: ls.length,
        points: r1(sum),
        radar: { labels: POSITIONS, values: ratio.map(r2), shares: POSITIONS.map((p) => r1(share[p])), league: POSITIONS.map((p) => r1(league[p])) },
      };
      for (const p of POSITIONS) row[`${KEY[p]}Share`] = r1(share[p]);
      all.push(row);
    }
    all.sort((a, b) => b.season - a.season || a.team.localeCompare(b.team));
    const rows = all.slice(0, limit || undefined).map((r, i) => ({ rank: i + 1, ...r }));

    return {
      columns: [
        { key: 'rank', label: '#', type: 'num' },
        { key: 'team', label: 'Team' },
        { key: 'season', label: 'Season', type: 'num' },
        { key: 'radar', label: 'Fingerprint', type: 'radar' },
        ...POSITIONS.map((p) => ({ key: `${KEY[p]}Share`, label: p, type: 'share', league: r1(league[p]) })),
      ],
      rows,
      summary: rows.length ? `League average split: ${POSITIONS.map((p) => `${p} ${r1(league[p])}%`).join(', ')}.` : '',
    };
  },
};
