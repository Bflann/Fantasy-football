// One page of stats for a single owner's team in a single season.
// Pieces come from the same analyses that power the tabs, so the numbers always agree with them.
const { slug } = require('./owners');
const consistency = require('./analyses/consistency');
const parallel = require('./analyses/parallelUniverse');
const fingerprint = require('./analyses/fingerprint');
const efficiency = require('./analyses/efficiency');
const heartbreak = require('./analyses/heartbreak');
const draft = require('./analyses/draft');

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const rec = (w, l, t) => (t ? `${w}-${l}-${t}` : `${w}-${l}`);
const tally = (gs) => gs.reduce((a, g) => { a[g.result.toLowerCase()]++; return a; }, { w: 0, l: 0, t: 0 });
const key = (season, ownerId) => `${season}|${ownerId}`;

function buildTeamSeasons({ games, lineups = [], picks = [] }) {
  const byKey = (rows) => new Map(rows.filter((r) => r.ownerId).map((r) => [key(r.season, r.ownerId), r]));
  // Position shares of the league, taken from the fingerprint analysis' column metadata.
  const leagueShare = Object.fromEntries(
    fingerprint.run(lineups).columns.filter((c) => c.type === 'share').map((c) => [c.label, c.league]),
  );
  const universeRows = byKey(parallel.run(games).rows);
  const efficiencyRows = byKey(efficiency.run(lineups).rows);
  const draftRows = draft.run(picks).rows.filter((r) => r.ownerId);
  const heartRows = heartbreak.run(lineups).rows.filter((r) => r.ownerId);

  const lineupFor = new Map(lineups.map((l) => [`${l.season}|${l.week}|${l.ownerId}`, l]));
  const weekAvg = new Map();
  for (const g of games) {
    const k = `${g.season}|${g.week}`;
    const w = weekAvg.get(k) || { sum: 0, n: 0 };
    w.sum += g.points / (g.periods || 1); w.n++;
    weekAvg.set(k, w);
  }
  const owners = new Map();
  const latestName = new Map();
  for (const g of games) {
    if (!g.ownerId) continue;
    if (!owners.has(g.ownerId)) owners.set(g.ownerId, new Set());
    owners.get(g.ownerId).add(g.season);
    latestName.set(g.ownerId, g.owner);
  }

  // Regular-season finish within each season: wins, then points for.
  const finish = new Map();
  const bySeason = new Map();
  for (const g of games) {
    if (g.playoff || !g.ownerId) continue;
    if (!bySeason.has(g.season)) bySeason.set(g.season, new Map());
    const m = bySeason.get(g.season);
    const s = m.get(g.ownerId) || { id: g.ownerId, wins: 0, pf: 0 };
    s.wins += g.result === 'W' ? 1 : g.result === 'T' ? 0.5 : 0;
    s.pf += g.points;
    m.set(g.ownerId, s);
  }
  for (const [season, m] of bySeason) {
    [...m.values()].sort((a, b) => b.wins - a.wins || b.pf - a.pf).forEach((s, i, all) => finish.set(key(season, s.id), { rank: i + 1, of: all.length }));
  }

  const pages = {};
  const groups = new Map();
  for (const g of games) {
    if (!g.ownerId) continue;
    const k = key(g.season, g.ownerId);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(g);
  }

  for (const [k, gs] of groups) {
    gs.sort((a, b) => a.week - b.week);
    const { season, ownerId } = gs[0];
    const reg = gs.filter((g) => !g.playoff);
    const post = gs.filter((g) => g.playoff);
    const t = tally(reg);
    const pt = tally(post);
    const pf = reg.reduce((s, g) => s + g.points, 0);
    const pa = reg.reduce((s, g) => s + g.opponentPoints, 0);
    const f = finish.get(k);
    const eff = efficiencyRows.get(k);
    const uni = universeRows.get(k);

    pages[`${slug(ownerId)}/${season}`] = {
      slug: slug(ownerId),
      season,
      owner: latestName.get(ownerId) || gs[0].owner,
      ownerId,
      team: gs[0].team,
      summary: {
        record: rec(t.w, t.l, t.t),
        playoffs: post.length ? rec(pt.w, pt.l, pt.t) : '–',
        finish: f ? `${f.rank} of ${f.of}` : '–',
        pointsFor: r2(pf),
        pointsAgainst: r2(pa),
        avgPoints: reg.length ? r2(pf / reg.length) : 0,
        highScore: reg.length ? Math.max(...reg.map((g) => g.points)) : 0,
        lowScore: reg.length ? Math.min(...reg.map((g) => g.points)) : 0,
        games: reg.length,
      },
      weeks: gs.map((g) => {
        const l = lineupFor.get(`${g.season}|${g.week}|${g.ownerId}`);
        const avg = weekAvg.get(`${g.season}|${g.week}`);
        return {
          week: g.week,
          playoff: g.playoff,
          periods: g.periods || 1,
          opponent: g.opponent,
          opponentOwnerId: g.opponentOwnerId,
          points: g.points,
          opponentPoints: g.opponentPoints,
          result: g.result,
          leagueAvg: avg ? r1((avg.sum / avg.n) * (g.periods || 1)) : null,
          optimal: l ? l.optimal : null,
        };
      }),
      consistency: (() => {
        // Computed directly (no minimum-games cut-off) so a season in progress still gets its plot.
        const scores = reg.map((g) => g.points);
        if (scores.length < 3) return null;
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / (scores.length - 1));
        const box = consistency.boxStats(scores);
        return {
          mean: r2(mean),
          stdDev: r2(sd),
          variation: r2((sd / mean) * 100),
          median: r2(box.median),
          plot: Object.fromEntries(Object.entries(box).map(([n, v]) => [n, Array.isArray(v) ? v.map(r2) : r2(v)])),
        };
      })(),
      fingerprint: (() => {
        const ls = lineups.filter((l) => !l.playoff && l.ownerId === ownerId && l.season === season && l.positions);
        const totals = fingerprint.POSITIONS.map((p) => ls.reduce((s, l) => s + (l.positions[p] || 0), 0));
        const sum = totals.reduce((a, b) => a + b, 0);
        if (!sum) return null;
        const shares = totals.map((v) => r1((v / sum) * 100));
        return {
          radar: {
            labels: fingerprint.POSITIONS,
            shares,
            league: fingerprint.POSITIONS.map((p) => leagueShare[p]),
            values: totals.map((v, i) => r2(((v / sum) * 100) / leagueShare[fingerprint.POSITIONS[i]])),
          },
        };
      })(),
      efficiency: eff ? { efficiency: eff.efficiency, left: eff.left, leftPerWeek: eff.leftPerWeek, perfect: eff.perfect, games: eff.games, actual: eff.actual, optimal: eff.optimal } : null,
      universes: uni ? { values: uni.universes.values, actual: uni.universes.actual, avgWins: uni.avgWins, luck: uni.luck, max: uni.games } : null,
      draft: draftRows
        .filter((r) => r.season === season && r.ownerId === ownerId)
        .sort((a, b) => a.pick - b.pick)
        .map((r) => ({ round: r.round, pick: r.pick, player: r.player, position: r.position, points: r.points, finish: r.finish, value: r.value })),
      heartbreaks: heartRows
        .filter((r) => r.season === season && r.ownerId === ownerId)
        .map((r) => ({ week: r.week, opponent: r.opponent, points: r.points, opponentPoints: r.opponentPoints, margin: r.margin, regret: r.regret, swaps: r.swaps })),
      seasons: [...owners.get(ownerId)].sort((a, b) => b - a),
    };
  }
  return pages;
}

module.exports = { buildTeamSeasons };
