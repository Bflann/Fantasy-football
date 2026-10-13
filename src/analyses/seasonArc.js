// The shape of each team's season: weekly scores relative to the league average that week
// (so bye weeks and high-scoring weeks don't distort), sorted into named arcs.
// Regular season only; seasons with fewer than MIN_GAMES played are left out.
const MIN_GAMES = 6;
const r1 = (n) => Math.round(n * 10) / 10;
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };
const median = (a) => { const s = [...a].sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };

const ARCS = {
  wire: 'Wire to wire',
  bottom: 'Stuck at the bottom',
  late: 'Late bloomer',
  fade: 'Fast start, faded',
  peak: 'Mid-season peak',
  swoon: 'Mid-season swoon',
  coaster: 'Rollercoaster',
  metronome: 'Metronome',
  steady: 'Business as usual',
};
const BLURB = {
  [ARCS.wire]: 'Beat the league average in at least 80% of weeks.',
  [ARCS.bottom]: 'Below the league average in at least 80% of weeks.',
  [ARCS.late]: 'Second half clearly better than the first.',
  [ARCS.fade]: 'First half clearly better than the second.',
  [ARCS.peak]: 'Best stretch came in the middle of the season.',
  [ARCS.swoon]: 'Worst stretch came in the middle of the season.',
  [ARCS.coaster]: 'Much more up-and-down than the typical team.',
  [ARCS.metronome]: 'Much steadier than the typical team.',
  [ARCS.steady]: 'No strong shape either way.',
};

// `rel` is points minus that week's league average; `typical` is the league-wide spread of rel.
function classify(rel, typical, medianSd) {
  const n = rel.length;
  const above = rel.filter((v) => v > 0).length / n;
  if (above >= 0.8) return ARCS.wire;
  if (above <= 0.2) return ARCS.bottom;
  const half = Math.floor(n / 2);
  const diff = mean(rel.slice(n - half)) - mean(rel.slice(0, half));
  if (diff >= 0.5 * typical) return ARCS.late;
  if (diff <= -0.5 * typical) return ARCS.fade;
  const third = Math.floor(n / 3);
  const mid = mean(rel.slice(third, n - third));
  const ends = (mean(rel.slice(0, third)) + mean(rel.slice(n - third))) / 2;
  if (mid - ends >= 0.5 * typical) return ARCS.peak;
  if (ends - mid >= 0.5 * typical) return ARCS.swoon;
  const s = sd(rel);
  if (s >= 1.25 * medianSd) return ARCS.coaster;
  if (s <= 0.75 * medianSd) return ARCS.metronome;
  return ARCS.steady;
}

module.exports = {
  id: 'season-arc',
  title: 'Season arcs',
  description: 'The shape of every team’s regular season, drawn from weekly scores (solid line) against the league average that week (dotted). Each season gets a named arc: late bloomers, fast starters who faded, rollercoasters and more.',
  ARCS,
  classify,
  run(games, { limit } = {}) {
    const reg = games.filter((g) => !g.playoff);
    const weekAvg = new Map();
    for (const g of reg) {
      const k = `${g.season}|${g.week}`;
      const w = weekAvg.get(k) || { sum: 0, n: 0 };
      w.sum += g.points; w.n++;
      weekAvg.set(k, w);
    }
    const avgFor = (g) => { const w = weekAvg.get(`${g.season}|${g.week}`); return w.sum / w.n; };

    const groups = new Map();
    for (const g of reg) {
      const key = `${g.season}|${g.ownerId || g.team}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(g);
    }
    const seasons = [...groups.values()]
      .filter((gs) => gs.length >= MIN_GAMES)
      .map((gs) => gs.sort((a, b) => a.week - b.week));

    const rels = seasons.map((gs) => gs.map((g) => g.points - avgFor(g)));
    const typical = sd(rels.flat());
    const medianSd = median(rels.map(sd));

    const all = seasons.map((gs, i) => {
      const rel = rels[i];
      const n = gs.length;
      const half = Math.floor(n / 2);
      const first = mean(gs.slice(0, half).map((g) => g.points));
      const second = mean(gs.slice(n - half).map((g) => g.points));
      const t = gs.reduce((a, g) => { a[g.result.toLowerCase()]++; return a; }, { w: 0, l: 0, t: 0 });
      const arc = classify(rel, typical, medianSd);
      return {
        season: gs[0].season,
        team: gs[0].team,
        owner: gs[0].owner,
        ownerId: gs[0].ownerId,
        arc,
        games: n,
        record: t.t ? `${t.w}-${t.l}-${t.t}` : `${t.w}-${t.l}`,
        firstHalf: r1(first),
        secondHalf: r1(second),
        change: r1(second - first),
        shape: { points: gs.map((g) => r1(g.points)), avg: gs.map((g) => r1(avgFor(g))), weeks: gs.map((g) => g.week) },
        blurb: BLURB[arc],
      };
    });
    all.sort((a, b) => b.change - a.change);
    const rows = all.slice(0, limit || undefined).map((r, i) => ({ rank: i + 1, ...r }));

    const counts = {};
    for (const r of rows) counts[r.arc] = (counts[r.arc] || 0) + 1;
    const common = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return {
      columns: [
        { key: 'rank', label: '#', type: 'num' },
        { key: 'team', label: 'Team' },
        { key: 'season', label: 'Season', type: 'num' },
        { key: 'arc', label: 'Arc' },
        { key: 'shape', label: 'Weekly scores', type: 'sparkline', sortKey: 'change' },
        { key: 'firstHalf', label: '1st half avg', type: 'num' },
        { key: 'secondHalf', label: '2nd half avg', type: 'num' },
        { key: 'change', label: 'Change', type: 'num' },
        { key: 'record', label: 'Record' },
      ],
      rows,
      summary: rows.length
        ? `Biggest riser: ${rows[0].team} (${rows[0].season}, scored ${rows[0].change} more points per week in the second half). Biggest fader: ${rows[rows.length - 1].team} (${rows[rows.length - 1].season}, ${Math.abs(rows[rows.length - 1].change)} fewer points per week in the second half). Most common arc: ${common[0]} (${common[1]} of ${rows.length}).`
        : '',
    };
  },
};
