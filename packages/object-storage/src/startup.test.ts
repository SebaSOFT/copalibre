import { jest } from '@jest/globals';

/**
 * The CLI bundles this package into a single executable that can load only built-in modules, so
 * importing the package must never load `sharp`, a native module. It once did, through the
 * emblem renditions, and every released binary would have failed at startup with
 * `No such built-in module: sharp`; only a change that touched the CLI ran the check that says so.
 */
describe('the object storage package', () => {
  it('does not load sharp when it is imported', async () => {
    let loaded = false;
    jest.resetModules();
    jest.unstable_mockModule('sharp', () => {
      loaded = true;
      return { default: () => undefined };
    });

    await import('./index.js');

    expect(loaded).toBe(false);
  });
});
