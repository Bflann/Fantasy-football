// ESPN fantasy stat ids -> readable labels. Ids not listed here fall back to "Other scoring (stat N)".
const LABELS = {
  3: 'Passing yards', 4: 'Passing TD', 19: 'Passing 2-pt conversion', 20: 'Interception thrown',
  24: 'Rushing yards', 25: 'Rushing TD', 26: 'Rushing 2-pt conversion',
  42: 'Receiving yards', 43: 'Receiving TD', 44: 'Receiving 2-pt conversion', 53: 'Receptions',
  63: 'Fumble recovered for TD', 72: 'Fumble lost',
  77: 'FG made 40–49 yds', 80: 'FG made 0–39 yds', 85: 'FG missed', 86: 'Extra point made', 198: 'FG made 50+ yds',
  89: '0 points allowed', 90: '1–6 points allowed', 91: '7–13 points allowed', 92: '14–17 points allowed',
  95: 'Interception', 96: 'Fumble recovery', 97: 'Blocked kick', 98: 'Safety', 99: 'Sack',
  101: 'Kick return TD', 102: 'Punt return TD', 103: 'Interception return TD', 104: 'Fumble return TD',
};

// D/ST scoring families: one stat per bracket, so the raw value is always just 1 (hit) and not worth showing.
const POINTS_ALLOWED_BRACKETS = [123, 124, 125];
const YARDS_ALLOWED_BRACKETS = [127, 128, 129, 130, 131, 132, 133, 134, 135, 136];
const isBracket = (id) => POINTS_ALLOWED_BRACKETS.includes(id) || YARDS_ALLOWED_BRACKETS.includes(id);

const label = (id) => {
  if (LABELS[id]) return LABELS[id];
  if (POINTS_ALLOWED_BRACKETS.includes(id)) return 'Points allowed bracket';
  if (YARDS_ALLOWED_BRACKETS.includes(id)) return 'Yards allowed bracket';
  return `Other scoring (stat ${id})`;
};

module.exports = { label, isBracket };
