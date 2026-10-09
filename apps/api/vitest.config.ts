import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

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
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: [...configDefaults.exclude, 'src/**/*.integration.test.ts'],
    server: { deps: { external: ['@nestjs/throttler'] } },
    coverage: {
      provider: 'v8',
      include: [
        'src/auth/**/*.ts',
        'src/policy/**/*.ts',
        'src/openapi/contract-lint.ts',
        'src/openapi/breaking-change.ts',
        'src/openapi/collect-planes.ts',
      ],
      exclude: ['src/**/*.test.ts', 'src/**/*.integration.test.ts'],
      thresholds: { lines: 90, branches: 85, functions: 90, statements: 90 },
    },
  },
});
