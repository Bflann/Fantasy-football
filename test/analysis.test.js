const test = require('node:test');
const assert = require('node:assert');
const { normalizeSeason, normalizeDraft, optimalLineup } = require('../src/espn');
const topWeeks = require('../src/analyses/topWeeks');
const draft = require('../src/analyses/draft');
const consistency = require('../src/analyses/consistency');
const efficiency = require('../src/analyses/efficiency');
const headToHead = require('../src/analyses/headToHead');
const parallel = require('../src/analyses/parallelUniverse');
const heartbreak = require('../src/analyses/heartbreak');
const seasonArc = require('../src/analyses/seasonArc');
const fingerprint = require('../src/analyses/fingerprint');
const clutch = require('../src/analyses/clutch');

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

test('head to head: mirrored records, per-season and playoff views', () => {
  const g = (season, week, playoff, ownerId, owner, oppId, points, oppPoints, result) =>
    ({ season, week, playoff, team: owner, owner, ownerId, opponentOwnerId: oppId, points, opponentPoints: oppPoints, result });
  const games = [
    g(2023, 1, false, '{A}', 'Pat Lee', '{B}', 100, 90, 'W'), g(2023, 1, false, '{B}', 'Pat Long', '{A}', 90, 100, 'L'),
    g(2024, 1, false, '{A}', 'Pat Lee', '{B}', 80, 95, 'L'), g(2024, 1, false, '{B}', 'Pat Long', '{A}', 95, 80, 'W'),
    g(2024, 15, true, '{A}', 'Pat Lee', '{B}', 120, 110, 'W'), g(2024, 15, true, '{B}', 'Pat Long', '{A}', 110, 120, 'L'),
  ];
  const { matrix } = headToHead.run(games);
  const v = matrix.views;
  assert.deepStrictEqual([v['all:all']['{A}']['{B}'].w, v['all:all']['{A}']['{B}'].l], [2, 1]);
  assert.deepStrictEqual([v['all:all']['{B}']['{A}'].w, v['all:all']['{B}']['{A}'].l], [1, 2]); // mirror image
  assert.strictEqual(v['2024:regular']['{A}']['{B}'].l, 1);
  assert.strictEqual(v['2024:playoffs']['{A}']['{B}'].w, 1);
  assert.strictEqual(v['2023:playoffs'], undefined);
  assert.deepStrictEqual(matrix.seasons, [2024, 2023]);
  // Same first name + last initial gets lengthened so labels stay distinguishable.
  assert.deepStrictEqual(matrix.owners.map((o) => o.short).sort(), ['Pat Le.', 'Pat Lo.']);
  assert.strictEqual(new Set(matrix.owners.map((o) => o.short)).size, 2);
});

test('parallel universes: replays each team against every other schedule', () => {
  // Three owners, three weeks, everyone plays everyone once-ish. A is strongest, C weakest.
  const g = (week, ownerId, points, oppId, oppPoints) =>
    ({ season: 2024, week, playoff: false, team: ownerId, owner: ownerId, ownerId, opponentOwnerId: oppId, points, opponentPoints: oppPoints,
      result: points > oppPoints ? 'W' : points < oppPoints ? 'L' : 'T' });
  const games = [
    // wk1: A(100) v B(80); C has a bye-like game vs nobody tracked -> give C a game vs D(not present) skipped via missing opp owner
    g(1, 'A', 100, 'B', 80), g(1, 'B', 80, 'A', 100),
    g(2, 'A', 100, 'C', 60), g(2, 'C', 60, 'A', 100),
    g(3, 'B', 80, 'C', 60), g(3, 'C', 60, 'B', 80),
    g(3, 'A', 100, 'Z', 90),
    g(1, 'C', 60, 'Y', 70), g(2, 'B', 80, 'Y', 70),
  ];
  const { rows } = parallel.run(games);
  const c = rows.find((r) => r.team === 'C');
  const a = rows.find((r) => r.team === 'A');
  // A wins every game in every universe (100 beats everything), so luck is 0 and all universes equal.
  assert.strictEqual(a.avgWins, a.wins);
  assert.strictEqual(a.luck, 0);
  assert.strictEqual(a.best, a.worst);
  // C never beats anyone: zero wins everywhere.
  assert.strictEqual(c.universes.actual, 0);
  assert.ok(c.universes.values.every((w) => w === 0));
  assert.ok(rows.every((r) => r.universes.values.length === 2)); // three owners -> two alternates
});

test('heartbreak: lineup flips and close losses, ranked by regret', () => {
  const l = (week, actual, optimal, opponentPoints, result = 'L', moves = []) =>
    ({ season: 2024, week, playoff: false, team: 'A', owner: 'A', ownerId: '{A}', opponent: 'B', opponentOwnerId: '{B}', actual, optimal, opponentPoints, result, moves });
  const { rows } = heartbreak.run([
    l(1, 100, 130, 110, 'L', [{ in: { player: 'Bench Star', points: 30 }, out: { player: 'Dud', points: 0 } }]), // flip
    l(2, 100, 101, 102), // close, not a flip
    l(3, 100, 150, 99.5, 'W'), // a win: ignored
    l(4, 80, 90, 120), // blowout, even best lineup loses: ignored
  ]);
  assert.deepStrictEqual(rows.map((r) => [r.week, r.kind]), [[1, 'Lineup flip'], [2, 'Lost by a hair']]);
  assert.strictEqual(rows[0].regret, 20);
  assert.match(rows[0].swaps, /Bench Star \(30\) for Dud \(0\)/);
  assert.strictEqual(rows[1].regret, -1);
});

test('optimalLineup still returns the total and best lineup picks the same entries', () => {
  const { bestLineup } = require('../src/espn');
  const e = (slot, points, eligible) => ({ slot, points, eligible, name: 'p' });
  const roster = [e(0, 10, [0, 20]), e(20, 18, [0, 20])];
  const best = bestLineup(roster, { 0: 1, 20: 5 });
  assert.strictEqual(best.total, 18);
  assert.ok(best.chosen.has(roster[1]));
});

test('season arc: names rising, fading and wire-to-wire seasons', () => {
  const week = (team, scores) => scores.map((p, i) => ({ season: 2024, week: i + 1, playoff: false, team, ownerId: team, owner: team, points: p, result: 'W' }));
  // Ten teams around 100; the interesting ones are laid out below. Fillers hover near the average.
  const filler = Array.from({ length: 7 }, (_, i) => week(`F${i}`, [100, 101, 99, 100, 102, 98, 100, 101]));
  const games = [
    ...filler.flat(),
    ...week('Riser', [60, 70, 80, 95, 110, 125, 135, 140]),
    ...week('Faller', [140, 135, 125, 110, 95, 80, 70, 60]),
    ...week('King', [150, 160, 155, 170, 150, 165, 158, 162]),
  ];
  const arc = Object.fromEntries(seasonArc.run(games).rows.map((r) => [r.team, r.arc]));
  assert.strictEqual(arc.Riser, 'Late bloomer');
  assert.strictEqual(arc.Faller, 'Fast start, faded');
  assert.strictEqual(arc.King, 'Wire to wire');
});

test('season arc: too-short seasons are left out', () => {
  const games = [1, 2, 3].map((w) => ({ season: 2026, week: w, playoff: false, team: 'T', ownerId: 'T', owner: 'T', points: 100, result: 'W' }));
  assert.strictEqual(seasonArc.run(games).rows.length, 0);
});

test('fingerprint: shares sum to 100 and compare against the league', () => {
  const l = (team, week, positions) => ({ season: 2024, week, playoff: false, team, owner: team, ownerId: team, positions });
  const weeks = [1, 2, 3, 4, 5, 6];
  const lineups = [
    ...weeks.map((w) => l('QBHeavy', w, { QB: 60, RB: 20, WR: 20 })),
    ...weeks.map((w) => l('Balanced', w, { QB: 20, RB: 40, WR: 40 })),
    l('Short', 1, { QB: 100 }), // under the minimum games: left out
  ];
  const { rows, columns } = fingerprint.run(lineups);
  const q = rows.find((r) => r.team === 'QBHeavy');
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(q.qbShare, 60);
  assert.strictEqual(q.rbShare + q.wrShare + q.teShare + q.kShare + q.dstShare, 40);
  // League QB share counts every game, including the short season: (360+120+100)/1300 = 44.6%.
  assert.strictEqual(columns.find((c) => c.key === 'qbShare').league, 44.6);
  assert.strictEqual(q.radar.values[0], 1.34); // 60% / 44.6%
  assert.match(q.quirk, /^Heavy on QB/);
});

test('clutch: divides multi-week playoff scores by the weeks they cover', () => {
  const reg = (week, points) => ({ season: 2023, week, playoff: false, periods: 1, ownerId: '{A}', owner: 'A', team: 'A', points, result: 'W' });
  const games = [
    reg(1, 100), reg(2, 100), reg(3, 100), reg(4, 100),
    // A two-week semifinal: 240 points over 2 scoring weeks = 120 per week. Plus a one-week final of 90.
    { season: 2023, week: 15, playoff: true, tier: 'WINNERS_BRACKET', periods: 2, ownerId: '{A}', owner: 'A', team: 'A', points: 240, result: 'W' },
    { season: 2023, week: 16, playoff: true, tier: 'WINNERS_BRACKET', periods: 1, ownerId: '{A}', owner: 'A', team: 'A', points: 90, result: 'L' },
    // Consolation games must not count.
    { season: 2023, week: 15, playoff: true, tier: 'LOSERS_CONSOLATION_LADDER', periods: 2, ownerId: '{A}', owner: 'A', team: 'A', points: 400, result: 'W' },
    reg(1, 10),
  ];
  const { rows } = clutch.run(games);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].weeks, 3); // 2 + 1, consolation ignored
  assert.strictEqual(rows[0].playoffAvg, 110); // (240 + 90) / 3
  assert.strictEqual(rows[0].record, '1-1');
  assert.strictEqual(rows[0].sample, 'Small sample');
  // Baseline is the owner's regular-season average that year: (4*100 + 10)/5 = 82.
  assert.strictEqual(rows[0].regularAvg, 82);
  assert.strictEqual(rows[0].diff, 28);
});
