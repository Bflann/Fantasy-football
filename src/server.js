const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadEnv } = require('./env');
loadEnv();
const { currentSeason, fetchSeason, normalizeSeason } = require('./espn');
const analyses = require('./analyses');

const PUBLIC = path.join(__dirname, '..', 'public');
const TTL = 10 * 60 * 1000;
let cache = null;

async function loadGames() {
  if (cache && Date.now() - cache.at < TTL) return cache.games;
  const leagueId = process.env.LEAGUE_ID;
  if (!leagueId) throw Object.assign(new Error('Set LEAGUE_ID in .env (see .env.example).'), { code: 'CONFIG' });
  const creds = { espnS2: process.env.ESPN_S2, swid: process.env.SWID };
  const last = currentSeason();
  const first = Number(process.env.START_YEAR) || last - 20;
  const games = [];
  const seasons = [];
  for (let y = last; y >= first; y--) {
    try {
      const raw = await fetchSeason(leagueId, y, creds);
      const g = normalizeSeason(y, raw);
      if (g.length) { games.push(...g); seasons.push(y); }
    } catch (e) {
      if (e.code === 'AUTH' || e.code === 'CONFIG') throw e;
      if (seasons.length || y < last - 1) break; // walked past the league's first year
    }
  }
  if (!games.length) throw Object.assign(new Error('No completed games found for that league.'), { code: 'EMPTY' });
  cache = { at: Date.now(), games, seasons };
  return games;
}

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'Content-Type': type });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/analyses') {
      return send(res, 200, analyses.list.map(({ id, title, description }) => ({ id, title, description })));
    }
    const m = url.pathname.match(/^\/api\/analyses\/([\w-]+)$/);
    if (m) {
      const a = analyses.byId(m[1]);
      if (!a) return send(res, 404, { error: 'Unknown analysis' });
      const games = await loadGames();
      const limit = Number(url.searchParams.get('limit')) || undefined;
      return send(res, 200, { ...a.run(games, { limit }), seasons: cache.seasons });
    }
    if (url.pathname === '/api/refresh') { cache = null; return send(res, 200, { ok: true }); }
    const file = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return send(res, 404, 'Not found', 'text/plain');
    }
    send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
  } catch (e) {
    send(res, e.code === 'AUTH' ? 401 : 500, { error: e.message });
  }
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  server.listen(port, () => console.log(`http://localhost:${port}`));
}
module.exports = server;
