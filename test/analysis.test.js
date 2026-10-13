const test = require('node:test');
const assert = require('node:assert');
const { normalizeSeason, normalizeDraft, optimalLineup } = require('../src/espn');
const topWeeks = require('../src/analyses/topWeeks');
const draft = require('../src/analyses/draft');
const consistency = require('../src/analyses/consistency');
const efficiency = require('../src/analyses/efficiency');

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

test('consistency: quartiles, outliers and ordering by std dev', () => {
  const box = consistency.boxStats([10, 11, 12, 13, 14, 15, 100]);
  assert.strictEqual(box.q1, 11.5);
  assert.strictEqual(box.median, 13);
  assert.strictEqual(box.q3, 14.5);
  assert.deepStrictEqual(box.outliers, [100]);
  assert.strictEqual(box.whiskerHigh, 15);

  const season = (team, scores) => scores.map((p, i) => ({ season: 2024, week: i + 1, playoff: false, team, ownerId: team, owner: team, points: p }));
  const games = [
    ...season('Steady', [100, 101, 99, 100, 100, 101, 99, 100]),
    ...season('Wild', [50, 150, 60, 140, 100, 55, 145, 100]),
    ...season('Short', [100, 100, 100]), // under 8 games: excluded
    { season: 2024, week: 9, playoff: true, team: 'Steady', ownerId: 'Steady', owner: 'Steady', points: 300 }, // playoffs ignored
  ];
  const { rows, columns } = consistency.run(games);
  assert.deepStrictEqual(rows.map((r) => r.team), ['Steady', 'Wild']);
  assert.strictEqual(rows[0].games, 8);
  assert.ok(rows[0].stdDev < rows[1].stdDev);
  const axis = columns.find((c) => c.type === 'boxplot').axis;
  assert.ok(axis.min <= 50 && axis.max >= 150);
});

test('optimal lineup fills restrictive slots first and uses flex for the best leftover', () => {
  // Slots: 1 QB (0), 1 RB (2), 1 FLEX (23, RB/WR). Bench slot 20.
  const e = (slot, points, eligible) => ({ slot, points, eligible, name: 'p' });
  const roster = [
    e(0, 20, [0, 20]),        // QB started
    e(2, 5, [2, 23, 20]),     // RB started, weak
    e(20, 15, [2, 23, 20]),   // RB on bench, strong
    e(20, 12, [4, 23, 20]),   // WR on bench, fills flex
    e(21, 99, [2, 23, 21]),   // IR: never counted
  ];
  assert.strictEqual(optimalLineup(roster, { 0: 1, 2: 1, 23: 1, 20: 6, 21: 1 }), 20 + 15 + 12);
});

test('efficiency: ratio of started to optimal points, regular season only', () => {
  const l = (week, actual, optimal, playoff = false) => ({ season: 2024, week, playoff, team: 'A', ownerId: '{A}', owner: 'A', actual, optimal, topBench: { player: 'Bench Guy', points: optimal - actual } });
  const { rows } = efficiency.run([l(1, 100, 100), l(2, 80, 100), l(3, 10, 500, true)]);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].efficiency, 90);
  assert.strictEqual(rows[0].left, 20);
  assert.strictEqual(rows[0].perfect, 1);
  assert.match(rows[0].worstWeek, /^Wk 2: −20/);
});
