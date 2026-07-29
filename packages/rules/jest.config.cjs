const base = require('../../jest.config.base.cjs');

module.exports = {
  ...base,
  displayName: 'rules',
  moduleNameMapper: {
    '^@copalibre/domain$': '<rootDir>/../domain/src/index.ts',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/test-support/**'],
  coverageThreshold: {
    global: { lines: 90, branches: 90, functions: 90, statements: 90 },
  },
};
