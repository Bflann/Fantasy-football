// Pre-computes every analysis into static JSON so the site can be hosted on GitHub Pages.
// Usage: LEAGUE_ID=... [ESPN_S2=... SWID=...] node scripts/build-static.js [outDir]
const fs = require('fs');
const path = require('path');
const { loadEnv } = require('../src/env');
loadEnv();
const { loadGames, loadInput, loadProfiles, loadTeamSeasons, loadMatches } = require('../src/league');
const analyses = require('../src/analyses');

(async () => {
  const out = path.resolve(process.argv[2] || 'dist');
  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(path.join(__dirname, '..', 'public'), out, { recursive: true });
  fs.mkdirSync(path.join(out, 'data'));
  const games = await loadGames();
  const write = (name, obj) => fs.writeFileSync(path.join(out, 'data', name), JSON.stringify(obj));
  write('analyses.json', analyses.list.map(({ id, title, description }) => ({ id, title, description })));
  for (const a of analyses.list) {
    const { input, seasons } = await loadInput(a);
    write(`${a.id}.json`, { ...a.run(input), seasons });
  }
  const profiles = await loadProfiles();
  fs.mkdirSync(path.join(out, 'data', 'owners'));
  for (const [id, p] of Object.entries(profiles)) fs.writeFileSync(path.join(out, 'data', 'owners', `${id}.json`), JSON.stringify(p));
  const teams = await loadTeamSeasons();
  fs.mkdirSync(path.join(out, 'data', 'teams'));
  for (const [id, p] of Object.entries(teams)) fs.writeFileSync(path.join(out, 'data', 'teams', `${id.replace('/', '-')}.json`), JSON.stringify(p));
  const matches = await loadMatches();
  fs.mkdirSync(path.join(out, 'data', 'matches'));
  for (const [id, p] of Object.entries(matches)) fs.writeFileSync(path.join(out, 'data', 'matches', `${id.replace(/\//g, '-')}.json`), JSON.stringify(p));
  console.log(`Built ${analyses.list.length} analyses, ${Object.keys(profiles).length} owner pages, ${Object.keys(teams).length} team-season pages and ${Object.keys(matches).length} match pages from ${games.length} team-weeks into ${out}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
