const { buildProfiles } = require('./owners');
const { buildTeamSeasons } = require('./teamSeason');
const { currentSeason, fetchSeason, fetchDraft, fetchLineups, normalizeSeason, normalizeDraft, normalizeLineups } = require('./espn');

const TTL = 10 * 60 * 1000;
let cache = null;
let draftCache = null;
let lineupCache = null;
const clearCache = () => { cache = null; draftCache = null; lineupCache = null; };
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

// Weekly lineups for every season/week that has completed games.
async function loadLineups() {
  if (lineupCache && Date.now() - lineupCache.at < TTL) return lineupCache.records;
  const games = await loadGames();
  const creds = { espnS2: process.env.ESPN_S2, swid: process.env.SWID };
  const weeksBySeason = new Map();
  for (const g of games) {
    if (!weeksBySeason.has(g.season)) weeksBySeason.set(g.season, new Set());
    weeksBySeason.get(g.season).add(g.week);
  }
  // Only keep lineups whose started points match the official game score; multi-week playoff
  // matchups score over several periods, so a single week's roster would not add up.
  const official = new Map(games.map((g) => [`${g.season}|${g.week}|${g.team}`, g.points]));
  // Who each team drafted, so everyone else on a roster can be identified as a waiver/free-agent add.
  const picks = await loadDraft().catch(() => []);
  const draftedBy = new Map();
  for (const p of picks) {
    if (!draftedBy.has(p.season)) draftedBy.set(p.season, new Map());
    const teams = draftedBy.get(p.season);
    if (!teams.has(p.teamId)) teams.set(p.teamId, new Set());
    teams.get(p.teamId).add(p.playerId);
  }
  const records = [];
  for (const [season, weeks] of weeksBySeason) {
    const raw = await fetchLineups(process.env.LEAGUE_ID, season, creds, [...weeks].sort((a, b) => a - b));
    for (const l of normalizeLineups(season, raw, draftedBy.get(season))) {
      const pts = official.get(`${l.season}|${l.week}|${l.team}`);
      if (pts !== undefined && Math.abs(pts - l.actual) <= 0.05) records.push(l);
    }
  }
  if (!records.length) throw Object.assign(new Error('No lineup data found for that league.'), { code: 'EMPTY' });
  lineupCache = { at: Date.now(), records };
  return records;
}

// Loads whichever dataset an analysis declares (`needs: 'draft'`, default team-week games).
async function loadInput(analysis) {
  const loaders = { draft: loadDraft, lineups: loadLineups };
  const load = loaders[analysis.needs];
  const input = load ? await load() : await loadGames();
  const seasons = load ? [...new Set(input.map((r) => r.season))].sort((a, b) => b - a) : getSeasons();
  return { input, seasons };
}

// Owner profiles keyed by slug. A missing draft just leaves the draft section empty.
async function loadProfiles() {
  const games = await loadGames();
  const picks = await loadDraft().catch(() => []);
  return buildProfiles(games, picks);
}

// Team-season pages keyed "<owner slug>/<season>". Lineups and draft are optional extras.
async function loadTeamSeasons() {
  const games = await loadGames();
  const [lineups, picks] = await Promise.all([loadLineups().catch(() => []), loadDraft().catch(() => [])]);
  return buildTeamSeasons({ games, lineups, picks });
}

module.exports = { loadGames, loadDraft, loadLineups, loadInput, loadProfiles, loadTeamSeasons, clearCache, getSeasons };
