import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import { test } from 'node:test';
import { extractZipSafely } from './build-binary.mjs';

/**
 * `extractZipSafely` replaces `extract-zip` (GHSA-7pqw-9j4j-h8q3: unvalidated
 * symlink archive entries let a ZIP write anywhere on disk, with no upstream
 * patch). These tests build a minimal ZIP archive by hand — a maintained
 * writer library (`yazl`) validates a metadata path and refuses to construct
 * the traversal fixture the "rejects a path-traversal entry" case needs, so
 * the hostile shape has to be built at the byte level to exist at all.
 * Stored (uncompressed) entries only; that's everything `extractZipSafely`
 * (via `yauzl`) needs to read back.
 */

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const VERSION_MADE_BY_UNIX = (3 << 8) | 20;

/**
 * Builds a stored-entries-only ZIP archive with entries whose raw name and
 * Unix mode are exactly what the caller specifies, bypassing the path and
 * entry-type validation a normal ZIP writer applies.
 */
function buildRawZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.path, 'utf8');
    const contentBuffer = Buffer.from(entry.content ?? '', 'utf8');
    const checksum = crc32(contentBuffer);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // general purpose bit flag
    localHeader.writeUInt16LE(0, 8); // compression method: stored
    localHeader.writeUInt16LE(0, 10); // last mod file time
    localHeader.writeUInt16LE(0x21, 12); // last mod file date
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(contentBuffer.length, 18); // compressed size
    localHeader.writeUInt32LE(contentBuffer.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length
    localParts.push(localHeader, nameBuffer, contentBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(CENTRAL_DIRECTORY_SIGNATURE, 0);
    centralHeader.writeUInt16LE(VERSION_MADE_BY_UNIX, 4);
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // general purpose bit flag
    centralHeader.writeUInt16LE(0, 10); // compression method: stored
    centralHeader.writeUInt16LE(0, 12); // last mod file time
    centralHeader.writeUInt16LE(0x21, 14); // last mod file date
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(contentBuffer.length, 20); // compressed size
    centralHeader.writeUInt32LE(contentBuffer.length, 24); // uncompressed size
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra field length
    centralHeader.writeUInt16LE(0, 32); // file comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal file attributes
    centralHeader.writeUInt32LE((entry.mode << 16) >>> 0, 38); // external file attributes
    centralHeader.writeUInt32LE(offset, 42); // relative offset of local header
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + contentBuffer.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  endRecord.writeUInt16LE(0, 4); // disk number
  endRecord.writeUInt16LE(0, 6); // disk with central directory start
  endRecord.writeUInt16LE(entries.length, 8); // entries on this disk
  endRecord.writeUInt16LE(entries.length, 10); // total entries
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16); // offset of central directory
  endRecord.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

async function withTempDirs(fn) {
  const archiveDir = await mkdtemp(join(tmpdir(), 'build-binary-test-archive-'));
  const destinationDir = await mkdtemp(join(tmpdir(), 'build-binary-test-dest-'));
  try {
    await fn(archiveDir, destinationDir);
  } finally {
    await rm(archiveDir, { recursive: true, force: true });
    await rm(destinationDir, { recursive: true, force: true });
  }
}

async function writeFixture(archiveDir, fileName, entries) {
  const archivePath = join(archiveDir, fileName);
  await writeFile(archivePath, buildRawZip(entries));
  return archivePath;
}

test('a valid archive extracts its files beneath the destination directory', async () => {
  await withTempDirs(async (archiveDir, destinationDir) => {
    const archivePath = await writeFixture(archiveDir, 'valid.zip', [
      { path: 'node-v24-win-x64/node.exe', content: 'fake node binary', mode: 0o100644 },
      { path: 'node-v24-win-x64/README.txt', content: 'readme', mode: 0o100644 },
    ]);

    await extractZipSafely(archivePath, destinationDir);

    const executablePath = join(destinationDir, 'node-v24-win-x64', 'node.exe');
    assert.equal(readFileSync(executablePath, 'utf8'), 'fake node binary');
  });
});

test('a path-traversal entry is rejected and nothing is written outside the destination', async () => {
  await withTempDirs(async (archiveDir, destinationDir) => {
    const archivePath = await writeFixture(archiveDir, 'traversal.zip', [
      { path: '../../etc/pwned.txt', content: 'pwned', mode: 0o100644 },
    ]);

    await assert.rejects(() => extractZipSafely(archivePath, destinationDir));
    assert.equal(existsSync('/etc/pwned.txt'), false);
  });
});

test('a symbolic-link entry is rejected outright', async () => {
  await withTempDirs(async (archiveDir, destinationDir) => {
    // 0o120000 is S_IFLNK: a symlink entry per its Unix external file attributes.
    const archivePath = await writeFixture(archiveDir, 'symlink.zip', [
      { path: 'evil-link', content: '/etc/passwd', mode: 0o120777 },
    ]);

    await assert.rejects(() => extractZipSafely(archivePath, destinationDir), /symlink/i);
    assert.equal(existsSync(join(destinationDir, 'evil-link')), false);
  });
});

test('an unsupported entry type is rejected rather than silently skipped', async () => {
  await withTempDirs(async (archiveDir, destinationDir) => {
    // 0o020000 is S_IFCHR: a character-device entry, neither a regular file nor a directory.
    const archivePath = await writeFixture(archiveDir, 'device.zip', [
      { path: 'weird-device', content: '', mode: 0o020666 },
    ]);

    await assert.rejects(() => extractZipSafely(archivePath, destinationDir));
    assert.equal(existsSync(join(destinationDir, 'weird-device')), false);
  });
});
