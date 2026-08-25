const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');
const generateJestWorkspaceMapper = require('../../scripts/generate-jest-workspace-mapper.cjs');

module.exports = {
  ...base,
  displayName: 'copalibre-integration',
  testMatch: ['<rootDir>/src/**/*.integration.test.ts'],
  moduleNameMapper: {
    ...esmExtensionMapper,
    ...generateJestWorkspaceMapper(__dirname),
  },
  testTimeout: 30000,
};
