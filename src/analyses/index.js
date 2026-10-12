// Register new analyses here. Each exports { id, title, description, run(games, opts) }
// and returns { columns, rows, summary? } which the front end renders generically.
const list = [require('./topWeeks')];
module.exports = { list, byId: (id) => list.find((a) => a.id === id) };
