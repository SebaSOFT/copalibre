const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');

module.exports = {
  ...base,
  displayName: 'copalibre-integration',
  testMatch: ['<rootDir>/src/**/*.integration.test.ts'],
  moduleNameMapper: {
    ...esmExtensionMapper,
    '^@copalibre/auth$': '<rootDir>/../../packages/auth/src/index.ts',
    '^@copalibre/persistence$': '<rootDir>/../../packages/persistence/src/index.ts',
    '^@copalibre/domain$': '<rootDir>/../../packages/domain/src/index.ts',
    '^@copalibre/routing$': '<rootDir>/../../packages/routing/src/index.ts',
    '^@copalibre/module-distribution$': '<rootDir>/../../packages/module-distribution/src/index.ts',
    '^@copalibre/module-catalogue$': '<rootDir>/../../packages/module-catalogue/src/index.ts',
    '^@copalibre/object-storage$': '<rootDir>/../../packages/object-storage/src/index.ts',
    '^@copalibre/rules$': '<rootDir>/../../packages/rules/src/index.ts',
    '^@copalibre/statistics-refold$': '<rootDir>/../../packages/statistics-refold/src/index.ts',
    // statistics-refold's own refold.ts imports this — mapped to source for
    // the same reason every other transitive workspace import here is.
    '^@copalibre/tournament-engine$': '<rootDir>/../../packages/tournament-engine/src/index.ts',
  },
};
