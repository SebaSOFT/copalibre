const base = require('../../jest.config.base.cjs');

module.exports = {
  ...base,
  displayName: 'auth',
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/**/*.test.ts'],
  coverageThreshold: {
    global: { lines: 90, branches: 85, functions: 90, statements: 90 },
  },
};
