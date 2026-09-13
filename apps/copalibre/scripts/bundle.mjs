#!/usr/bin/env node
// Bundles the compiled `dist/main.js` and every module it imports (workspace
// packages included) into a single CJS file, the form Node's Single
// Executable Application feature (`node --experimental-sea-config`) needs as
// its `main` entry.
import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..');
const entryPoint = join(packageRoot, 'dist', 'main.js');
const outfile = join(packageRoot, 'dist', 'bundle.cjs');

if (!existsSync(entryPoint)) {
  throw new Error(`${entryPoint} not found — run "tsc --build" first`);
}

await build({
  entryPoints: [entryPoint],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['sharp'],
  define: {
    'import.meta.url': 'import_meta_url',
  },
  banner: {
    js: 'const import_meta_url = typeof document === "undefined" ? new (require("url").URL)("file:" + __filename).href : (document.currentScript && document.currentScript.src || new URL("main.js", document.baseURI).href);',
  },
});

process.stdout.write(`Bundled to ${outfile}\n`);
