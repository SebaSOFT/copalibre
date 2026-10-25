const esmExtensionMapper = require('./jest.esm-mapper.cjs');

/**
 * Shared Jest preset, ES module mode. Node needs --experimental-vm-modules for
 * ESM tests; every workspace's test script passes it.
 */
module.exports = {
  testEnvironment: 'node',
  // Undici 8.12+ closes ReadableStream response bodies inside pull() via
  // queueMicrotask. Faking queueMicrotask while V8 Promise microtasks remain
  // native causes node:stream/web to re-invoke pull() in an infinite loop.
  fakeTimers: {
    doNotFake: ['queueMicrotask'],
  },
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
