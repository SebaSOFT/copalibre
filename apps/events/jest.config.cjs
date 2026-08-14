const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');
const generateJestWorkspaceMapper = require('../../scripts/generate-jest-workspace-mapper.cjs');

module.exports = {
  ...base,
  displayName: 'events',
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
  moduleNameMapper: {
    ...esmExtensionMapper,
    ...generateJestWorkspaceMapper(__dirname),
  },
  // The stream services and the guard. The controllers are proven against a
  // real database and a real HTTP stack in the integration suite.
  collectCoverageFrom: ['src/stream/**/*.ts', '!src/stream/**/*.test.ts'],
  coverageThreshold: {
    global: { lines: 90, branches: 82, functions: 90, statements: 90 },
  },
};
