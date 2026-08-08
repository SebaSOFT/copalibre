const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');

module.exports = {
  ...base,
  displayName: 'module-distribution',
  // Base testMatch also matches *.integration.test.ts; those run under
  // jest.integration.config.cjs (real Postgres, and for fetch.ts, real
  // network) via `yarn test:integration`.
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
  moduleNameMapper: {
    ...esmExtensionMapper,
    '^@copalibre/domain$': '<rootDir>/../domain/src/index.ts',
    '^@copalibre/module-catalogue$': '<rootDir>/../module-catalogue/src/index.ts',
    '^@copalibre/object-storage$': '<rootDir>/../object-storage/src/index.ts',
    '^@copalibre/persistence$': '<rootDir>/../persistence/src/index.ts',
    '^@copalibre/rules$': '<rootDir>/../rules/src/index.ts',
  },
  /**
   * import.ts, verify.ts, and fetch.ts's git I/O are DB/network
   * orchestration — like packages/persistence's repositories (see that
   * package's own collectCoverageFrom), mocking their way to a coverage
   * number would test the mock, not the behavior, so they are covered by
   * the integration suite (real PostgreSQL, and for fetch.ts, real network
   * against the curated repository) instead, a required CI job like this
   * one, rather than by this unit threshold.
   */
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/test-support/**',
    '!src/import.ts',
    '!src/verify.ts',
    '!src/fetch.ts',
  ],
  coverageThreshold: {
    global: { lines: 90, branches: 90, functions: 90, statements: 90 },
  },
};
