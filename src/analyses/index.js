// Register new analyses here. Each exports { id, title, description, run(input, opts), needs? } (needs: 'draft' for draft picks)
// and returns { columns, rows, summary? } which the front end renders generically.
const list = [require('./topWeeks'), require('./draft')];
module.exports = { list, byId: (id) => list.find((a) => a.id === id) };
