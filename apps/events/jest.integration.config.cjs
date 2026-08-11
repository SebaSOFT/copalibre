const base = require('./jest.config.cjs');

module.exports = {
  ...base,
  displayName: 'events-integration',
  testPathIgnorePatterns: ['/node_modules/'],
  testMatch: ['<rootDir>/src/**/*.integration.test.ts'],
  collectCoverageFrom: undefined,
  coverageThreshold: undefined,
  testTimeout: 60000,
};
