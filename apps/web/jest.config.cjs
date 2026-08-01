const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');

module.exports = {
  ...base,
  displayName: 'web',
  moduleNameMapper: {
    ...esmExtensionMapper,
    '^@copalibre/routing$': '<rootDir>/../../packages/routing/src/index.ts',
  },
  // The view model and the route list; the .astro templates are covered by the
  // build test, which renders them for real.
  collectCoverageFrom: ['src/lib/**/*.ts', '!src/lib/**/*.test.ts'],
  coverageThreshold: {
    global: { lines: 90, branches: 85, functions: 90, statements: 90 },
  },
};
