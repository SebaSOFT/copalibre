const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');
const generateJestWorkspaceMapper = require('../../scripts/generate-jest-workspace-mapper.cjs');

// Integration suite: real PostgreSQL via DATABASE_URL (docker-compose.dev.yml
// locally, service container in CI), mirroring packages/persistence's own
// integration setup. Object storage is faked in-process (apps/api's own
// integration suite does the same) — these tests exercise the database
// write path, not a real S3-compatible endpoint. fetch.integration.test.ts
// additionally needs real network access: it clones tags from the actual
// curated repository (github.com/SebaSOFT/copalibre-modules).
module.exports = {
  ...base,
  displayName: 'module-distribution-integration',
  moduleNameMapper: {
    ...esmExtensionMapper,
    ...generateJestWorkspaceMapper(__dirname),
  },
  testMatch: ['<rootDir>/src/**/*.integration.test.ts'],
  testTimeout: 30000,
};
