import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jest } from '@jest/globals';
import {
  expectedBinaryAssetName,
  fetchReleaseMetadata,
  parseChecksumFromManifest,
  performSelfUpdate,
  resolveHostTarget,
  verifyBinaryChecksum,
  type GitHubRelease,
} from './self-update.js';

describe('self-update', () => {
  describe('resolveHostTarget', () => {
    it('maps known platform and architecture combinations correctly', () => {
      expect(resolveHostTarget('darwin', 'arm64')).toBe('macos-arm64');
      expect(resolveHostTarget('darwin', 'x64')).toBe('macos-x86_64');
      expect(resolveHostTarget('linux', 'x64')).toBe('linux-x86_64');
      expect(resolveHostTarget('linux', 'arm64')).toBe('linux-arm64');
      expect(resolveHostTarget('win32', 'x64')).toBe('windows-x86_64');
    });

    it('throws on unsupported platforms or architectures', () => {
      expect(() => resolveHostTarget('freebsd', 'x64')).toThrow(/Unsupported host platform/);
      expect(() => resolveHostTarget('linux', 'ia32')).toThrow(/Unsupported host platform/);
    });
  });

  describe('expectedBinaryAssetName', () => {
    it('appends .exe only for Windows', () => {
      expect(expectedBinaryAssetName('linux-x86_64')).toBe('copalibre-linux-x86_64');
      expect(expectedBinaryAssetName('macos-arm64')).toBe('copalibre-macos-arm64');
      expect(expectedBinaryAssetName('windows-x86_64')).toBe('copalibre-windows-x86_64.exe');
    });
  });

  describe('parseChecksumFromManifest and verifyBinaryChecksum', () => {
    const fakeData = Buffer.from('copalibre binary test payload');
    const hash = createHash('sha256').update(fakeData).digest('hex');
    const manifest = `
# Release checksums
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  empty.txt
${hash}  copalibre-linux-x86_64
${hash}  *copalibre-macos-arm64
`;

    it('extracts checksums accurately from manifest text', () => {
      expect(parseChecksumFromManifest(manifest, 'copalibre-linux-x86_64')).toBe(hash);
      expect(parseChecksumFromManifest(manifest, 'copalibre-macos-arm64')).toBe(hash);
      expect(parseChecksumFromManifest(manifest, 'nonexistent')).toBeUndefined();
    });

    it('passes verification when hash matches', () => {
      expect(() =>
        verifyBinaryChecksum(fakeData, 'copalibre-linux-x86_64', manifest),
      ).not.toThrow();
    });

    it('throws when hash does not match or entry is missing', () => {
      const corruptData = Buffer.from('corrupt');
      expect(() => verifyBinaryChecksum(corruptData, 'copalibre-linux-x86_64', manifest)).toThrow(
        /Checksum mismatch/,
      );

      expect(() =>
        verifyBinaryChecksum(fakeData, 'copalibre-windows-x86_64.exe', manifest),
      ).toThrow(/No checksum entry found/);
    });
  });

  interface MockResponse {
    readonly ok: boolean;
    readonly status?: number;
    readonly statusText?: string;
    readonly json?: () => Promise<unknown>;
    readonly text?: () => Promise<string>;
    readonly arrayBuffer?: () => Promise<ArrayBuffer>;
  }

  describe('fetchReleaseMetadata', () => {
    it('queries latest release endpoint by default', async () => {
      const mockRelease: GitHubRelease = {
        tag_name: 'v1.3.0',
        assets: [],
      };
      const mockFetch = jest.fn<() => Promise<MockResponse>>().mockResolvedValue({
        ok: true,
        json: async () => mockRelease,
      });

      const result = await fetchReleaseMetadata(
        'SebaSOFT/copalibre',
        undefined,
        mockFetch as unknown as typeof fetch,
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/SebaSOFT/copalibre/releases/latest',
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/vnd.github.v3+json',
          }),
        }),
      );
      expect(result.tag_name).toBe('v1.3.0');
    });

    it('queries tag-specific release endpoint when version is given', async () => {
      const mockRelease: GitHubRelease = {
        tag_name: 'v1.4.2',
        assets: [],
      };
      const mockFetch = jest.fn<() => Promise<MockResponse>>().mockResolvedValue({
        ok: true,
        json: async () => mockRelease,
      });

      const result = await fetchReleaseMetadata(
        'SebaSOFT/copalibre',
        '1.4.2',
        mockFetch as unknown as typeof fetch,
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/SebaSOFT/copalibre/releases/tags/v1.4.2',
        expect.anything(),
      );
      expect(result.tag_name).toBe('v1.4.2');
    });

    it('throws descriptive error on HTTP failure', async () => {
      const mockFetch = jest.fn<() => Promise<MockResponse>>().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(
        fetchReleaseMetadata('SebaSOFT/copalibre', '99.0.0', mockFetch as unknown as typeof fetch),
      ).rejects.toThrow(/Failed to query release metadata.*HTTP 404/);
    });
  });

  describe('performSelfUpdate', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'self-update-test-'));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('skips update when not running as standalone SEA binary', async () => {
      const result = await performSelfUpdate({
        isSea: () => false,
        force: false,
      });
      expect(result.updated).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.reason).toContain('running from source checkout');
    });

    it('skips update if current version is already at or above target version', async () => {
      const mockRelease: GitHubRelease = {
        tag_name: 'v1.2.6',
        assets: [],
      };
      const mockFetch = jest.fn<() => Promise<MockResponse>>().mockResolvedValue({
        ok: true,
        json: async () => mockRelease,
      });

      const result = await performSelfUpdate({
        forceStandalone: true,
        currentVersion: '1.2.6',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.updated).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.reason).toContain('already at the latest version');
    });

    it('downloads and atomically replaces binary when valid upgrade is available', async () => {
      const targetBinaryPath = join(tempDir, 'copalibre');
      await writeFile(targetBinaryPath, 'old-binary-content', { mode: 0o755 });

      const newBinaryContent = Buffer.from('brand-new-binary-bytes');
      const hash = createHash('sha256').update(newBinaryContent).digest('hex');

      const mockRelease: GitHubRelease = {
        tag_name: 'v1.3.0',
        assets: [
          {
            name: 'copalibre-linux-x86_64',
            browser_download_url: 'https://example.com/binary',
          },
          {
            name: 'SHASUMS256.txt',
            browser_download_url: 'https://example.com/shasums',
          },
        ],
      };

      const mockFetch = jest
        .fn<(url: string) => Promise<MockResponse>>()
        .mockImplementation(async (url: string) => {
          if (url.includes('/releases/')) {
            return { ok: true, json: async () => mockRelease };
          }
          if (url === 'https://example.com/binary') {
            const slice = newBinaryContent.buffer.slice(
              newBinaryContent.byteOffset,
              newBinaryContent.byteOffset + newBinaryContent.byteLength,
            );
            return {
              ok: true,
              arrayBuffer: async () => slice,
            };
          }
          if (url === 'https://example.com/shasums') {
            return {
              ok: true,
              text: async () => `${hash}  copalibre-linux-x86_64\n`,
            };
          }
          return { ok: false, status: 404 };
        });

      const result = await performSelfUpdate({
        forceStandalone: true,
        currentVersion: '1.2.1',
        currentExecPath: targetBinaryPath,
        platform: 'linux',
        arch: 'x64',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result.updated).toBe(true);
      expect(result.newVersion).toBe('1.3.0');

      const written = await readFile(targetBinaryPath, 'utf8');
      expect(written).toBe('brand-new-binary-bytes');
    });
  });
});
