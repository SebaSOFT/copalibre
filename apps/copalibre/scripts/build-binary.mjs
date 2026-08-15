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
import { existsSync } from 'node:fs';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import extractZip from 'extract-zip';
import { x as extractTar } from 'tar';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..');
const repoRoot = join(packageRoot, '..', '..');

/** Names match the release-asset naming this project settled on (0086's design.md). */
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
  const actual = createHash('sha256').update(await readFile(filePath)).digest('hex');
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
    await extractZip(archivePath, { dir: workDir });
    return join(workDir, folderName, 'node.exe');
  }
  await extractTar({ file: archivePath, cwd: workDir });
  return join(workDir, folderName, 'bin', 'node');
}

async function main() {
  const target = parseTarget();
  const bundlePath = join(packageRoot, 'dist', 'bundle.cjs');
  if (!existsSync(bundlePath)) {
    throw new Error(`${bundlePath} not found — run "yarn workspace @copalibre/copalibre run bundle" first`);
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
            'package.json': join(packageRoot, 'package.json'),
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

    const postjectArguments = [outputPath, 'NODE_SEA_BLOB', blobPath, '--sentinel-fuse', SENTINEL_FUSE];
    if (target.startsWith('macos-')) postjectArguments.push('--macho-segment-name', 'NODE_SEA');
    if (target.startsWith('windows-')) postjectArguments.push('--overwrite');
    execFileSync(join(repoRoot, 'node_modules', '.bin', 'postject'), postjectArguments, {
      stdio: 'inherit',
    });

    if (target.startsWith('macos-') && process.platform === 'darwin') {
      execFileSync('codesign', ['-s', '-', outputPath]);
    }

    process.stdout.write(`Built ${outputPath}\n`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

await main();
