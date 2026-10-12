const { currentSeason, fetchSeason, normalizeSeason } = require('./espn');

const TTL = 10 * 60 * 1000;
let cache = null;
const clearCache = () => { cache = null; };
const getSeasons = () => cache && cache.seasons;

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

module.exports = { loadGames, clearCache, getSeasons };
