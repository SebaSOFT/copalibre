import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const keyFileVariables = ['COPALIBRE_JWT_PRIVATE_KEY_FILE', 'COPALIBRE_JWKS_FILE'] as const;
const originalEnvironment = new Map(keyFileVariables.map((name) => [name, process.env[name]]));
const originalCwd = process.cwd();
const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'copalibre-local-keys-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function freshLocalSigningKeys() {
  vi.resetModules();
  return import('./local-signing-keys.js');
}

afterEach(() => {
  process.chdir(originalCwd);
  for (const name of keyFileVariables) {
    const value = originalEnvironment.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true });
  vi.resetModules();
});

describe('getLocalKeys file loading', () => {
  it('loads private key and JWKS from configured paths', async () => {
    const directory = temporaryDirectory();
    const privateKey = 'configured-private-key';
    const jwks = { keys: [{ kid: 'configured-key', alg: 'RS256' }] };
    const privateKeyFile = join(directory, 'private.pem');
    const jwksFile = join(directory, 'jwks.json');
    writeFileSync(privateKeyFile, privateKey);
    writeFileSync(jwksFile, JSON.stringify(jwks));
    process.env.COPALIBRE_JWT_PRIVATE_KEY_FILE = privateKeyFile;
    process.env.COPALIBRE_JWKS_FILE = jwksFile;

    const { getLocalKeys } = await freshLocalSigningKeys();

    expect(getLocalKeys()).toEqual({ privateKey, jwks });
  });

  it('falls back to generated key material when configured files are invalid', async () => {
    const directory = temporaryDirectory();
    const privateKeyFile = join(directory, 'private.pem');
    const jwksFile = join(directory, 'jwks.json');
    writeFileSync(privateKeyFile, 'invalid private key');
    writeFileSync(jwksFile, '{invalid json');
    process.env.COPALIBRE_JWT_PRIVATE_KEY_FILE = privateKeyFile;
    process.env.COPALIBRE_JWKS_FILE = jwksFile;

    const { getLocalKeys } = await freshLocalSigningKeys();
    const keys = getLocalKeys();

    expect(keys.privateKey).toContain('BEGIN PRIVATE KEY');
    expect(keys.jwks.keys[0]?.kid).toBe('copalibre-local-key-1');
  });

  it('loads default filenames from the current working directory', async () => {
    const directory = temporaryDirectory();
    const privateKey = 'cwd-private-key';
    const jwks = { keys: [{ kid: 'cwd-key', alg: 'RS256' }] };
    writeFileSync(join(directory, 'jwt-private.pem'), privateKey);
    writeFileSync(join(directory, 'jwks.json'), JSON.stringify(jwks));
    delete process.env.COPALIBRE_JWT_PRIVATE_KEY_FILE;
    delete process.env.COPALIBRE_JWKS_FILE;
    process.chdir(directory);

    const { getLocalKeys } = await freshLocalSigningKeys();

    expect(getLocalKeys()).toEqual({ privateKey, jwks });
  });
});
