import { readFileSync } from 'node:fs';
import { getAsset, isSea } from 'node:sea';

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
 * Reads `apps/copalibre/package.json`: `sea.getAsset()` when running as a
 * packaged single-executable binary (`import.meta.url` isn't meaningful once
 * bundled to CJS, so `build-binary.mjs`'s SEA config embeds `package.json`
 * as an asset), otherwise `fs.readFileSync` against the real file —
 * `dist/` sits one level under `apps/copalibre/`, the same depth as `src/`,
 * so the same relative path resolves correctly from both `src/banner.ts`
 * under ts-jest and the compiled `dist/banner.js`.
 */
function readPackageManifest(): PackageManifest {
  if (isSea()) return JSON.parse(getAsset('package.json', 'utf8')) as PackageManifest;
  const packageJsonUrl = new URL('../package.json', import.meta.url);
  const raw = readFileSync(packageJsonUrl, 'utf8');
  return JSON.parse(raw) as PackageManifest;
}

/** Product self-identification printed on every invocation (task 1.1/2.1). */
export function renderBanner(): string {
  const { version, license } = readPackageManifest();
  return `${MARK}  CopaLibre v${version} · ${license}\n\n`;
}

/** The running CopaLibre version, for callers that need it outside the banner (0046). */
export function readCopalibreVersion(): string {
  return readPackageManifest().version;
}
