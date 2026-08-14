const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');

module.exports = {
  ...base,
  displayName: 'statistics-refold',
  // Base testMatch also matches *.integration.test.ts; those need real
  // Postgres and run under jest.integration.config.cjs.
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
  moduleNameMapper: {
    ...esmExtensionMapper,
    '^@copalibre/domain$': '<rootDir>/../domain/src/index.ts',
    '^@copalibre/tournament-engine$': '<rootDir>/../tournament-engine/src/index.ts',
    // tournament-engine's own src/standings/index.ts imports this — mapped
    // to source for the same reason tournament-engine's own jest.config.cjs
    // maps it, so this workspace's unit run doesn't depend on rules' dist/
    // being built first.
    '^@copalibre/rules$': '<rootDir>/../rules/src/index.ts',
  },
  /**
   * Only the pure resolution/aggregation cores are unit-testable — the rest is
   * a database call, proven against real PostgreSQL in the integration suite
   * (same split `packages/persistence`'s own jest.config.cjs uses, for the
   * same reason: mocking Postgres would test the mock).
   */
  collectCoverageFrom: ['src/actor-resolution.ts', 'src/merge-figures.ts', 'src/rollup.ts'],
  coverageThreshold: {
    global: { lines: 90, branches: 85, functions: 90, statements: 90 },
  },
};
