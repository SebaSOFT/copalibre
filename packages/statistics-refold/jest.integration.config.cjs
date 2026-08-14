const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');
const generateJestWorkspaceMapper = require('../../scripts/generate-jest-workspace-mapper.cjs');

// Real PostgreSQL via DATABASE_URL (docker-compose.dev.yml locally, service
// container in CI). Serial by design (--runInBand in the script) — each file
// provisions and drops its own scratch database.
module.exports = {
  ...base,
  displayName: 'statistics-refold-integration',
  moduleNameMapper: {
    ...esmExtensionMapper,
    ...generateJestWorkspaceMapper(__dirname),
  },
  testMatch: ['<rootDir>/src/**/*.integration.test.ts'],
  testTimeout: 30000,
};
