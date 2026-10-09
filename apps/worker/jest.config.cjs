const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');
const generateJestWorkspaceMapper = require('../../scripts/generate-jest-workspace-mapper.cjs');

module.exports = {
  ...base,
  displayName: 'worker',
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
  moduleNameMapper: {
    ...esmExtensionMapper,
    ...generateJestWorkspaceMapper(__dirname),
  },
  // The pure job logic. Wiring, controllers and the service loop are proven
  // against a real database in the integration suite — the same split apps/api
  // uses, for the same reason: a mock of PostgreSQL proves the mock.
  collectCoverageFrom: [
    'src/jobs/**/*.ts',
    '!src/jobs/**/*.test.ts',
    // The email layout, copy and delivery guarantee are pure and unit-tested here; the handlers that
    // resolve recipients and organizations are SQL, proven against PostgreSQL in the integration suite.
    'src/notifications/**/*.ts',
    '!src/notifications/**/*.test.ts',
    '!src/notifications/account-handlers.ts',
    '!src/notifications/lifecycle-handlers.ts',
    '!src/notifications/organization.ts',
    '!src/notifications/recipients.ts',
    // Every line of it is a database call in a transaction; the integration
    // suite runs it against real PostgreSQL, where it can actually fail.
    '!src/jobs/statistics-handler.ts',
  ],
  coverageThreshold: {
    global: { lines: 90, branches: 75, functions: 90, statements: 90 },
  },
};
