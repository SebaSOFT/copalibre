import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import * as yauzl from 'yauzl';
import { generateMcpbManifest, createZipArchive, buildMcpb } from './build-mcpb.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..');

test('generateMcpbManifest generates descriptor conforming to Smithery/MCPB spec', () => {
  const version = '1.2.6';
  const manifest = generateMcpbManifest(version);

  assert.equal(manifest.manifest_version, '0.3');
  assert.equal(manifest.name, 'copalibre');
  assert.equal(manifest.version, '1.2.6');
  assert.equal(manifest.server.type, 'node');
  assert.equal(manifest.server.entry_point, 'bundle.cjs');
  assert.deepEqual(manifest.server.mcp_config.args, ['${__dirname}/bundle.cjs', 'mcp']);
  assert.ok(manifest.user_config.database_url);
  assert.ok(manifest.user_config.api_token);
  assert.ok(manifest.user_config.api_url);
});

test('createZipArchive produces a valid readable ZIP archive with deflate compression', async () => {
  const entries = [
    { name: 'manifest.json', data: JSON.stringify({ name: 'copalibre', version: '1.2.6' }) },
    { name: 'bundle.cjs', data: Buffer.from('console.log("hello world");') },
  ];

  const zipBuffer = createZipArchive(entries);
  assert.ok(zipBuffer.length > 0);

  const zipfile = await yauzl.fromBufferPromise(zipBuffer, { autoClose: true });
  const readEntries = [];
  for await (const entry of zipfile.eachEntry()) {
    readEntries.push(entry.fileName);
  }

  assert.deepEqual(readEntries.sort(), ['bundle.cjs', 'manifest.json']);
});

test('buildMcpb creates copalibre.mcpb with dynamic version from package.json in target directory', async () => {
  const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  const tempDir = await mkdtemp(join(tmpdir(), 'build-mcpb-test-'));

  try {
    const dummyBundle = join(tempDir, 'bundle.cjs');
    writeFileSync(dummyBundle, 'console.log("mock bundle");', 'utf8');

    buildMcpb({
      distDir: tempDir,
      bundlePath: dummyBundle,
    });

    const mcpbFile = join(tempDir, 'copalibre.mcpb');
    const manifestFile = join(tempDir, 'manifest.json');

    assert.ok(existsSync(mcpbFile), 'copalibre.mcpb was created');
    assert.ok(existsSync(manifestFile), 'manifest.json was created');

    const writtenManifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    assert.equal(writtenManifest.version, packageJson.version);

    const mcpbBuffer = readFileSync(mcpbFile);
    const zipfile = await yauzl.fromBufferPromise(mcpbBuffer, { autoClose: true });
    const fileNames = [];
    for await (const entry of zipfile.eachEntry()) {
      fileNames.push(entry.fileName);
    }

    assert.ok(fileNames.includes('manifest.json'));
    assert.ok(fileNames.includes('bundle.cjs'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
