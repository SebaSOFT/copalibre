const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');

module.exports = {
  ...base,
  displayName: 'copalibre',
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
  moduleNameMapper: {
    ...esmExtensionMapper,
    '^@copalibre/auth$': '<rootDir>/../../packages/auth/src/index.ts',
    '^@copalibre/persistence$': '<rootDir>/../../packages/persistence/src/index.ts',
  },
  // Bootstrap wiring is exercised by Compose smoke tests. Unit coverage focuses
  // on deterministic command, validation and argument contracts.
  collectCoverageFrom: [
    'src/backup.ts',
    'src/create-admin.ts',
    'src/doctor.ts',
    'src/init.ts',
    'src/product-roles.ts',
  ],
  coverageThreshold: {
    global: { lines: 90, branches: 85, functions: 90, statements: 90 },
  },
};
