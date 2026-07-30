const base = require('../../jest.config.base.cjs');

module.exports = {
  ...base,
  displayName: 'persistence',
  // Base testMatch also matches *.integration.test.ts; those run under
  // jest.integration.config.cjs (real Postgres) via `yarn test:integration`.
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
  moduleNameMapper: {
    '^@copalibre/domain$': '<rootDir>/../domain/src/index.ts',
  },
  /**
   * Unit coverage is scoped to the modules that are meaningfully unit-testable:
   * row-to-domain mapping, identifier generation, config parsing, and errors.
   *
   * Repositories, the transaction boundary, the audit/outbox writers, and the
   * migrations are SQL. Mocking a database to reach a coverage number would
   * test the mock, not the behavior, so they are covered by the integration
   * suite (`*.integration.test.ts`, real PostgreSQL) — a required CI job, so a
   * regression there fails the pull request exactly like a unit failure.
   */
  collectCoverageFrom: ['src/mapping.ts', 'src/ids.ts', 'src/errors.ts', 'src/database.ts'],
  coverageThreshold: {
    global: { lines: 90, branches: 85, functions: 90, statements: 90 },
  },
};
