// ESPN fantasy football API client + normalisation into a flat list of games.
const BASE = 'https://lksv3.fantasy.espn.com/apis/v3/games/ffl';

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

async function fetchSeason(leagueId, year, { espnS2, swid } = {}) {
  const headers = { Accept: 'application/json', 'User-Agent': 'fantasy-football-analyzer' };
  if (espnS2 && swid) headers.Cookie = `espn_s2=${espnS2}; SWID=${swid}`;
  const res = await fetch(seasonUrl(leagueId, year), { headers });
  if (res.status === 401 || res.status === 403) {
    const e = new Error('ESPN says this league is private. Set ESPN_S2 and SWID in .env.');
    e.code = 'AUTH';
    throw e;
  }
  if (!res.ok) {
    const e = new Error(`ESPN returned ${res.status} for ${year}`);
    e.code = 'NOT_FOUND';
    throw e;
  }
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data; // leagueHistory wraps in an array
}

function teamName(t) {
  if (!t) return 'Unknown';
  return (t.name || [t.location, t.nickname].filter(Boolean).join(' ') || `Team ${t.id}`).trim();
}

// Turn a raw season payload into one record per team-week.
// Each matchup yields two records (one per side) so "top scores" can be ranked simply.
function normalizeSeason(year, raw) {
  const teams = new Map((raw.teams || []).map((t) => [t.id, t]));
  const owners = new Map((raw.members || []).map((m) => [m.id, m]));
  const ownerOf = (t) => {
    const m = owners.get((t.owners || [])[0]);
    return m ? [m.firstName, m.lastName].filter(Boolean).join(' ') : '';
  };
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
        owner: t ? ownerOf(t) : '',
        points,
        opponent: teamName(o),
        opponentPoints: oppPoints,
        result: g.winner === 'TIE' ? 'T' : g.winner === tag ? 'W' : 'L',
      });
    }
  }
  return out;
}

module.exports = { currentSeason, fetchSeason, normalizeSeason };
