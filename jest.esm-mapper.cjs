/**
 * ESM source carries explicit `.js` specifiers because Node's resolver requires
 * them, but Jest resolves the `.ts` sources. Per-workspace configs spread this
 * in so they extend the mapping instead of replacing it.
 */
module.exports = {
  '^(\\.{1,2}/.*)\\.js$': '$1',
};
