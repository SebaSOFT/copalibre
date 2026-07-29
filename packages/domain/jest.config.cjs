const base = require('../../jest.config.base.cjs');

module.exports = {
  ...base,
  displayName: 'domain',
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/test-support/**'],
  // No repo-wide coverage gate exists yet (established here first, task 6.7 of
  // 0002-domain-model-core); later phases align or supersede it.
  coverageThreshold: {
    global: { lines: 90, branches: 90, functions: 90, statements: 90 },
  },
};
