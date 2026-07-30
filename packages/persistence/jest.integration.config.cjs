const base = require('../../jest.config.base.cjs');

// Integration suite: real PostgreSQL via DATABASE_URL (docker-compose.dev.yml
// locally, service container in CI). Serial by design (--runInBand in the
// script) — each file provisions and drops its own scratch database.
module.exports = {
  ...base,
  displayName: 'persistence-integration',
  moduleNameMapper: {
    '^@copalibre/domain$': '<rootDir>/../domain/src/index.ts',
  },
  testMatch: ['<rootDir>/src/**/*.integration.test.ts'],
  testTimeout: 30000,
};
