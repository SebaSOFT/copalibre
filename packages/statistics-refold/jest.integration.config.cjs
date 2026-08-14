const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');

// Real PostgreSQL via DATABASE_URL (docker-compose.dev.yml locally, service
// container in CI). Serial by design (--runInBand in the script) — each file
// provisions and drops its own scratch database.
module.exports = {
  ...base,
  displayName: 'statistics-refold-integration',
  moduleNameMapper: {
    ...esmExtensionMapper,
    '^@copalibre/domain$': '<rootDir>/../domain/src/index.ts',
    '^@copalibre/routing$': '<rootDir>/../routing/src/index.ts',
    '^@copalibre/rules$': '<rootDir>/../rules/src/index.ts',
    '^@copalibre/persistence$': '<rootDir>/../persistence/src/index.ts',
    '^@copalibre/tournament-engine$': '<rootDir>/../tournament-engine/src/index.ts',
  },
  testMatch: ['<rootDir>/src/**/*.integration.test.ts'],
  testTimeout: 30000,
};
