import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from './fixtures.js';

const run = promisify(execFile);
const IDS = {
  org: 'liga-mendocina',
  tournament: 'apertura-2026',
  match: 'match',
  person: 'person',
  club: 'club',
  discipline: 'football',
};

let apiServer: Server;

test.beforeAll(async ({ workerPort }) => {
  apiServer = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify([]));
  });
  await new Promise<void>((resolve) => apiServer.listen(workerPort, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
});

test('the capture tool writes a screenshot and an overflow entry for a public route', async ({
  baseURL,
  workerPort,
}) => {
  const directory = mkdtempSync(join(tmpdir(), 'design-review-'));
  try {
    const idsPath = join(directory, 'ids.json');
    writeFileSync(idsPath, JSON.stringify(IDS));

    await run('node', [
      'scripts/design-review-capture.mjs',
      '--ids',
      idsPath,
      '--out',
      directory,
      '--base-url',
      String(baseURL),
      '--route',
      'public-home',
      '--language',
      'es',
      '--width',
      '375',
      '--header',
      `x-copalibre-api-port:${workerPort}`,
    ]);

    const report = JSON.parse(readFileSync(join(directory, 'overflow-report.json'), 'utf8'));
    expect(report.entries).toHaveLength(1);
    const [entry] = report.entries;
    expect(entry).toMatchObject({ id: 'public-home', language: 'es', width: 375, httpStatus: 200 });
    expect(entry.pageOverflow).toBe(false);
    expect(existsSync(join(directory, entry.screenshot))).toBe(true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
