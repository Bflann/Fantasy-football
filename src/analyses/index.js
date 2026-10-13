// Register new analyses here. Each exports { id, title, description, run(input, opts), needs? } (needs: 'draft' | 'lineups' to load those records instead of team-week games)
// and returns { columns, rows, summary? } which the front end renders generically.
const list = [require('./topWeeks'), require('./standings'), require('./headToHead'), require('./draft'), require('./consistency'), require('./efficiency'), require('./parallelUniverse'), require('./heartbreak'), require('./seasonArc'), require('./fingerprint'), require('./clutch'), require('./hotHand')];
module.exports = { list, byId: (id) => list.find((a) => a.id === id) };
