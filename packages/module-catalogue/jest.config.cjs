const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');

module.exports = {
  ...base,
  displayName: 'module-catalogue',
  moduleNameMapper: {
    ...esmExtensionMapper,
    '^@copalibre/domain$': '<rootDir>/../domain/src/index.ts',
  },
  collectCoverageFrom: ['src/**/*.ts'],
  coverageThreshold: {
    global: { lines: 90, branches: 90, functions: 90, statements: 90 },
  },
};
