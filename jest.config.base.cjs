/**
 * Shared Jest preset for every apps/* and packages/* workspace (task 6.1 of
 * 0001-bootstrap-monorepo-toolchain). Workspaces extend it via require() in
 * their own jest.config.cjs.
 */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        isolatedModules: true,
        tsconfig: {
          module: 'commonjs',
          target: 'ES2023',
          esModuleInterop: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          strict: true,
        },
      },
    ],
  },
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
};
