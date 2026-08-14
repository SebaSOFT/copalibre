#!/usr/bin/env node
// Copies the embedded compose assets `copalibre init` writes into a fresh
// directory, plus a derived `.env.example`, into dist/assets/ (0084). Run
// after `tsc --build`, since `.env.example`'s content reuses the compiled
// `localDefaultsEnvFile()` rather than duplicating `init.ts`'s own format.
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const packageRoot = join(here, '..');
const assetsDir = join(packageRoot, 'dist', 'assets');

const { localDefaultsEnvFile } = await import(join(packageRoot, 'dist', 'init.js'));

await mkdir(assetsDir, { recursive: true });
await copyFile(join(repoRoot, 'docker-compose.yml'), join(assetsDir, 'docker-compose.yml'));
await copyFile(
  join(repoRoot, 'docker-compose.module-dev.yml'),
  join(assetsDir, 'docker-compose.module-dev.yml'),
);
await writeFile(join(assetsDir, '.env.example'), localDefaultsEnvFile(), 'utf8');

process.stdout.write(`Wrote CLI assets to ${assetsDir}\n`);
