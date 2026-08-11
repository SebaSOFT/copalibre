const base = require('../../jest.config.base.cjs');

module.exports = {
  ...base,
  displayName: 'design-tokens',
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/bin/**', '!src/**/*.test.ts'],
  coverageThreshold: {
    global: { lines: 95, branches: 85, functions: 95, statements: 95 },
  },
};
