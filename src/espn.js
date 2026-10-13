// ESPN fantasy football API client + normalisation into a flat list of games.
const BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';

function currentSeason(now = new Date()) {
  // The NFL season starts in September; before August we're still in last year's.
  return now.getMonth() < 7 ? now.getFullYear() - 1 : now.getFullYear();
}

function seasonUrl(leagueId, year) {
  const views = 'view=mMatchup&view=mMatchupScore&view=mTeam&view=mSettings';
  return year >= 2018
    ? `${BASE}/seasons/${year}/segments/0/leagues/${leagueId}?${views}`
    : `${BASE}/leagueHistory/${leagueId}?seasonId=${year}&${views}`;
}

async function request(url, { espnS2, swid } = {}, extraHeaders = {}) {
  const headers = { Accept: 'application/json', 'User-Agent': 'fantasy-football-analyzer', ...extraHeaders };
  const clean = (v) => (v || '').replace(/\s+/g, '').replace(/^["']|["']$/g, '');
  if (clean(espnS2) && clean(swid)) headers.Cookie = `espn_s2=${clean(espnS2)}; SWID=${clean(swid)}`;
  let res;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    const c = err.cause || {};
    const e = new Error(`network error: ${c.code || c.message || err.message}`);
    e.code = 'NETWORK';
    throw e;
  }
  if (res.status === 401 || res.status === 403) {
    const e = new Error('ESPN says this league is private. Set ESPN_S2 and SWID in .env.');
    e.code = 'AUTH';
    throw e;
  }
  if (!res.ok) {
    const e = new Error(`ESPN returned ${res.status} for ${url.match(/seasons\/(\d+)|seasonId=(\d+)/)?.slice(1).find(Boolean) || url}`);
    e.code = 'NOT_FOUND';
    throw e;
  }
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data; // leagueHistory wraps in an array
}

const fetchSeason = (leagueId, year, creds) => request(seasonUrl(leagueId, year), creds);

// Draft picks plus each drafted player's season total (league scoring). Needs the modern API (2018+).
async function fetchDraft(leagueId, year, creds) {
  if (year < 2018) return null;
  const base = `${BASE}/seasons/${year}/segments/0/leagues/${leagueId}`;
  const league = await request(`${base}?view=mDraftDetail&view=mTeam`, creds);
  const picks = (league.draftDetail && league.draftDetail.picks) || [];
  if (!picks.length) return { league, players: [] };
  const filter = { players: { filterIds: { value: picks.map((p) => p.playerId) }, limit: picks.length + 20, sortPercOwned: { sortPriority: 1, sortAsc: false } } };
  const info = await request(`${base}?view=kona_player_info`, creds, { 'x-fantasy-filter': JSON.stringify(filter) });
  return { league, players: info.players || [] };
}

function teamName(t) {
  if (!t) return 'Unknown';
  return (t.name || [t.location, t.nickname].filter(Boolean).join(' ') || `Team ${t.id}`).trim();
}

// Team names and team slot ids change (and slots get reassigned to new people), but a member's id
// is their ESPN account GUID, so it is the stable key for "the same owner" across seasons.
function ownerLookup(raw) {
  const owners = new Map((raw.members || []).map((m) => [m.id, m]));
  return (t) => {
    const id = ((t && t.owners) || [])[0] || '';
    const m = owners.get(id);
    const name = m ? [m.firstName, m.lastName].filter(Boolean).join(' ') || m.displayName || '' : '';
    return { ownerId: id, owner: name };
  };
}

// Turn a raw season payload into one record per team-week.
// Each matchup yields two records (one per side) so "top scores" can be ranked simply.
function normalizeSeason(year, raw) {
  const teams = new Map((raw.teams || []).map((t) => [t.id, t]));
  const ownerOf = ownerLookup(raw);
  const out = [];
  for (const g of raw.schedule || []) {
    if (!g.home || !g.away) continue; // bye week
    if (!g.winner || g.winner === 'UNDECIDED') continue; // not played yet
    const isPlayoff = !!g.playoffTierType && g.playoffTierType !== 'NONE';
    const sides = [['home', 'away', 'HOME'], ['away', 'home', 'AWAY']];
    for (const [me, other, tag] of sides) {
      const t = teams.get(g[me].teamId);
      const o = teams.get(g[other].teamId);
      const points = g[me].totalPoints;
      const oppPoints = g[other].totalPoints;
      if (typeof points !== 'number' || points === 0 && oppPoints === 0) continue;
      out.push({
        season: year,
        week: g.matchupPeriodId,
        playoff: isPlayoff,
        team: teamName(t),
        teamId: g[me].teamId,
        ...ownerOf(t),
        points,
        opponent: teamName(o),
        opponentOwnerId: ownerOf(o).ownerId,
        opponentPoints: oppPoints,
        result: g.winner === 'TIE' ? 'T' : g.winner === tag ? 'W' : 'L',
      });
    }
  }
  return out;
}

const POSITIONS = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'D/ST' };

// One record per draft pick, with the player's full-season fantasy points under the league's scoring.
function normalizeDraft(year, { league, players }) {
  const teams = new Map((league.teams || []).map((t) => [t.id, t]));
  const ownerOf = ownerLookup(league);
  const byId = new Map(players.map((p) => [p.id, p]));
  const seasonTotal = (p) => {
    const st = ((p && p.player && p.player.stats) || []).find((x) => x.statSplitTypeId === 0 && x.statSourceId === 0 && x.seasonId === year);
    return st ? st.appliedTotal : 0;
  };
  const picks = (league.draftDetail && league.draftDetail.picks) || [];
  return picks.map((k) => {
    const p = byId.get(k.playerId);
    const t = teams.get(k.teamId);
    return {
      season: year,
      pick: k.overallPickNumber,
      round: k.roundId,
      team: teamName(t),
      teamId: k.teamId,
      ...ownerOf(t),
      player: (p && p.player && p.player.fullName) || `Player ${k.playerId}`,
      position: (p && POSITIONS[p.player.defaultPositionId]) || '',
      points: Math.round(seasonTotal(p) * 100) / 100,
      keeper: !!k.keeper,
    };
  });
}

module.exports = { currentSeason, fetchSeason, fetchDraft, normalizeSeason, normalizeDraft };
