// Per-owner profiles built from the flat team-week games and draft picks.
// Owners are keyed by ESPN member id (stable across seasons); team names are just labels.
const draft = require('./analyses/draft');

const slug = (id) => String(id || '').replace(/[{}]/g, '').toLowerCase();
const r2 = (n) => Math.round(n * 100) / 100;
const tally = (games) => {
  const t = { w: 0, l: 0, t: 0 };
  for (const g of games) t[g.result.toLowerCase()]++;
  return t;
};
const rec = (t) => (t.t ? `${t.w}-${t.l}-${t.t}` : `${t.w}-${t.l}`);
const winPct = (t) => (t.w + t.l + t.t ? r2((t.w + t.t / 2) / (t.w + t.l + t.t)) : 0);
const chrono = (a, b) => a.season - b.season || a.week - b.week;

function streaks(games) {
  let w = 0, l = 0, bestW = 0, bestL = 0;
  for (const g of [...games].sort(chrono)) {
    w = g.result === 'W' ? w + 1 : 0;
    l = g.result === 'L' ? l + 1 : 0;
    bestW = Math.max(bestW, w);
    bestL = Math.max(bestL, l);
  }
  return { win: bestW, loss: bestL };
}

const brief = (g) => g && ({
  season: g.season, week: g.week, playoff: g.playoff, team: g.team, opponent: g.opponent,
  points: g.points, opponentPoints: g.opponentPoints, result: g.result,
});

// Group games by owner and gather the display names we need.
function index(games) {
  const byOwner = new Map();
  const latest = new Map(); // ownerId -> { season, name, team }
  for (const g of games) {
    if (!g.ownerId) continue;
    if (!byOwner.has(g.ownerId)) byOwner.set(g.ownerId, []);
    byOwner.get(g.ownerId).push(g);
    const l = latest.get(g.ownerId);
    if (!l || g.season >= l.season) latest.set(g.ownerId, { season: g.season, name: g.owner || 'Unknown', team: g.team });
  }
  return { byOwner, latest };
}

function summary(id, mine, latest) {
  const reg = mine.filter((g) => !g.playoff);
  const post = mine.filter((g) => g.playoff);
  const all = tally(mine);
  const pf = mine.reduce((s, g) => s + g.points, 0);
  const pa = mine.reduce((s, g) => s + g.opponentPoints, 0);
  const high = [...mine].sort((a, b) => b.points - a.points)[0];
  return {
    ownerId: id,
    slug: slug(id),
    owner: latest.name,
    team: latest.team,
    seasons: new Set(mine.map((g) => g.season)).size,
    games: mine.length,
    record: rec(all),
    winPct: winPct(all),
    regularSeason: rec(tally(reg)),
    playoffs: post.length ? rec(tally(post)) : '–',
    pointsFor: r2(pf),
    pointsAgainst: r2(pa),
    avgPoints: mine.length ? r2(pf / mine.length) : 0,
    highScore: high ? high.points : 0,
  };
}

function ownerSummaries(games) {
  const { byOwner, latest } = index(games);
  return [...byOwner].map(([id, mine]) => summary(id, mine, latest.get(id)));
}

function buildProfiles(games, picks = []) {
  const { byOwner, latest } = index(games);
  const nameOf = (id) => (latest.get(id) || {}).name || 'Unknown';

  // Regular-season finish within each season: wins (ties = half), then points for.
  const finish = new Map(); // `${season}|${ownerId}` -> { rank, of }
  const bySeason = new Map();
  for (const g of games) {
    if (!g.ownerId || g.playoff) continue;
    if (!bySeason.has(g.season)) bySeason.set(g.season, new Map());
    const m = bySeason.get(g.season);
    const s = m.get(g.ownerId) || { id: g.ownerId, wins: 0, pf: 0 };
    s.wins += g.result === 'W' ? 1 : g.result === 'T' ? 0.5 : 0;
    s.pf += g.points;
    m.set(g.ownerId, s);
  }
  for (const [season, m] of bySeason) {
    const order = [...m.values()].sort((a, b) => b.wins - a.wins || b.pf - a.pf);
    order.forEach((s, i) => finish.set(`${season}|${s.id}`, { rank: i + 1, of: order.length }));
  }

  const draftRows = picks.length ? draft.run(picks).rows : [];
  const profiles = {};

  for (const [id, mine] of byOwner) {
    const base = summary(id, mine, latest.get(id));
    const sorted = [...mine].sort(chrono);

    const seasons = [...new Set(mine.map((g) => g.season))].sort((a, b) => b - a).map((season) => {
      const gs = mine.filter((g) => g.season === season);
      const reg = gs.filter((g) => !g.playoff);
      const post = gs.filter((g) => g.playoff);
      const f = finish.get(`${season}|${id}`);
      const pf = reg.reduce((s, g) => s + g.points, 0);
      const pa = reg.reduce((s, g) => s + g.opponentPoints, 0);
      return {
        season,
        team: gs[0].team,
        record: rec(tally(reg)),
        finish: f ? `${f.rank} of ${f.of}` : '–',
        playoffs: post.length ? rec(tally(post)) : '–',
        pointsFor: r2(pf),
        pointsAgainst: r2(pa),
        avgPoints: reg.length ? r2(pf / reg.length) : 0,
      };
    });

    const margin = (g) => g.points - g.opponentPoints;
    const wins = mine.filter((g) => g.result === 'W');
    const losses = mine.filter((g) => g.result === 'L');
    const byPoints = [...mine].sort((a, b) => b.points - a.points);
    const records = {
      high: brief(byPoints[0]),
      low: brief(byPoints[byPoints.length - 1]),
      biggestWin: brief([...wins].sort((a, b) => margin(b) - margin(a))[0]),
      worstLoss: brief([...losses].sort((a, b) => margin(a) - margin(b))[0]),
      closestWin: brief([...wins].sort((a, b) => margin(a) - margin(b))[0]),
      closestLoss: brief([...losses].sort((a, b) => margin(b) - margin(a))[0]),
      streaks: streaks(mine),
    };

    const h2h = new Map();
    for (const g of sorted) {
      if (!g.opponentOwnerId) continue;
      const h = h2h.get(g.opponentOwnerId) || { ownerId: g.opponentOwnerId, games: [] };
      h.games.push(g);
      h2h.set(g.opponentOwnerId, h);
    }
    const headToHead = [...h2h.values()].map((h) => {
      const t = tally(h.games);
      return {
        ownerId: h.ownerId,
        slug: slug(h.ownerId),
        owner: nameOf(h.ownerId),
        games: h.games.length,
        record: rec(t),
        winPct: winPct(t),
        pointsFor: r2(h.games.reduce((s, g) => s + g.points, 0)),
        pointsAgainst: r2(h.games.reduce((s, g) => s + g.opponentPoints, 0)),
      };
    }).sort((a, b) => b.games - a.games || b.winPct - a.winPct);

    const myPicks = draftRows.filter((p) => p.ownerId === id);
    const positions = {};
    for (const p of myPicks) if (p.position) positions[p.position] = (positions[p.position] || 0) + 1;
    const pick = (p) => ({ season: p.season, round: p.round, pick: p.pick, player: p.player, position: p.position, points: p.points, finish: p.finish, value: p.value });
    const byValue = [...myPicks].sort((a, b) => b.value - a.value);

    profiles[slug(id)] = {
      ...base,
      teams: seasons.map((s) => ({ season: s.season, team: s.team })),
      seasonsTable: seasons,
      records,
      bestWeeks: byPoints.slice(0, 5).map(brief),
      headToHead,
      draft: {
        picks: myPicks.length,
        avgValue: myPicks.length ? r2(myPicks.reduce((s, p) => s + p.value, 0) / myPicks.length) : 0,
        positions,
        best: byValue.slice(0, 5).map(pick),
        worst: byValue.slice(-5).reverse().map(pick),
      },
    };
  }
  return profiles;
}

module.exports = { slug, ownerSummaries, buildProfiles };
