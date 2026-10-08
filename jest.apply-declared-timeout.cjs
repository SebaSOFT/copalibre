/* global jest */
// Applies the `testTimeout` a project declares in its own configuration.
// Jest reads `testTimeout` from the global configuration only, so under the root
// multi-project run a project's value is ignored and every test gets 5 s.
// scripts/jest-integration-projects.mjs exposes the declared value to the test environment.
const declared = globalThis.__DECLARED_TEST_TIMEOUT__;
if (typeof declared === 'number') jest.setTimeout(declared);
