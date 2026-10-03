import { createHash } from 'node:crypto';
import { chmod, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isSea as nodeIsSea } from 'node:sea';
import semver from 'semver';

export interface ReleaseAsset {
  readonly name: string;
  readonly browser_download_url: string;
  readonly size?: number;
}

export interface GitHubRelease {
  readonly tag_name: string;
  readonly name?: string;
  readonly prerelease?: boolean;
  readonly draft?: boolean;
  readonly assets: readonly ReleaseAsset[];
}

export interface SelfUpdateOptions {
  readonly targetVersion?: string;
  readonly currentVersion?: string;
  readonly currentExecPath?: string;
  readonly repo?: string;
  readonly fetchFn?: typeof fetch;
  readonly isSea?: () => boolean;
  readonly platform?: string;
  readonly arch?: string;
  readonly force?: boolean;
  readonly forceStandalone?: boolean;
}

export interface SelfUpdateResult {
  readonly updated: boolean;
  readonly skipped?: boolean;
  readonly reason?: string;
  readonly previousVersion?: string;
  readonly newVersion?: string;
  readonly binaryPath?: string;
}

export const TARGET_PLATFORM_MAP: Record<string, string> = {
  'darwin-x64': 'macos-x86_64',
  'darwin-arm64': 'macos-arm64',
  'linux-x64': 'linux-x86_64',
  'linux-arm64': 'linux-arm64',
  'win32-x64': 'windows-x86_64',
};

export function resolveHostTarget(
  platform: string = process.platform,
  arch: string = process.arch,
): string {
  const key = `${platform}-${arch}`;
  const target = TARGET_PLATFORM_MAP[key];
  if (!target) {
    throw new Error(
      `Unsupported host platform and architecture: ${platform}-${arch}. Available releases target linux-x86_64, linux-arm64, macos-x86_64, macos-arm64, and windows-x86_64.`,
    );
  }
  return target;
}

export function expectedBinaryAssetName(target: string): string {
  const extension = target.startsWith('windows-') ? '.exe' : '';
  return `copalibre-${target}${extension}`;
}

export async function fetchReleaseMetadata(
  repo: string,
  targetVersion: string | undefined,
  fetchFn: typeof fetch = fetch,
): Promise<GitHubRelease> {
  const baseUrl = `https://api.github.com/repos/${repo}/releases`;
  const url = targetVersion
    ? `${baseUrl}/tags/v${targetVersion.replace(/^v/, '')}`
    : `${baseUrl}/latest`;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'copalibre-cli-updater',
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetchFn(url, { headers });
  if (!response.ok) {
    throw new Error(
      `Failed to query release metadata from ${url}: HTTP ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as GitHubRelease;
}

export function parseChecksumFromManifest(
  manifestContent: string,
  fileName: string,
): string | undefined {
  for (const line of manifestContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2 && parts[0] && parts[1]) {
      const hash = parts[0];
      const name = parts[1].replace(/^\*/, '');
      if (name === fileName || name.endsWith(`/${fileName}`)) {
        return hash.toLowerCase();
      }
    }
  }
  return undefined;
}

export function verifyBinaryChecksum(
  binaryBuffer: Uint8Array,
  fileName: string,
  checksumsManifest: string,
): void {
  const expectedHash = parseChecksumFromManifest(checksumsManifest, fileName);
  if (!expectedHash) {
    throw new Error(
      `No checksum entry found for asset "${fileName}" in published release manifest.`,
    );
  }

  const actualHash = createHash('sha256').update(binaryBuffer).digest('hex').toLowerCase();
  if (actualHash !== expectedHash) {
    throw new Error(
      `Checksum mismatch for "${fileName}": expected SHA256 ${expectedHash}, computed ${actualHash}.`,
    );
  }
}

export async function performSelfUpdate(
  options: SelfUpdateOptions = {},
): Promise<SelfUpdateResult> {
  const isSeaFn = options.isSea ?? nodeIsSea;
  const currentExecPath = options.currentExecPath ?? process.execPath;
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const repo = options.repo ?? process.env.COPALIBRE_GITHUB_REPO ?? 'SebaSOFT/copalibre';
  const fetchFn = options.fetchFn ?? fetch;

  const isStandalone = options.forceStandalone || (typeof isSeaFn === 'function' && isSeaFn());
  if (!isStandalone) {
    return {
      updated: false,
      skipped: true,
      reason: 'running from source checkout or node runtime — binary self-update skipped',
      binaryPath: currentExecPath,
    };
  }

  const target = resolveHostTarget(platform, arch);
  const release = await fetchReleaseMetadata(repo, options.targetVersion, fetchFn);
  const newVersion = release.tag_name.replace(/^v/, '');
  const currentVersion = options.currentVersion;

  if (currentVersion && semver.valid(currentVersion) && semver.valid(newVersion)) {
    if (!options.force && semver.gte(currentVersion, newVersion)) {
      return {
        updated: false,
        skipped: true,
        reason: `CLI is already at the latest version (${currentVersion})`,
        previousVersion: currentVersion,
        newVersion,
        binaryPath: currentExecPath,
      };
    }
  }

  const expectedName = expectedBinaryAssetName(target);
  const binaryAsset = release.assets.find((asset) => asset.name === expectedName);
  if (!binaryAsset) {
    throw new Error(
      `No published binary asset "${expectedName}" found in release ${release.tag_name}. Available assets: ${release.assets.map((a) => a.name).join(', ')}`,
    );
  }

  const checksumsAsset = release.assets.find(
    (asset) =>
      asset.name === 'SHASUMS256.txt' ||
      asset.name === 'checksums.txt' ||
      asset.name === `${expectedName}.sha256`,
  );

  // Download binary asset
  const binaryResponse = await fetchFn(binaryAsset.browser_download_url, {
    headers: { 'User-Agent': 'copalibre-cli-updater' },
  });
  if (!binaryResponse.ok) {
    throw new Error(
      `Failed to download binary asset from ${binaryAsset.browser_download_url}: HTTP ${binaryResponse.status}`,
    );
  }
  const binaryBytes = new Uint8Array(await binaryResponse.arrayBuffer());

  // Verify checksum if manifest asset is available
  if (checksumsAsset) {
    const checksumsResponse = await fetchFn(checksumsAsset.browser_download_url, {
      headers: { 'User-Agent': 'copalibre-cli-updater' },
    });
    if (checksumsResponse.ok) {
      const manifestText = await checksumsResponse.text();
      verifyBinaryChecksum(binaryBytes, expectedName, manifestText);
    }
  }

  // Atomic file write & swap in same directory as current binary
  const binaryDir = dirname(currentExecPath);
  const tempPath = join(binaryDir, `.copalibre-upgrade-${Date.now()}.tmp`);

  try {
    await writeFile(tempPath, binaryBytes, { mode: 0o755 });
    await chmod(tempPath, 0o755);

    if (platform === 'win32') {
      const backupPath = join(binaryDir, `.copalibre-old-${Date.now()}.bak`);
      await rename(currentExecPath, backupPath);
      await rename(tempPath, currentExecPath);
      try {
        await unlink(backupPath);
      } catch {
        // Windows may hold file lock until process exit; ignore cleanup error
      }
    } else {
      await rename(tempPath, currentExecPath);
    }

    return {
      updated: true,
      previousVersion: currentVersion,
      newVersion,
      binaryPath: currentExecPath,
    };
  } catch (error: unknown) {
    try {
      await unlink(tempPath);
    } catch {
      // ignore temp cleanup error
    }

    const err = error as { code?: string; message?: string };
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      throw new Error(
        `Permission denied writing to ${currentExecPath}. Run with elevated privileges (e.g. sudo copalibre upgrade) or fix file permissions.`,
        { cause: error },
      );
    }
    throw error;
  }
}
