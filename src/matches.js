// One page per matchup: both rosters with every player's points and the stat lines behind them.
// Built from the weekly lineup records, so only games with a validated roster get a page.
const { slug } = require('./owners');

const SLOT = { 0: 'QB', 2: 'RB', 3: 'RB/WR', 4: 'WR', 5: 'WR/TE', 6: 'TE', 7: 'OP', 16: 'D/ST', 17: 'K', 20: 'Bench', 21: 'IR', 23: 'FLEX' };
// Starting slots in the order they are shown; bench and IR come last.
const ORDER = [0, 2, 4, 6, 23, 3, 5, 7, 17, 16, 20, 21];

const side = (l) => ({
  team: l.team,
  owner: l.owner,
  ownerId: l.ownerId,
  slug: slug(l.ownerId),
  points: l.actual,
  optimal: l.optimal,
  moves: l.moves || [],
  roster: [...(l.roster || [])]
    .sort((a, b) => ORDER.indexOf(a.slot) - ORDER.indexOf(b.slot) || b.points - a.points)
    .map((p) => ({
      player: p.player,
      position: p.position,
      slot: SLOT[p.slot] || `Slot ${p.slot}`,
      started: p.slot !== 20 && p.slot !== 21,
      points: p.points,
      breakdown: p.breakdown.map((b) => ({ label: b.label, value: b.value, points: b.points })),
    })),
});

// Key is order-insensitive: "<season>/<week>/<slugLo>/<slugHi>".
const matchKey = (season, week, a, b) => [season, week, ...[a, b].sort()].join('/');

function buildMatches(lineups) {
  const byKey = new Map(lineups.filter((l) => l.ownerId).map((l) => [`${l.season}|${l.week}|${l.ownerId}`, l]));
  const pages = {};
  for (const l of lineups) {
    if (!l.ownerId || !l.opponentOwnerId || !l.roster || l.ownerId > l.opponentOwnerId) continue;
    const other = byKey.get(`${l.season}|${l.week}|${l.opponentOwnerId}`);
    if (!other || !other.roster) continue;
    const a = side(l);
    const b = side(other);
    pages[matchKey(l.season, l.week, a.slug, b.slug)] = {
      season: l.season,
      week: l.week,
      playoff: l.playoff,
      teams: [a, b],
      winner: a.points === b.points ? null : a.points > b.points ? a.slug : b.slug,
    };
  }
  return pages;
}

module.exports = { buildMatches, matchKey };
