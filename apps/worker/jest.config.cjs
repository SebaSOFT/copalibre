const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');

module.exports = {
  ...base,
  displayName: 'worker',
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
  moduleNameMapper: {
    ...esmExtensionMapper,
    '^@copalibre/domain$': '<rootDir>/../../packages/domain/src/index.ts',
    '^@copalibre/routing$': '<rootDir>/../../packages/routing/src/index.ts',
    '^@copalibre/persistence$': '<rootDir>/../../packages/persistence/src/index.ts',
    '^@copalibre/tournament-engine$': '<rootDir>/../../packages/tournament-engine/src/index.ts',
  },
  // The pure job logic. Wiring, controllers and the service loop are proven
  // against a real database in the integration suite — the same split apps/api
  // uses, for the same reason: a mock of PostgreSQL proves the mock.
  collectCoverageFrom: [
    'src/jobs/**/*.ts',
    '!src/jobs/**/*.test.ts',
    // Every line of it is a database call in a transaction; the integration
    // suite runs it against real PostgreSQL, where it can actually fail.
    '!src/jobs/statistics-handler.ts',
  ],
  coverageThreshold: {
    global: { lines: 90, branches: 75, functions: 90, statements: 90 },
  },
};
