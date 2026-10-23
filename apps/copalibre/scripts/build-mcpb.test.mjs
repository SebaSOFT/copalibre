import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import * as yauzl from 'yauzl';
import { generateMcpbManifest, createZipArchive, buildMcpb } from './build-mcpb.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..');
const mcpbPath = join(packageRoot, 'dist', 'copalibre.mcpb');
const manifestPath = join(packageRoot, 'dist', 'manifest.json');

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

test('buildMcpb creates copalibre.mcpb with dynamic version from package.json', async () => {
  const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

  buildMcpb();

  assert.ok(existsSync(mcpbPath), 'copalibre.mcpb was created');
  assert.ok(existsSync(manifestPath), 'manifest.json was created');

  const writtenManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(writtenManifest.version, packageJson.version);

  const mcpbBuffer = readFileSync(mcpbPath);
  const zipfile = await yauzl.fromBufferPromise(mcpbBuffer, { autoClose: true });
  const fileNames = [];
  for await (const entry of zipfile.eachEntry()) {
    fileNames.push(entry.fileName);
  }

  assert.ok(fileNames.includes('manifest.json'));
  assert.ok(fileNames.includes('bundle.cjs'));
});
