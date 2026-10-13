// Highest-scoring team-weeks of all time, with whether that team won.
module.exports = {
  id: 'top-weeks',
  title: 'Top scoring weeks',
  description: 'Every team’s best single-week scores across all seasons, and whether the big number actually won. Two-week playoff matchups are left out because their score is a two-week total.',
  run(games, { limit } = {}) {
    // No limit by default: return every team-week; the UI sorts and filters.
    // Two-week playoff matchups report the two weeks' sum, which isn't a single-week score.
    const rows = games.filter((g) => !g.periods || g.periods === 1).sort((a, b) => b.points - a.points).slice(0, limit || undefined);
    return {
      columns: [
        { key: 'rank', label: '#', type: 'num' },
        { key: 'season', label: 'Season', type: 'num' },
        { key: 'week', label: 'Week', type: 'num' },
        // Matchup block: Team  score – score  Opponent, with both scores still sortable on their own.
        { key: 'team', label: 'Team', side: 'team-a' },
        { key: 'points', label: 'Score', type: 'num', side: 'score-a' },
        { key: 'opponentPoints', label: 'Opp.', type: 'num', side: 'score-b' },
        { key: 'opponent', label: 'Opponent', side: 'team-b' },
        { key: 'result', label: 'Result', type: 'result' },
      ],
      rows: rows.map((g, i) => ({ rank: i + 1, ...g })),
      summary: summarize(rows),
    };
  },
};

function summarize(rows) {
  const lost = rows.filter((r) => r.result === 'L').length;
  return rows.length ? `${lost} of ${rows.length} team-weeks were losses.` : '';
}
