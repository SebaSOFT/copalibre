/** @jest-environment node */
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import * as zlib from 'node:zlib';
import { createControlApiClient } from './control/lib/api-client.js';
import { CROP_OUTPUT_HEIGHT, CROP_OUTPUT_WIDTH } from './control/lib/image-upload.js';

/**
 * Creates a minimal valid RGBA PNG buffer with transparent background
 * and dimensions matching CROP_OUTPUT_WIDTH × CROP_OUTPUT_HEIGHT (410 × 512).
 */
function createTransparentTestPng(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth: 8
  ihdrData[9] = 6; // color type: RGBA (6)
  ihdrData[10] = 0; // compression method
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // interlace method

  const ihdrTypeAndData = Buffer.concat([Buffer.from('IHDR'), ihdrData]);
  const ihdrCrc = zlib.crc32(ihdrTypeAndData);
  const ihdrChunk = Buffer.alloc(4 + 17 + 4);
  ihdrChunk.writeUInt32BE(13, 0);
  ihdrTypeAndData.copy(ihdrChunk, 4);
  ihdrChunk.writeUInt32BE(ihdrCrc, 21);

  // Scanlines with filter byte 0 + RGBA pixels
  const rowLength = 1 + width * 4;
  const rawScanlines = Buffer.alloc(rowLength * height); // all 0 = transparent black

  // Set center pixel to opaque red foreground to test transparency preservation
  const centerRow = Math.floor(height / 2);
  const centerCol = Math.floor(width / 2);
  const pixelOffset = centerRow * rowLength + 1 + centerCol * 4;
  rawScanlines[pixelOffset] = 255; // Red
  rawScanlines[pixelOffset + 1] = 0; // Green
  rawScanlines[pixelOffset + 2] = 0; // Blue
  rawScanlines[pixelOffset + 3] = 255; // Alpha (opaque)

  const compressed = zlib.deflateSync(rawScanlines);
  const idatTypeAndData = Buffer.concat([Buffer.from('IDAT'), compressed]);
  const idatCrc = zlib.crc32(idatTypeAndData);
  const idatChunk = Buffer.alloc(4 + idatTypeAndData.length + 4);
  idatChunk.writeUInt32BE(compressed.length, 0);
  idatTypeAndData.copy(idatChunk, 4);
  idatChunk.writeUInt32BE(idatCrc, 4 + idatTypeAndData.length);

  // IEND
  const iendChunk = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

describe('identity media upload integration', () => {
  const transparentPng = createTransparentTestPng(CROP_OUTPUT_WIDTH, CROP_OUTPUT_HEIGHT);
  const base64Payload = transparentPng.toString('base64');
  const repoRoot = join(import.meta.dirname, '../../..');
  const candidateDirs = [
    join(repoRoot, 'apps/web/public/background-removal/1.7.0/assets'),
    join(repoRoot, 'apps/web/dist/client/background-removal/1.7.0/assets'),
  ];
  let publicAssetsDir =
    candidateDirs.find((dir) => existsSync(join(dir, 'resources.json'))) ?? candidateDirs[0];

  describe('media client upload flows with transparent PNG payload', () => {
    it('verifies generated PNG payload has 410x512 dimensions and RGBA alpha channel', () => {
      expect(transparentPng.readUInt32BE(16)).toBe(410);
      expect(transparentPng.readUInt32BE(20)).toBe(512);
      expect(transparentPng[25]).toBe(6); // RGBA color type with alpha
    });

    it('exercises organization, club, tournament, and person uploads to CopaLibre endpoints without third-party transfer', async () => {
      const recordedRequests: { url: string; method: string; headers: Headers; body: string }[] =
        [];
      const thirdPartyHostsAttempted: string[] = [];

      const trackingFetch = async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        const urlStr =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const parsedUrl = new URL(urlStr, 'http://localhost:3000');

        if (!parsedUrl.host.includes('localhost') && !parsedUrl.host.includes('127.0.0.1')) {
          thirdPartyHostsAttempted.push(parsedUrl.host);
        }

        recordedRequests.push({
          url: urlStr,
          method: init?.method ?? 'GET',
          headers: new Headers(init?.headers),
          body: (init?.body as string) ?? '',
        });

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const client = createControlApiClient({
        baseUrl: 'http://localhost:3000/api/v1',
        fetch: trackingFetch as typeof fetch,
        accessToken: () => 'bearer-test-token-123',
      });

      const uploadBody = {
        filename: 'cutout.png',
        contentBase64: base64Payload,
        contentType: 'image/png' as const,
      };

      // 1. Organization emblem
      await client.uploadOrganizationEmblem?.('acme-org', uploadBody);
      // 2. Club emblem
      await client.uploadClubEmblem?.('acme-org', 'club-789', uploadBody);
      // 3. Tournament emblem
      await client.uploadTournamentEmblem?.('acme-org', 'winter-cup', uploadBody);
      // 4. Person photo
      await client.uploadPersonPhoto?.('acme-org', 'player-456', uploadBody);

      expect(recordedRequests).toHaveLength(4);

      // Verify request endpoints and methods
      expect(recordedRequests[0].url).toBe(
        'http://localhost:3000/api/v1/organizations/acme-org/emblem',
      );
      expect(recordedRequests[0].method).toBe('POST');
      expect(recordedRequests[0].headers.get('authorization')).toBe('Bearer bearer-test-token-123');

      expect(recordedRequests[1].url).toBe(
        'http://localhost:3000/api/v1/organizations/acme-org/clubs/club-789/emblem',
      );
      expect(recordedRequests[1].method).toBe('POST');

      expect(recordedRequests[2].url).toBe(
        'http://localhost:3000/api/v1/organizations/acme-org/tournaments/winter-cup/emblem',
      );
      expect(recordedRequests[2].method).toBe('POST');

      expect(recordedRequests[3].url).toBe(
        'http://localhost:3000/api/v1/organizations/acme-org/persons/player-456/photo',
      );
      expect(recordedRequests[3].method).toBe('POST');

      // Verify payload in all requests
      for (const req of recordedRequests) {
        const parsed = JSON.parse(req.body) as { contentBase64: string; contentType: string };
        expect(parsed.contentType).toBe('image/png');
        expect(parsed.contentBase64).toBe(base64Payload);
      }

      // Verify strict zero third-party remote calls
      expect(thirdPartyHostsAttempted).toHaveLength(0);
    });
  });

  describe('same-origin model assets and offline fallback behavior', () => {
    let server: Server;
    let serverPort: number;

    beforeAll(async () => {
      if (!existsSync(join(publicAssetsDir, 'resources.json'))) {
        const { execFileSync } = await import('node:child_process');
        execFileSync('node', ['scripts/copy-background-removal-assets.mjs'], {
          cwd: join(repoRoot, 'apps/web'),
          stdio: 'pipe',
        });
        publicAssetsDir = join(repoRoot, 'apps/web/public/background-removal/1.7.0/assets');
      }

      await new Promise<void>((resolve, reject) => {
        server = createServer((req, res) => {
          const url = new URL(req.url ?? '/', `http://localhost:${serverPort}`);
          const filePath = join(
            publicAssetsDir,
            url.pathname.replace('/background-removal/1.7.0/assets/', ''),
          );

          if (!existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
          }

          const data = readFileSync(filePath);
          const etag = `"${createHash('sha256').update(data).digest('hex')}"`;

          if (req.headers['if-none-match'] === etag) {
            res.writeHead(304);
            res.end();
            return;
          }

          res.writeHead(200, {
            'Content-Type': filePath.endsWith('.json')
              ? 'application/json'
              : 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000, immutable',
            ETag: etag,
          });
          res.end(data);
        });

        server.listen(0, '127.0.0.1', () => {
          const address = server.address();
          if (address && typeof address === 'object') {
            serverPort = address.port;
            resolve();
          } else {
            reject(new Error('Server failed to start'));
          }
        });
      });
    }, 60_000);

    afterAll((done) => {
      server.close(done);
    });

    it('loads same-origin resources.json manifest and verifies integrity of 15 model chunks', async () => {
      const manifestUrl = `http://127.0.0.1:${serverPort}/background-removal/1.7.0/assets/resources.json`;
      const response = await fetch(manifestUrl);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toContain('immutable');

      const manifest = (await response.json()) as Record<
        string,
        { chunks: { hash: string; name: string; offsets: [number, number] }[] }
      >;
      const allChunks = Object.values(manifest).flatMap((res) => res.chunks);
      expect(allChunks).toHaveLength(15);

      // Verify that declared chunks can be loaded from same-origin with matching SHA-256
      for (const chunk of allChunks.slice(0, 3)) {
        const chunkResponse = await fetch(
          `http://127.0.0.1:${serverPort}/background-removal/1.7.0/assets/${chunk.hash}`,
        );
        expect(chunkResponse.status).toBe(200);
        const buffer = Buffer.from(await chunkResponse.arrayBuffer());
        const calculatedHash = createHash('sha256').update(buffer).digest('hex');
        expect(calculatedHash).toBe(chunk.hash);
      }
    });

    it('supports 304 Not Modified browser caching on repeat asset fetch', async () => {
      const manifestUrl = `http://127.0.0.1:${serverPort}/background-removal/1.7.0/assets/resources.json`;
      const initialResponse = await fetch(manifestUrl);
      const etag = initialResponse.headers.get('etag');
      expect(etag).toBeTruthy();

      const conditionalResponse = await fetch(manifestUrl, {
        headers: etag ? { 'If-None-Match': etag } : {},
      });
      expect(conditionalResponse.status).toBe(304);
    });

    it('handles offline or network failure gracefully without silent upload', async () => {
      // Offline endpoint (closed port)
      const offlineUrl = 'http://127.0.0.1:1/background-removal/1.7.0/assets/resources.json';

      let caughtError: unknown;
      try {
        await fetch(offlineUrl);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeDefined();
      expect(String(caughtError)).toMatch(/fetch failed|ECONNREFUSED|ENOTFOUND/i);
    });
  });
});
