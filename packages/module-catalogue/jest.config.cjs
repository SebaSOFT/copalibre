const base = require('../../jest.config.base.cjs');

module.exports = {
  ...base,
  displayName: 'module-catalogue',
  collectCoverageFrom: ['src/**/*.ts'],
  coverageThreshold: {
    global: { lines: 90, branches: 90, functions: 90, statements: 90 },
  },
};
