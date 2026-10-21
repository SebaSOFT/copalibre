import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface LocalSigningKeys {
  readonly privateKey: string;
  readonly jwks: { readonly keys: readonly Record<string, unknown>[] };
}

let cachedPrivateKey: string | undefined;
let cachedJwks: LocalSigningKeys['jwks'] | undefined;

export function getLocalKeys(): LocalSigningKeys {
  if (cachedPrivateKey && cachedJwks) {
    return { privateKey: cachedPrivateKey, jwks: cachedJwks };
  }

  const cwd = process.cwd();
  const privateKeyFile =
    process.env.COPALIBRE_JWT_PRIVATE_KEY_FILE ??
    (existsSync(join(cwd, 'jwt-private.pem')) ? join(cwd, 'jwt-private.pem') : undefined) ??
    (existsSync('/var/lib/copalibre/jwt-private.pem')
      ? '/var/lib/copalibre/jwt-private.pem'
      : undefined);

  const jwksFile =
    process.env.COPALIBRE_JWKS_FILE ??
    (existsSync(join(cwd, 'jwks.json')) ? join(cwd, 'jwks.json') : undefined) ??
    (existsSync('/var/lib/copalibre/jwks.json') ? '/var/lib/copalibre/jwks.json' : undefined);

  if (privateKeyFile && existsSync(privateKeyFile)) {
    try {
      cachedPrivateKey = readFileSync(privateKeyFile, 'utf8');
    } catch {
      // ignore
    }
  }

  if (jwksFile && existsSync(jwksFile)) {
    try {
      cachedJwks = JSON.parse(readFileSync(jwksFile, 'utf8')) as LocalSigningKeys['jwks'];
    } catch {
      // ignore
    }
  }

  if (!cachedPrivateKey || !cachedJwks) {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    cachedPrivateKey = cachedPrivateKey ?? privateKey;
    const jwk = createPublicKey(publicKey).export({ format: 'jwk' });
    cachedJwks = cachedJwks ?? {
      keys: [
        {
          ...jwk,
          kid: 'copalibre-local-key-1',
          use: 'sig',
          alg: 'RS256',
        },
      ],
    };
  }

  return { privateKey: cachedPrivateKey, jwks: cachedJwks };
}
