import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const PROJECT_CONFIG = 'jest.integration.config.cjs';
const APPLY_TIMEOUT = 'jest.apply-declared-timeout.cjs';

/**
 * Jest only honours `testTimeout` from the global configuration, so a timeout a workspace
 * declares in its own `jest.integration.config.cjs` is silently dropped when the root config
 * runs every workspace together. Loads each workspace's configuration and carries its declared
 * timeout into the test environment, where a setup file applies it.
 */
export function integrationProjects(root) {
  const require = createRequire(import.meta.url);
  return ['apps', 'packages'].flatMap((group) => {
    const groupDirectory = path.join(root, group);
    if (!existsSync(groupDirectory)) return [];
    return readdirSync(groupDirectory)
      .sort()
      .map((name) => path.join(groupDirectory, name))
      .filter((directory) => existsSync(path.join(directory, PROJECT_CONFIG)))
      .map((directory) => {
        const config = require(path.join(directory, PROJECT_CONFIG));
        const { testTimeout, ...project } = config;
        return {
          ...project,
          rootDir: directory,
          setupFilesAfterEnv: [
            ...(project.setupFilesAfterEnv ?? []),
            path.join(root, APPLY_TIMEOUT),
          ],
          globals: { ...project.globals, __DECLARED_TEST_TIMEOUT__: testTimeout },
        };
      });
  });
}
