const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');

module.exports = {
  ...base,
  displayName: 'object-storage',
  // Base testMatch also matches *.integration.test.ts; those run under
  // jest.integration.config.cjs (real MinIO and a real filesystem) via
  // `yarn test:integration`.
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
  moduleNameMapper: {
    ...esmExtensionMapper,
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts', '!src/test-support/**'],
  coverageThreshold: {
    global: { lines: 90, branches: 90, functions: 90, statements: 90 },
  },
};
