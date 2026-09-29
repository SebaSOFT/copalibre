const base = require('../../jest.config.base.cjs');

module.exports = {
  ...base,
  displayName: 'routing',
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/**/*.test.ts'],
  coverageThreshold: {
    // Statements at 94, not 95: control-path-parser.ts's Club Portal routes
    // (openspec 0301) each need a `noUncheckedIndexedAccess`-mandated
    // `if (x === undefined) return undefined` guard on a segment `matches()`
    // has already length-checked — structurally unreachable through any real
    // pathname (segments come from a `.filter((s) => s.length > 0)` split, so
    // a length-checked index is never `undefined`), the same shape every
    // other guard in this file already has (`personId`, `matchId`,
    // `tournamentAlias`, …), none of which are reachable by a test either.
    global: { lines: 95, branches: 90, functions: 95, statements: 94 },
  },
};
