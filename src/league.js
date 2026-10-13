const { currentSeason, fetchSeason, fetchDraft, normalizeSeason, normalizeDraft } = require('./espn');

const TTL = 10 * 60 * 1000;
let cache = null;
let draftCache = null;
const clearCache = () => { cache = null; draftCache = null; };
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
  const notes = [];
  for (let y = last; y >= first; y--) {
    try {
      const raw = await fetchSeason(leagueId, y, creds);
      const g = normalizeSeason(y, raw);
      notes.push(`${y}: ${g.length} completed team-weeks`);
      if (g.length) { games.push(...g); seasons.push(y); }
    } catch (e) {
      notes.push(`${y}: ${e.message}`);
      if (e.code === 'AUTH' || e.code === 'CONFIG') throw e;
      if (seasons.length || y < last - 1) break; // walked past the league's first year
    }
  }
  if (!games.length) throw Object.assign(new Error(`No completed games found for that league.\n${notes.join('\n')}`), { code: 'EMPTY' });
  cache = { at: Date.now(), games, seasons };
  return games;
}

// Draft picks for every season that has games (the seasons loadGames discovered).
async function loadDraft() {
  if (draftCache && Date.now() - draftCache.at < TTL) return draftCache.picks;
  await loadGames();
  const creds = { espnS2: process.env.ESPN_S2, swid: process.env.SWID };
  const picks = [];
  for (const y of cache.seasons) {
    const raw = await fetchDraft(process.env.LEAGUE_ID, y, creds);
    if (raw) picks.push(...normalizeDraft(y, raw));
  }
  if (!picks.length) throw Object.assign(new Error('No draft data found for that league.'), { code: 'EMPTY' });
  draftCache = { at: Date.now(), picks };
  return picks;
}

// Loads whichever dataset an analysis declares (`needs: 'draft'`, default team-week games).
async function loadInput(analysis) {
  const draft = analysis.needs === 'draft';
  const input = draft ? await loadDraft() : await loadGames();
  const seasons = draft ? [...new Set(input.map((r) => r.season))].sort((a, b) => b - a) : getSeasons();
  return { input, seasons };
}

module.exports = { loadGames, loadDraft, loadInput, clearCache, getSeasons };
