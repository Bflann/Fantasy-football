// Losses that hurt: lost by a hair, or lost while a better lineup from the same roster would have won.
// "Best possible" is the hindsight-optimal lineup for that week's roster (same slots, IR excluded).
const CLOSE = 5;
const r2 = (n) => Math.round(n * 100) / 100;

const swapText = (moves) =>
  moves
    .filter((m) => m.out)
    .slice(0, 3)
    .map((m) => `${m.in.player} (${m.in.points}) for ${m.out.player} (${m.out.points})`)
    .join('; ') || '–';

module.exports = {
  id: 'heartbreak',
  title: 'Heartbreak report',
  description: `Every loss that could have gone the other way: decided by under ${CLOSE} points, or lost when a different lineup from the same roster would have won. Ranked by how much the best lineup would have beaten the opponent by.`,
  needs: 'lineups',
  run(lineups, { limit } = {}) {
    const losses = lineups.filter((l) => l.result === 'L' && typeof l.opponentPoints === 'number');
    const all = [];
    for (const l of losses) {
      const margin = l.opponentPoints - l.actual;
      const regret = l.optimal - l.opponentPoints; // > 0 means the best lineup wins
      const flip = regret > 0;
      const close = margin < CLOSE;
      if (!flip && !close) continue;
      all.push({
        season: l.season,
        week: l.week,
        playoff: l.playoff,
        team: l.team,
        owner: l.owner,
        ownerId: l.ownerId,
        opponent: l.opponent,
        opponentOwnerId: l.opponentOwnerId,
        points: l.actual,
        opponentPoints: l.opponentPoints,
        margin: r2(margin),
        best: l.optimal,
        regret: r2(regret),
        kind: flip && close ? 'Both' : flip ? 'Lineup flip' : 'Lost by a hair',
        swaps: flip ? swapText(l.moves || []) : '–',
      });
    }
    all.sort((a, b) => b.regret - a.regret || a.margin - b.margin);
    const rows = all.slice(0, limit || undefined).map((r, i) => ({ rank: i + 1, ...r }));

    const flips = all.filter((r) => r.regret > 0).length;
    const hairs = all.filter((r) => r.margin < CLOSE).length;
    const worst = rows[0];
    return {
      columns: [
        { key: 'rank', label: '#', type: 'num' },
        { key: 'team', label: 'Team' },
        { key: 'season', label: 'Season', type: 'num' },
        { key: 'week', label: 'Week', type: 'num' },
        { key: 'points', label: 'Score', type: 'num' },
        { key: 'opponent', label: 'Lost to' },
        { key: 'opponentPoints', label: 'Opp. score', type: 'num' },
        { key: 'margin', label: 'Lost by', type: 'num' },
        { key: 'best', label: 'Best lineup', type: 'num' },
        { key: 'regret', label: 'Should have won by', type: 'num' },
        { key: 'kind', label: 'Type' },
        { key: 'swaps', label: 'The swaps that won it' },
      ],
      rows,
      summary: rows.length
        ? `${losses.length} losses: ${flips} could have been wins with a better lineup, ${hairs} were decided by under ${CLOSE} points. Biggest what-if: ${worst.team} (${worst.season} wk ${worst.week}) lost ${worst.points}–${worst.opponentPoints} while their best lineup scored ${worst.best}.`
        : '',
    };
  },
};
