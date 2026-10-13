// Highest-scoring team-weeks of all time, with whether that team won.
module.exports = {
  id: 'top-weeks',
  title: 'Top scoring weeks',
  description: 'Every team’s best single-week scores across all seasons, and whether the big number actually won.',
  run(games, { limit } = {}) {
    // No limit by default: return every team-week; the UI sorts and filters.
    const rows = [...games].sort((a, b) => b.points - a.points).slice(0, limit || undefined);
    return {
      columns: [
        { key: 'rank', label: '#', type: 'num' },
        { key: 'points', label: 'Score', type: 'num' },
        { key: 'team', label: 'Team' },
        { key: 'season', label: 'Season', type: 'num' },
        { key: 'week', label: 'Week', type: 'num' },
        { key: 'opponent', label: 'Opponent' },
        { key: 'opponentPoints', label: 'Opp. score', type: 'num' },
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
