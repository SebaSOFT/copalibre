import { readFileSync } from 'node:fs';

/**
 * A fixed monogram evoking the chamfered "CL" mark (`apps/web/public/
 * copalibre-logo.svg`) — hand-authored once, not generated (design.md:
 * this is a constant, not a general text-to-ASCII-art problem).
 */
const MARK = `
  ____   /
 /       |
|        |
|        |
 \\____   |____
`;

interface PackageManifest {
  readonly version: string;
  readonly license: string;
}

/**
 * Reads `apps/copalibre/package.json` at process start via `fs.readFileSync`
 * + `JSON.parse` rather than a static JSON import (design.md): no
 * `resolveJsonModule`/import-attribute change to the shared tsconfig for one
 * call site, and the same relative path resolves correctly from both
 * `src/banner.ts` under ts-jest and the compiled `dist/banner.js` at
 * runtime — `dist/` sits one level under `apps/copalibre/`, the same depth
 * as `src/`.
 */
function readPackageManifest(): PackageManifest {
  const packageJsonUrl = new URL('../package.json', import.meta.url);
  const raw = readFileSync(packageJsonUrl, 'utf8');
  return JSON.parse(raw) as PackageManifest;
}

/** Product self-identification printed on every invocation (task 1.1/2.1). */
export function renderBanner(): string {
  const { version, license } = readPackageManifest();
  return `${MARK}  CopaLibre v${version} · ${license}\n\n`;
}
