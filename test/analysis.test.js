const test = require('node:test');
const assert = require('node:assert');
const { normalizeSeason } = require('../src/espn');
const topWeeks = require('../src/analyses/topWeeks');

const raw = {
  teams: [{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }, { id: 3, name: 'Gamma' }],
  schedule: [
    { matchupPeriodId: 1, winner: 'AWAY', home: { teamId: 1, totalPoints: 150.5 }, away: { teamId: 2, totalPoints: 151 } },
    { matchupPeriodId: 2, winner: 'HOME', home: { teamId: 1, totalPoints: 120 }, away: { teamId: 3, totalPoints: 100 } },
    { matchupPeriodId: 3, winner: 'UNDECIDED', home: { teamId: 1, totalPoints: 0 }, away: { teamId: 3, totalPoints: 0 } },
    { matchupPeriodId: 4, winner: 'HOME', home: { teamId: 1, totalPoints: 99 } }, // bye
  ],
};

test('normalizes to one record per side, skipping byes and unplayed games', () => {
  const g = normalizeSeason(2024, raw);
  assert.strictEqual(g.length, 4);
});

test('ranks top weeks and records win/loss', () => {
  const { rows } = topWeeks.run(normalizeSeason(2024, raw));
  assert.deepStrictEqual(rows.map((r) => [r.team, r.result]), [['Beta', 'W'], ['Alpha', 'L'], ['Alpha', 'W'], ['Gamma', 'L']]);
  assert.strictEqual(rows[0].rank, 1);
});
