import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateBuildIdentity,
  writeBuildIdentity,
  verifyBuildIdentity,
} from './build-identity.mjs';

describe('build-identity', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'build-id-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('generates, writes, and verifies a matching build identity', () => {
    const identity = generateBuildIdentity({
      runId: '12345',
      runAttempt: '1',
      commitSha: 'abcdef1234567890',
      configuration: 'production',
    });

    writeBuildIdentity(tempDir, identity);

    const result = verifyBuildIdentity(tempDir, {
      runId: '12345',
      commitSha: 'abcdef1234567890',
      configuration: 'production',
    });

    assert.equal(result.valid, true);
    assert.equal(result.identity?.commitSha, 'abcdef1234567890');
  });

  it('fails when identity manifest is absent', () => {
    const result = verifyBuildIdentity(tempDir, {
      commitSha: 'abcdef1234567890',
    });

    assert.equal(result.valid, false);
    assert.match(result.error ?? '', /manifest not found/i);
  });

  it('fails when commitSha does not match', () => {
    const identity = generateBuildIdentity({
      commitSha: 'real-commit-sha',
    });
    writeBuildIdentity(tempDir, identity);

    const result = verifyBuildIdentity(tempDir, {
      commitSha: 'expected-different-sha',
    });

    assert.equal(result.valid, false);
    assert.match(result.error ?? '', /commit SHA mismatch/i);
  });

  it('fails when runId does not match', () => {
    const identity = generateBuildIdentity({
      runId: 'run-1',
      commitSha: 'sha-1',
    });
    writeBuildIdentity(tempDir, identity);

    const result = verifyBuildIdentity(tempDir, {
      runId: 'run-2',
      commitSha: 'sha-1',
    });

    assert.equal(result.valid, false);
    assert.match(result.error ?? '', /run ID mismatch/i);
  });

  it('fails when configuration does not match', () => {
    const identity = generateBuildIdentity({
      configuration: 'staging',
      commitSha: 'sha-1',
    });
    writeBuildIdentity(tempDir, identity);

    const result = verifyBuildIdentity(tempDir, {
      configuration: 'production',
      commitSha: 'sha-1',
    });

    assert.equal(result.valid, false);
    assert.match(result.error ?? '', /configuration mismatch/i);
  });

  it('fails cleanly on malformed manifest JSON', () => {
    writeFileSync(join(tempDir, '.build-identity.json'), 'not-json', 'utf8');

    const result = verifyBuildIdentity(tempDir, {
      commitSha: 'sha-1',
    });

    assert.equal(result.valid, false);
    assert.match(result.error ?? '', /failed to parse/i);
  });
});
