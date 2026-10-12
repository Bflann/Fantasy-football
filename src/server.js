const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadEnv } = require('./env');
loadEnv();
const { loadGames, clearCache, getSeasons } = require('./league');
const analyses = require('./analyses');

const PUBLIC = path.join(__dirname, '..', 'public');
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
      return send(res, 200, { ...a.run(games, { limit }), seasons: getSeasons() });
    }
    if (url.pathname === '/api/refresh') { clearCache(); return send(res, 200, { ok: true }); }
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
