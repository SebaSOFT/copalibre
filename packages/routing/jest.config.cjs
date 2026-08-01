const base = require('../../jest.config.base.cjs');

module.exports = {
  ...base,
  displayName: 'routing',
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/**/*.test.ts'],
  coverageThreshold: {
    global: { lines: 95, branches: 90, functions: 95, statements: 95 },
  },
};
