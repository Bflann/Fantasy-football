// All-time record per owner. Owners are matched across seasons by their ESPN member id,
// so renaming a team doesn't split their history.
const { ownerSummaries } = require('../owners');

module.exports = {
  id: 'standings',
  title: 'All-time standings',
  description: 'Every owner’s combined record across all seasons. Click an owner to see their personal page.',
  run(games, { limit } = {}) {
    const rows = ownerSummaries(games)
      .sort((a, b) => b.winPct - a.winPct || b.pointsFor - a.pointsFor)
      .slice(0, limit || undefined)
      .map((o, i) => ({ rank: i + 1, ...o }));
    return {
      columns: [
        { key: 'rank', label: '#', type: 'num' },
        { key: 'owner', label: 'Owner', type: 'owner' },
        { key: 'team', label: 'Latest team' },
        { key: 'seasons', label: 'Seasons', type: 'num' },
        { key: 'record', label: 'Record' },
        { key: 'winPct', label: 'Win %', type: 'num' },
        { key: 'playoffs', label: 'Playoffs' },
        { key: 'avgPoints', label: 'Avg score', type: 'num' },
        { key: 'highScore', label: 'High score', type: 'num' },
        { key: 'pointsFor', label: 'Points for', type: 'num' },
        { key: 'pointsAgainst', label: 'Points against', type: 'num' },
      ],
      rows,
      summary: rows.length ? `Best all-time record: ${rows[0].owner} (${rows[0].record}).` : '',
    };
  },
};
