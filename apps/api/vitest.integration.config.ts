import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);
const generateJestWorkspaceMapper = require('../../scripts/generate-jest-workspace-mapper.cjs') as (
  workspaceDir: string,
) => Record<string, string>;
const apiDir = fileURLToPath(new URL('.', import.meta.url));

const aliases = Object.entries(generateJestWorkspaceMapper(apiDir)).map(([find, replacement]) => ({
  find: new RegExp(find),
  replacement: resolve(apiDir, replacement.replace('<rootDir>/', '')),
}));

export default defineConfig({
  resolve: { alias: aliases },
  test: {
    globals: true,
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 30_000,
    server: { deps: { external: ['@nestjs/throttler'] } },
  },
});
