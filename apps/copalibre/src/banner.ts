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

/**
 * A larger rendering of the same mark, copied verbatim from `docs/LOGO.txt`
 * — `--version`-only (0118 design.md), never printed on every invocation the
 * way `MARK` deliberately is. Hand-copied, not read from the file at
 * runtime, so the packaged single-executable binary needs no new SEA asset.
 */
const FULL_LOGO = `

            ##############
            ###############
                      ####
      ############    ####
    ##############   ####
    ####      ####   ####
   ####       ####   ####
   ####             ####
   ####             ####
  #####             ####
  ####      #####  ####
  ####      ####   ####
 ###############   ##############
  #############   ##############
                  ####
        ##############
        #############
`;

interface PackageManifest {
  readonly version: string;
  readonly license: string;
}

export interface ReadPackageManifestDependencies {
  readonly isSea?: () => boolean;
  readonly getAsset?: (key: string, encoding: string) => string;
}

/**
 * Reads `apps/copalibre/package.json`: `sea.getAsset()` when running as a
 * packaged single-executable binary (`import.meta.url` isn't meaningful once
 * bundled to CJS, so `build-binary.mjs`'s SEA config embeds `package.json`
 * as an asset), otherwise `fs.readFileSync` against the real file —
 * `dist/` sits one level under `apps/copalibre/`, the same depth as `src/`,
 * so the same relative path resolves correctly from both `src/banner.ts`
 * under ts-jest and the compiled `dist/banner.js`. Exported (unlike
 * `renderBanner`/`readCopalibreVersion`, which stay zero-argument) so both
 * branches are directly unit-testable without mocking the `node:sea` module.
 */
export function readPackageManifest(
  dependencies: ReadPackageManifestDependencies = {},
): PackageManifest {
  const isSeaFunction = dependencies.isSea ?? isSea;
  const getAssetFunction = dependencies.getAsset ?? getAsset;
  if (isSeaFunction()) {
    return JSON.parse(getAssetFunction('package.json', 'utf8')) as PackageManifest;
  }
  const packageJsonUrl = new URL('../package.json', import.meta.url);
  const raw = readFileSync(packageJsonUrl, 'utf8');
  return JSON.parse(raw) as PackageManifest;
}

/** Product self-identification printed on every invocation (task 1.1/2.1). */
export function renderBanner(): string {
  const { version, license } = readPackageManifest();
  return `${MARK}  CopaLibre v${version} · ${license}\n\n`;
}

/** The larger mark, `--version`-only — see `FULL_LOGO`. */
export function renderFullLogo(): string {
  const { version, license } = readPackageManifest();
  return `${FULL_LOGO}  CopaLibre v${version} · ${license}\n\n`;
}

/** The running CopaLibre version, for callers that need it outside the banner. */
export function readCopalibreVersion(): string {
  return readPackageManifest().version;
}
