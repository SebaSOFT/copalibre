const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');

module.exports = {
  ...base,
  displayName: 'tournament-engine-integration',
  moduleNameMapper: {
    ...esmExtensionMapper,
    '^@copalibre/domain$': '<rootDir>/../domain/src/index.ts',
    '^@copalibre/rules$': '<rootDir>/../rules/src/index.ts',
    '^@copalibre/routing$': '<rootDir>/../../packages/routing/src/index.ts',
    '^@copalibre/persistence$': '<rootDir>/../persistence/src/index.ts',
  },
  testMatch: ['<rootDir>/src/**/*.integration.test.ts'],
  testTimeout: 30000,
};
