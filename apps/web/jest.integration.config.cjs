const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');

module.exports = {
  ...base,
  displayName: 'web-integration',
  moduleNameMapper: {
    ...esmExtensionMapper,
    '^@copalibre/design-tokens$': '<rootDir>/../../packages/design-tokens/src/index.ts',
    '^@copalibre/realtime$': '<rootDir>/../../packages/realtime/src/index.ts',
    '^@copalibre/routing$': '<rootDir>/../../packages/routing/src/index.ts',
  },
  testMatch: ['<rootDir>/src/**/*.integration.test.ts'],
  testTimeout: 120_000,
};
