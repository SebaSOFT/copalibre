const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');
const generateJestWorkspaceMapper = require('../../scripts/generate-jest-workspace-mapper.cjs');

module.exports = {
  ...base,
  displayName: 'copalibre',
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
  moduleNameMapper: {
    ...esmExtensionMapper,
    ...generateJestWorkspaceMapper(__dirname),
  },
  // Bootstrap wiring is exercised by Compose smoke tests. Unit coverage focuses
  // on deterministic command, validation and argument contracts.
  //
  // `statistics-rebuild.ts` is deliberately absent: `parseStatisticsRebuildOptions`
  // is covered by its own test, but `runStatisticsRebuild` is a sequence of
  // repository calls against a real `Kysely<Database>` — the integration
  // suite (`statistics-rebuild.integration.test.ts`, real PostgreSQL) proves
  // it, the same split `apps/worker`'s `statistics-handler.ts` uses.
  collectCoverageFrom: [
    'src/backup.ts',
    'src/banner.ts',
    'src/create-admin.ts',
    'src/doctor.ts',
    'src/init.ts',
    'src/product-roles.ts',
  ],
  coverageThreshold: {
    global: { lines: 90, branches: 85, functions: 90, statements: 90 },
  },
};
