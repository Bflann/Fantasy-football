// Owner-vs-owner records. Owners are matched across seasons by ESPN member id (see src/owners.js).
// Returns pre-aggregated cells for every season/game-type view so the page only has to draw them.
const { slug } = require('../owners');

const r2 = (n) => Math.round(n * 100) / 100;

// "Brendan Flannagan" -> "Brendan F."; lengthens the surname part until every label is unique.
function shortNames(owners) {
  const parts = owners.map((o) => {
    const [first, ...rest] = (o.name || 'Unknown').trim().split(/\s+/);
    return { first, last: rest.join(' ') };
  });
  const make = (p, n) => (p.last ? `${p.first} ${p.last.slice(0, n)}${p.last.length > n ? '.' : ''}` : p.first);
  let n = 1;
  let labels = parts.map((p) => make(p, n));
  while (new Set(labels).size < labels.length && n < 12) {
    n++;
    labels = parts.map((p) => make(p, n));
  }
  return labels;
}

module.exports = {
  id: 'head-to-head',
  title: 'Head to head',
  description: 'Every owner’s record against every other owner. Read across a row: the box where it meets a column is that row owner’s record against the column owner.',
  run(games) {
    const latest = new Map(); // ownerId -> { season, name, team }
    for (const g of games) {
      if (!g.ownerId) continue;
      const l = latest.get(g.ownerId);
      if (!l || g.season >= l.season) latest.set(g.ownerId, { season: g.season, name: g.owner || 'Unknown', team: g.team });
    }

    const seasons = [...new Set(games.map((g) => g.season))].sort((a, b) => b - a);
    const views = {};
    const cellFor = (key, a, b) => {
      const v = (views[key] = views[key] || {});
      const row = (v[a] = v[a] || {});
      return (row[b] = row[b] || { w: 0, l: 0, t: 0, pf: 0, pa: 0 });
    };
    for (const g of games) {
      if (!g.ownerId || !g.opponentOwnerId) continue;
      const kind = g.playoff ? 'playoffs' : 'regular';
      for (const season of ['all', g.season]) {
        for (const scope of ['all', kind]) {
          const c = cellFor(`${season}:${scope}`, g.ownerId, g.opponentOwnerId);
          c[g.result.toLowerCase()]++;
          c.pf = r2(c.pf + g.points);
          c.pa = r2(c.pa + g.opponentPoints);
        }
      }
    }

    // Order owners by all-time win % so rows and columns read from strongest to weakest.
    const overall = new Map();
    for (const [id, row] of Object.entries(views['all:all'] || {})) {
      const t = Object.values(row).reduce((s, c) => ({ w: s.w + c.w, l: s.l + c.l, t: s.t + c.t }), { w: 0, l: 0, t: 0 });
      overall.set(id, (t.w + t.t / 2) / ((t.w + t.l + t.t) || 1));
    }
    const ids = [...latest.keys()].sort((a, b) => (overall.get(b) || 0) - (overall.get(a) || 0));
    const owners = ids.map((id) => ({ ownerId: id, slug: slug(id), name: latest.get(id).name, team: latest.get(id).team }));
    const labels = shortNames(owners);
    owners.forEach((o, i) => { o.short = labels[i]; });

    return {
      columns: [],
      rows: [],
      matrix: { owners, seasons, views },
      summary: '',
    };
  },
};
