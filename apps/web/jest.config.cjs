const base = require('../../jest.config.base.cjs');
const esmExtensionMapper = require('../../jest.esm-mapper.cjs');

module.exports = {
  ...base,
  displayName: 'web',
  // jsdom for the control app's components; the public surfaces are strings.
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/jest.setup.cjs'],
  // The base preset lists only `.ts`; without `.tsx` here jest treats the
  // control app as CommonJS and tries to `require()` an ES module.
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  // The base preset compiles .ts; the control app is .tsx and needs the JSX
  // transform turned on, which is the one thing it does not inherit.
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'nodenext',
          moduleResolution: 'nodenext',
          target: 'ES2023',
          jsx: 'react-jsx',
          esModuleInterop: true,
          strict: true,
          isolatedModules: true,
        },
      },
    ],
  },
  // `.tsx` first: the shared mapper strips the extension, and jest's default
  // resolution order finds a directory or a `.js` before a sibling `.tsx`.
  moduleFileExtensions: ['tsx', 'ts', 'js', 'json'],
  moduleNameMapper: {
    ...esmExtensionMapper,
    '^@copalibre/realtime$': '<rootDir>/../../packages/realtime/src/index.ts',
    '^@copalibre/routing$': '<rootDir>/../../packages/routing/src/index.ts',
  },
  // The view model and the route list; the .astro templates are covered by the
  // build test, which renders them for real.
  collectCoverageFrom: [
    'src/lib/**/*.ts',
    'src/control/**/*.ts',
    'src/control/**/*.tsx',
    '!src/**/*.test.ts',
    '!src/**/*.test.tsx',
  ],
  coverageThreshold: {
    global: { lines: 90, branches: 85, functions: 90, statements: 90 },
  },
};
