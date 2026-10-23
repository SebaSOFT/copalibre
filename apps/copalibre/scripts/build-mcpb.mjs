#!/usr/bin/env node
// Packages the copalibre MCP server into an MCPB bundle (.mcpb, ZIP format)
// for distribution on Smithery and client desktop tools. Dynamically resolves
// the version from apps/copalibre/package.json to guarantee manifest version parity.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..');
const packageJsonPath = join(packageRoot, 'package.json');
const distDir = join(packageRoot, 'dist');
const bundlePath = join(distDir, 'bundle.cjs');
const mcpbPath = join(distDir, 'copalibre.mcpb');
const manifestPath = join(distDir, 'manifest.json');

export function generateMcpbManifest(version) {
  return {
    manifest_version: '0.3',
    name: 'copalibre',
    display_name: 'CopaLibre',
    version,
    description:
      'Self-hosted tournament platform for sports and esports: drive installations, author and validate discipline modules, rebuild folded statistics, and manage tournaments via local stdio.',
    author: {
      name: 'SebaSOFT',
      url: 'https://github.com/SebaSOFT/copalibre',
    },
    server: {
      type: 'node',
      entry_point: 'bundle.cjs',
      mcp_config: {
        command: 'node',
        args: ['${__dirname}/bundle.cjs', 'mcp'],
        env: {
          DATABASE_URL: '${user_config.database_url}',
          COPALIBRE_MCP_TOKEN: '${user_config.api_token}',
          COPALIBRE_API_URL: '${user_config.api_url}',
        },
      },
    },
    user_config: {
      database_url: {
        type: 'string',
        title: 'PostgreSQL Database URL',
        description:
          'Connection string for installation actions (e.g. postgres://copalibre:password@localhost:5432/copalibre)',
        required: false,
      },
      api_token: {
        type: 'string',
        title: 'API Bearer Token',
        description:
          'Bearer token under existing OIDC/JWT contract for tournament operational tools',
        sensitive: true,
        required: false,
      },
      api_url: {
        type: 'string',
        title: 'CopaLibre API URL',
        description: 'Base URL of running CopaLibre API instance (e.g. http://localhost:3001)',
        required: false,
      },
    },
  };
}

/**
 * Creates a valid ZIP archive Buffer containing the given entries.
 * Pure Node.js implementation without external dependencies.
 *
 * @param {Array<{ name: string, data: Buffer | string }>} entries
 * @returns {Buffer}
 */
export function createZipArchive(entries) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const dataBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const uncompressedSize = dataBuf.length;
    const crc = crc32(dataBuf);
    const compressedData = deflateRawSync(dataBuf);
    const compressedSize = compressedData.length;

    // Local file header (30 bytes + name)
    const lh = Buffer.alloc(30 + nameBuf.length);
    lh.writeUInt32LE(0x04034b50, 0); // signature
    lh.writeUInt16LE(20, 4); // min version
    lh.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    lh.writeUInt16LE(8, 8); // compression = DEFLATE
    lh.writeUInt16LE(0, 10); // mod time
    lh.writeUInt16LE(0, 12); // mod date
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(compressedSize, 18);
    lh.writeUInt32LE(uncompressedSize, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28); // extra field length
    nameBuf.copy(lh, 30);

    localHeaders.push(lh, compressedData);

    // Central directory header (46 bytes + name)
    const ch = Buffer.alloc(46 + nameBuf.length);
    ch.writeUInt32LE(0x02014b50, 0); // signature
    ch.writeUInt16LE(20, 4); // version made by
    ch.writeUInt16LE(20, 6); // min version
    ch.writeUInt16LE(0x0800, 8); // UTF-8 filename flag
    ch.writeUInt16LE(8, 10); // compression = DEFLATE
    ch.writeUInt16LE(0, 12); // mod time
    ch.writeUInt16LE(0, 14); // mod date
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(compressedSize, 20);
    ch.writeUInt32LE(uncompressedSize, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30); // extra field length
    ch.writeUInt16LE(0, 32); // comment length
    ch.writeUInt16LE(0, 34); // disk start
    ch.writeUInt16LE(0, 36); // internal attrs
    ch.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attrs (standard file permissions)
    ch.writeUInt32LE(offset, 42); // relative offset of local header
    nameBuf.copy(ch, 46);

    centralHeaders.push(ch);

    offset += lh.length + compressedData.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const ch of centralHeaders) {
    centralDirSize += ch.length;
  }

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // start disk
  eocd.writeUInt16LE(entries.length, 8); // records on disk
  eocd.writeUInt16LE(entries.length, 10); // total records
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

export function buildMcpb() {
  if (!existsSync(bundlePath)) {
    process.stdout.write('bundle.cjs not found; building bundle first...\n');
    execFileSync(process.execPath, [join(here, 'bundle.mjs')], { stdio: 'inherit' });
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const version = packageJson.version;
  const manifest = generateMcpbManifest(version);
  const manifestJson = JSON.stringify(manifest, null, 2) + '\n';

  writeFileSync(manifestPath, manifestJson, 'utf8');

  const bundleData = readFileSync(bundlePath);
  const zipBuffer = createZipArchive([
    { name: 'manifest.json', data: manifestJson },
    { name: 'bundle.cjs', data: bundleData },
  ]);

  writeFileSync(mcpbPath, zipBuffer);
  process.stdout.write(
    `Built MCPB bundle for v${version} at ${mcpbPath} (${zipBuffer.length} bytes)\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildMcpb();
}
