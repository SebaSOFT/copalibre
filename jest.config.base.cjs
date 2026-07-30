const esmExtensionMapper = require('./jest.esm-mapper.cjs');

/**
 * Shared Jest preset, ES module mode. Node needs --experimental-vm-modules for
 * ESM tests; every workspace's test script passes it (see 0006-esm-module-migration).
 */
module.exports = {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { ...esmExtensionMapper },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'nodenext',
          moduleResolution: 'nodenext',
          target: 'ES2023',
          esModuleInterop: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          strict: true,
          isolatedModules: true,
        },
      },
    ],
  },
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
};
