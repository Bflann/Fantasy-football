const test = require('node:test');
const assert = require('node:assert');
const { normalizeSeason, normalizeDraft } = require('../src/espn');
const topWeeks = require('../src/analyses/topWeeks');
const draft = require('../src/analyses/draft');

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

test('owners are keyed by member id, not team name', () => {
  const league = (name) => ({
    members: [{ id: '{ME}', firstName: 'Pat', lastName: 'Lee' }],
    teams: [{ id: 1, name, owners: ['{ME}'] }, { id: 2, name: 'Other', owners: [] }],
    schedule: [{ matchupPeriodId: 1, winner: 'HOME', home: { teamId: 1, totalPoints: 10 }, away: { teamId: 2, totalPoints: 5 } }],
  });
  const a = normalizeSeason(2023, league('Old Name'));
  const b = normalizeSeason(2024, league('New Name'));
  assert.strictEqual(a[0].ownerId, '{ME}');
  assert.strictEqual(a[0].ownerId, b[0].ownerId);
  assert.notStrictEqual(a[0].team, b[0].team);
  assert.strictEqual(a[0].owner, 'Pat Lee');
  assert.strictEqual(a[0].opponentOwnerId, '');
});

test('draft value: players who outscore their pick rank first, busts last', () => {
  const league = {
    members: [{ id: '{ME}', firstName: 'Pat', lastName: 'Lee' }],
    teams: [{ id: 1, name: 'Alpha', owners: ['{ME}'] }],
    draftDetail: { picks: [1, 2, 3].map((n) => ({ playerId: n, overallPickNumber: n, roundId: 1, teamId: 1 })) },
  };
  const stat = (v) => [{ statSplitTypeId: 0, statSourceId: 0, seasonId: 2024, appliedTotal: v }];
  const players = [
    { id: 1, player: { fullName: 'Bust', defaultPositionId: 2, stats: stat(10) } },
    { id: 2, player: { fullName: 'Solid', defaultPositionId: 3, stats: stat(200) } },
    { id: 3, player: { fullName: 'Steal', defaultPositionId: 1, stats: stat(300) } },
  ];
  const { rows } = draft.run(normalizeDraft(2024, { league, players }));
  assert.deepStrictEqual(rows.map((r) => r.player), ['Steal', 'Solid', 'Bust']);
  assert.deepStrictEqual(rows.map((r) => r.value), [2, 0, -2]);
  assert.strictEqual(rows[0].position, 'QB');
  assert.strictEqual(rows[0].ownerId, '{ME}');
});
