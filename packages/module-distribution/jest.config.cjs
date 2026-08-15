const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');
const generateJestWorkspaceMapper = require('../../scripts/generate-jest-workspace-mapper.cjs');

module.exports = {
  ...base,
  displayName: 'module-distribution',
  // Base testMatch also matches *.integration.test.ts; those run under
  // jest.integration.config.cjs (real Postgres, and for fetch.ts, real
  // network) via `yarn test:integration`.
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
  moduleNameMapper: {
    ...esmExtensionMapper,
    ...generateJestWorkspaceMapper(__dirname),
  },
  /**
   * import.ts, verify.ts, and fetch.ts's git I/O are DB/network
   * orchestration — like packages/persistence's repositories (see that
   * package's own collectCoverageFrom), mocking their way to a coverage
   * number would test the mock, not the behavior, so they are covered by
   * the integration suite (real PostgreSQL, and for fetch.ts, real network
   * against the curated repository) instead, a required CI job like this
   * one, rather than by this unit threshold. operations.ts is the
   * same shape: `documentFor` is a real Kysely query, mixed in the same
   * file as several pure helpers that operations.test.ts covers directly —
   * `documentFor` itself is exercised by `module-commands.integration.test.ts`
   * / `admin-modules.integration.test.ts` (via `moduleVerify`/the admin
   * verify route), not this unit threshold.
   */
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/test-support/**',
    '!src/import.ts',
    '!src/verify.ts',
    '!src/fetch.ts',
    '!src/operations.ts',
  ],
  coverageThreshold: {
    global: { lines: 90, branches: 90, functions: 90, statements: 90 },
  },
};
