#!/usr/bin/env node
// Produces a standalone `copalibre` binary for one platform via Node's
// Single Executable Application feature: takes the bundle `bundle.mjs`
// produces, generates a SEA blob embedding the compose assets
// `build-assets.mjs` writes to `dist/assets/`, and injects it (via
// `postject`) into a real Node binary for the target platform — the host's
// own `process.execPath` when the target matches it, otherwise a binary
// downloaded from nodejs.org and checksum-verified against its published
// SHASUMS256.txt. postject patches the target binary's bytes without
// executing it, so this works for every target from a single host —
// including cross-arch and cross-OS.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, relative, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as yauzl from 'yauzl';
import { x as extractTar } from 'tar';

/** Unix file-type bits (`S_IFMT`) packed into the upper 16 bits of a ZIP entry's `externalFileAttributes`. */
const UNIX_FILE_TYPE_MASK = 0o170000;
const UNIX_FILE_TYPE_SYMLINK = 0o120000;
const UNIX_FILE_TYPE_REGULAR = 0o100000;
const UNIX_FILE_TYPE_DIRECTORY = 0o040000;

/**
 * Extracts a ZIP archive into `destinationDir`, rejecting anything that could
 * write outside it (GHSA-7pqw-9j4j-h8q3: `extract-zip` follows symlink
 * archive entries with no way to disable it, and has no upstream patch).
 * Every entry's destination path is resolved and verified to stay inside
 * `destinationDir` before anything is written; a symlink entry, an absolute
 * path, a path that escapes the destination, or an entry that is neither a
 * plain file nor a directory fails the whole extraction rather than being
 * skipped silently.
 */
export async function extractZipSafely(archivePath, destinationDir) {
  const zipfile = await yauzl.openPromise(archivePath, { autoClose: true });
  try {
    for await (const entry of zipfile.eachEntry()) {
      const unixMode = (entry.externalFileAttributes >>> 16) & UNIX_FILE_TYPE_MASK;
      const isDirectoryEntry = entry.fileName.endsWith('/');

      if (unixMode === UNIX_FILE_TYPE_SYMLINK) {
        throw new Error(`Refusing to extract symlink entry: ${entry.fileName}`);
      }
      if (!isDirectoryEntry && unixMode !== 0 && unixMode !== UNIX_FILE_TYPE_REGULAR) {
        throw new Error(`Refusing to extract unsupported entry type: ${entry.fileName}`);
      }
      if (unixMode === UNIX_FILE_TYPE_DIRECTORY && !isDirectoryEntry) {
        throw new Error(`Refusing to extract unsupported entry type: ${entry.fileName}`);
      }

      const destinationPath = join(destinationDir, normalize(entry.fileName));
      const relativePath = relative(destinationDir, destinationPath);
      if (relativePath.startsWith('..') || relativePath.split(sep).includes('..')) {
        throw new Error(`Refusing to extract entry outside destination: ${entry.fileName}`);
      }

      if (isDirectoryEntry) {
        await mkdir(destinationPath, { recursive: true });
        continue;
      }

      await mkdir(dirname(destinationPath), { recursive: true });
      const readStream = await zipfile.openReadStreamPromise(entry);
      await pipeline(readStream, createWriteStream(destinationPath));
    }
  } finally {
    zipfile.close();
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..');
const repoRoot = join(packageRoot, '..', '..');

/** Names match this project's release-asset naming. */
export const TARGETS = {
  'linux-x86_64': { nodePlatform: 'linux', nodeArch: 'x64', archiveExt: 'tar.gz' },
  'linux-arm64': { nodePlatform: 'linux', nodeArch: 'arm64', archiveExt: 'tar.gz' },
  'macos-x86_64': { nodePlatform: 'darwin', nodeArch: 'x64', archiveExt: 'tar.gz' },
  'macos-arm64': { nodePlatform: 'darwin', nodeArch: 'arm64', archiveExt: 'tar.gz' },
  'windows-x86_64': { nodePlatform: 'win', nodeArch: 'x64', archiveExt: 'zip' },
};

const SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

function parseTarget() {
  const flagIndex = process.argv.indexOf('--target');
  const target = flagIndex === -1 ? undefined : process.argv[flagIndex + 1];
  if (!target || !(target in TARGETS)) {
    throw new Error(`--target is required, one of: ${Object.keys(TARGETS).join(', ')}`);
  }
  return target;
}

function isHostTarget(target) {
  const hostNodePlatform = { darwin: 'darwin', linux: 'linux', win32: 'win' }[process.platform];
  const { nodePlatform, nodeArch } = TARGETS[target];
  return hostNodePlatform === nodePlatform && process.arch === nodeArch;
}

async function downloadFile(url, destination) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function verifyChecksum(filePath, fileName, checksumsUrl) {
  const response = await fetch(checksumsUrl);
  if (!response.ok) {
    throw new Error(`Failed to download checksums from ${checksumsUrl}: HTTP ${response.status}`);
  }
  const checksums = await response.text();
  const line = checksums.split('\n').find((entry) => entry.trim().endsWith(fileName));
  if (!line) throw new Error(`No checksum entry for ${fileName} in ${checksumsUrl}`);
  const expected = line.trim().split(/\s+/)[0];
  const actual = createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${fileName}: expected ${expected}, got ${actual}`);
  }
}

/** The host's own binary when it matches, otherwise a checksum-verified download from nodejs.org. */
async function nodeBinaryForTarget(target, workDir) {
  if (isHostTarget(target)) return process.execPath;

  const { nodePlatform, nodeArch, archiveExt } = TARGETS[target];
  const version = process.version;
  const folderName = `node-${version}-${nodePlatform}-${nodeArch}`;
  const archiveName = `${folderName}.${archiveExt}`;
  const baseUrl = `https://nodejs.org/dist/${version}`;

  const archivePath = join(workDir, archiveName);
  await downloadFile(`${baseUrl}/${archiveName}`, archivePath);
  await verifyChecksum(archivePath, archiveName, `${baseUrl}/SHASUMS256.txt`);

  if (archiveExt === 'zip') {
    // The archive is checksum-verified above against nodejs.org's own
    // published SHASUMS256.txt before this ever runs; `extractZipSafely`
    // additionally refuses any entry that would write outside `workDir` or
    // that is a symlink (GHSA-7pqw-9j4j-h8q3), which the download's
    // integrity alone does not guarantee.
    await extractZipSafely(archivePath, workDir);
    return join(workDir, folderName, 'node.exe');
  }
  await extractTar({ file: archivePath, cwd: workDir });
  return join(workDir, folderName, 'bin', 'node');
}

async function main() {
  const target = parseTarget();
  const bundlePath = join(packageRoot, 'dist', 'bundle.cjs');
  if (!existsSync(bundlePath)) {
    throw new Error(
      `${bundlePath} not found — run "yarn workspace @copalibre/copalibre run bundle" first`,
    );
  }

  const workDir = await mkdtemp(join(tmpdir(), 'copalibre-build-binary-'));
  try {
    const assetsDir = join(packageRoot, 'dist', 'assets');
    const blobPath = join(workDir, 'sea-prep.blob');
    const seaConfigPath = join(workDir, 'sea-config.json');
    await writeFile(
      seaConfigPath,
      JSON.stringify(
        {
          main: bundlePath,
          output: blobPath,
          disableExperimentalSEAWarning: true,
          assets: {
            'docker-compose.yml': join(assetsDir, 'docker-compose.yml'),
            'docker-compose.module-dev.yml': join(assetsDir, 'docker-compose.module-dev.yml'),
            'values.yaml': join(assetsDir, 'values.yaml'),
            Caddyfile: join(assetsDir, 'Caddyfile'),
            'package.json': join(packageRoot, 'package.json'),
            'logo.txt': join(repoRoot, 'docs', 'LOGO.txt'),
          },
        },
        null,
        2,
      ),
    );
    execFileSync(process.execPath, ['--experimental-sea-config', seaConfigPath], {
      stdio: 'inherit',
    });

    const nodeBinary = await nodeBinaryForTarget(target, workDir);
    const outputDir = join(packageRoot, 'dist', 'binaries');
    await mkdir(outputDir, { recursive: true });
    const outputExtension = target === 'windows-x86_64' ? '.exe' : '';
    const outputPath = join(outputDir, `copalibre-${target}${outputExtension}`);
    await cp(nodeBinary, outputPath);
    await chmod(outputPath, 0o755);

    if (target.startsWith('macos-') && process.platform === 'darwin') {
      execFileSync('codesign', ['--remove-signature', outputPath]);
    }

    const postjectArguments = [
      outputPath,
      'NODE_SEA_BLOB',
      blobPath,
      '--sentinel-fuse',
      SENTINEL_FUSE,
    ];
    if (target.startsWith('macos-')) postjectArguments.push('--macho-segment-name', 'NODE_SEA');
    if (target.startsWith('windows-')) postjectArguments.push('--overwrite');
    // Runs postject's real entry point via `node`, not the package manager's
    // generated `.bin/postject` shim — that shim's file extension (`.cmd` on
    // Windows, none on POSIX) differs per platform, so spawning it directly
    // by a fixed path isn't portable.
    const postjectCli = join(repoRoot, 'node_modules', 'postject', 'dist', 'cli.js');
    execFileSync(process.execPath, [postjectCli, ...postjectArguments], { stdio: 'inherit' });

    if (target.startsWith('macos-') && process.platform === 'darwin') {
      execFileSync('codesign', ['-s', '-', outputPath]);
    }

    process.stdout.write(`Built ${outputPath}\n`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

// A plain `file://${process.argv[1]}` comparison fails on Windows: a Windows
// path uses `\` separators and no leading slash before the drive letter, so
// it never matches `import.meta.url`'s properly encoded `file:///D:/...`
// form — the entrypoint check would silently skip `main()` on every Windows
// run, producing no binary and no error.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
