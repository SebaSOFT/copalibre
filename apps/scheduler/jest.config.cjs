const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');
const generateJestWorkspaceMapper = require('../../scripts/generate-jest-workspace-mapper.cjs');

module.exports = {
  ...base,
  displayName: 'scheduler',
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
  moduleNameMapper: {
    ...esmExtensionMapper,
    ...generateJestWorkspaceMapper(__dirname),
  },
  // The lease arithmetic, which is the dangerous part. The service loop and the
  // controller are proven against a real database in the integration suite.
  collectCoverageFrom: ['src/lease-state.ts'],
  coverageThreshold: {
    global: { lines: 95, branches: 90, functions: 95, statements: 95 },
  },
};
