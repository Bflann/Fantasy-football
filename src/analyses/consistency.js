// How steady each team-season's weekly scores were, with a box-and-whisker summary of the scores.
// Regular season only, and seasons with fewer than MIN_GAMES played are left out (too few to judge).
const MIN_GAMES = 8;

const r2 = (n) => Math.round(n * 100) / 100;

// Linear-interpolated quantile of an ascending array (same method as Excel's QUARTILE.INC).
function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Tukey box plot: whiskers reach the furthest scores within 1.5 × IQR of the box; the rest are outliers.
function boxStats(scores) {
  const s = [...scores].sort((a, b) => a - b);
  const q1 = quantile(s, 0.25);
  const median = quantile(s, 0.5);
  const q3 = quantile(s, 0.75);
  const fence = 1.5 * (q3 - q1);
  const inside = s.filter((v) => v >= q1 - fence && v <= q3 + fence);
  return {
    min: s[0],
    q1,
    median,
    q3,
    max: s[s.length - 1],
    whiskerLow: inside[0],
    whiskerHigh: inside[inside.length - 1],
    outliers: s.filter((v) => v < q1 - fence || v > q3 + fence),
  };
}

function stdDev(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1));
}

module.exports = {
  id: 'consistency',
  title: 'Consistency',
  description: 'How steady each team’s weekly scoring was in each regular season. Lower standard deviation means more predictable; the box shows the middle half of scores, whiskers the typical range, dots the outlier weeks.',
  boxStats,
  run(games, { limit } = {}) {
    const groups = new Map();
    for (const g of games) {
      if (g.playoff) continue;
      const key = `${g.season}|${g.ownerId || g.team}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(g);
    }

    const all = [];
    for (const gs of groups.values()) {
      if (gs.length < MIN_GAMES) continue;
      const scores = gs.map((g) => g.points);
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const sd = stdDev(scores);
      const box = boxStats(scores);
      all.push({
        season: gs[0].season,
        team: gs[0].team,
        owner: gs[0].owner,
        ownerId: gs[0].ownerId,
        games: gs.length,
        mean: r2(mean),
        stdDev: r2(sd),
        variation: r2((sd / mean) * 100),
        median: r2(box.median),
        min: r2(box.min),
        max: r2(box.max),
        plot: Object.fromEntries(Object.entries(box).map(([k, v]) => [k, Array.isArray(v) ? v.map(r2) : r2(v)])),
      });
    }
    all.sort((a, b) => a.stdDev - b.stdDev || b.mean - a.mean);
    const rows = all.slice(0, limit || undefined).map((r, i) => ({ rank: i + 1, ...r }));

    // One shared axis so the plots are comparable down the page.
    const lo = Math.min(...rows.map((r) => r.min));
    const hi = Math.max(...rows.map((r) => r.max));
    const axis = rows.length ? { min: Math.floor(lo / 10) * 10, max: Math.ceil(hi / 10) * 10 } : { min: 0, max: 1 };

    const steady = rows[0];
    const wild = rows[rows.length - 1];
    return {
      columns: [
        { key: 'rank', label: '#', type: 'num' },
        { key: 'team', label: 'Team' },
        { key: 'season', label: 'Season', type: 'num' },
        { key: 'mean', label: 'Avg', type: 'num' },
        { key: 'stdDev', label: 'Std dev', type: 'num' },
        { key: 'plot', label: `Scores (${axis.min}–${axis.max})`, type: 'boxplot', sortKey: 'median', axis },
        { key: 'games', label: 'Games', type: 'num' },
        { key: 'variation', label: 'Variation %', type: 'num' },
        { key: 'median', label: 'Median', type: 'num' },
      ],
      rows,
      summary: rows.length
        ? `Most consistent: ${steady.team} (${steady.season}), std dev ${steady.stdDev}. Most volatile: ${wild.team} (${wild.season}), std dev ${wild.stdDev}.`
        : '',
    };
  },
};
