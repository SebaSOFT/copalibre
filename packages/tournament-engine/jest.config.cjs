const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');

module.exports = {
  ...base,
  displayName: 'tournament-engine',
  // Base testMatch also matches *.integration.test.ts; those need real Postgres
  // and run under jest.integration.config.cjs.
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
  moduleNameMapper: {
    ...esmExtensionMapper,
    '^@copalibre/domain$': '<rootDir>/../domain/src/index.ts',
    '^@copalibre/rules$': '<rootDir>/../rules/src/index.ts',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/test-support/**',
    // Integration specs run under jest.integration.config.cjs; counting them
    // here measures a file this config deliberately never executes.
    '!src/**/*.integration.test.ts',
  ],
  coverageThreshold: { global: { lines: 90, branches: 85, functions: 90, statements: 90 } },
};
