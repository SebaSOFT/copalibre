const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');

module.exports = {
  ...base,
  displayName: 'seed',
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
  moduleNameMapper: {
    ...esmExtensionMapper,
    '^@copalibre/domain$': '<rootDir>/../../packages/domain/src/index.ts',
    '^@copalibre/module-catalogue$': '<rootDir>/../../packages/module-catalogue/src/index.ts',
    '^@copalibre/persistence$': '<rootDir>/../../packages/persistence/src/index.ts',
    '^@copalibre/routing$': '<rootDir>/../../packages/routing/src/index.ts',
  },
};
