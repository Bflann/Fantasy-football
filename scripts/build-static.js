// Pre-computes every analysis into static JSON so the site can be hosted on GitHub Pages.
// Usage: LEAGUE_ID=... [ESPN_S2=... SWID=...] node scripts/build-static.js [outDir]
const fs = require('fs');
const path = require('path');
const { loadEnv } = require('../src/env');
loadEnv();
const { loadGames, getSeasons } = require('../src/league');
const analyses = require('../src/analyses');

(async () => {
  const out = path.resolve(process.argv[2] || 'dist');
  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(path.join(__dirname, '..', 'public'), out, { recursive: true });
  fs.mkdirSync(path.join(out, 'data'));
  const games = await loadGames();
  const write = (name, obj) => fs.writeFileSync(path.join(out, 'data', name), JSON.stringify(obj));
  write('analyses.json', analyses.list.map(({ id, title, description }) => ({ id, title, description })));
  for (const a of analyses.list) write(`${a.id}.json`, { ...a.run(games), seasons: getSeasons() });
  console.log(`Built ${analyses.list.length} analyses from ${games.length} team-weeks into ${out}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
