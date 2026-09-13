#!/usr/bin/env node
// Copies the embedded compose assets `copalibre init` writes into a fresh
// directory, plus a derived `.env.example`, into dist/assets/. Run after
// `tsc --build`, since `.env.example`'s content reuses the compiled
// `localDefaultsEnvFile()` rather than duplicating `init.ts`'s own format.
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const packageRoot = join(here, '..');
const assetsDir = join(packageRoot, 'dist', 'assets');

// `pathToFileURL`, not a raw path: on Windows, `import()` rejects a bare
// `D:\...` path outright — it isn't a supported URL scheme.
const { localDefaultsEnvFile } = await import(
  pathToFileURL(join(packageRoot, 'dist', 'init.js')).href
);

await mkdir(assetsDir, { recursive: true });
await copyFile(join(repoRoot, 'docker-compose.yml'), join(assetsDir, 'docker-compose.yml'));
await copyFile(
  join(repoRoot, 'docker-compose.module-dev.yml'),
  join(assetsDir, 'docker-compose.module-dev.yml'),
);
await copyFile(
  join(repoRoot, 'deploy', 'helm', 'copalibre', 'values.yaml'),
  join(assetsDir, 'values.yaml'),
);
await copyFile(join(repoRoot, 'deploy', 'gateway', 'Caddyfile'), join(assetsDir, 'Caddyfile'));
await writeFile(join(assetsDir, '.env.example'), localDefaultsEnvFile(), 'utf8');

process.stdout.write(`Wrote CLI assets to ${assetsDir}\n`);
