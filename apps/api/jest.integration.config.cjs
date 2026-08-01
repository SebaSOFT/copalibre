const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');

// Nest testing-module suites against a real scratch PostgreSQL, mirroring
// packages/persistence's integration setup (DATABASE_URL required).
module.exports = {
  ...base,
  displayName: 'api-integration',
  moduleNameMapper: {
    ...esmExtensionMapper,
    '^@copalibre/auth$': '<rootDir>/../../packages/auth/src/index.ts',
    '^@copalibre/domain$': '<rootDir>/../../packages/domain/src/index.ts',
    '^@copalibre/persistence$': '<rootDir>/../../packages/persistence/src/index.ts',
  },
  testMatch: ['<rootDir>/src/**/*.integration.test.ts'],
  testTimeout: 30000,
};
