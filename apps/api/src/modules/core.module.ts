import { Module, type Provider } from '@nestjs/common';
import { createLocalJWKSet, importPKCS8, SignJWT, type JWK } from 'jose';
import type { Kysely } from 'kysely';
import { createObjectStorageAdapter, objectStorageConfigFromEnv } from '@copalibre/object-storage';
import { createDatabase, databaseConfigFromEnv, type Database } from '@copalibre/persistence';
import { DATABASE } from '../database.token.js';
import { OBJECT_STORAGE } from '../object-storage.token.js';
import { authConfigFromEnv } from '../auth/auth-config.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { getLocalKeys } from '../auth/local-signing-keys.js';
import { HealthController } from '../health.controller.js';
import { InstallationBootstrapController } from '../controllers/installation-bootstrap.controller.js';

/**
 * Platform-level providers every feature module depends on, and the two
 * controllers with no organization scope of their own.
 *
 * The database and `TokenVerifier` are provided behind tokens so tests can
 * override them with a scratch database and an in-memory key set — moved
 * verbatim from `app.module.ts`, not redesigned.
 */
const providers: Provider[] = [
  {
    provide: DATABASE,
    useFactory: (): Kysely<Database> => createDatabase(databaseConfigFromEnv()),
  },
  {
    provide: TokenVerifier,
    useFactory: createTokenVerifierFromEnv,
  },
  {
    provide: OBJECT_STORAGE,
    useFactory: () => createObjectStorageAdapter(objectStorageConfigFromEnv(process.env)),
  },
];

export async function createTokenVerifierFromEnv(): Promise<TokenVerifier> {
  const config = authConfigFromEnv();
  try {
    const keys = getLocalKeys();
    const nativeKeySet = createLocalJWKSet({ keys: keys.jwks.keys as JWK[] });
    const verifier = new TokenVerifier(config, undefined, nativeKeySet);
    const firstKey = keys.jwks.keys[0];
    const kid = firstKey && typeof firstKey.kid === 'string' ? firstKey.kid : undefined;
    if (!kid) throw new Error('The local JWKS has no key identifier');
    const privateKey = await importPKCS8(keys.privateKey, 'RS256');
    const probe = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(config.nativeIssuer ?? 'http://localhost:8080')
      .setAudience(config.audience)
      .setSubject('native-verifier-startup-probe')
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(privateKey);
    await verifier.verify(probe);
    return verifier;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `Native token verifier configuration failed; check COPALIBRE_NATIVE_JWT_ISSUER, COPALIBRE_JWT_AUDIENCE, COPALIBRE_JWT_PRIVATE_KEY_FILE, and COPALIBRE_JWKS_FILE: ${detail}`,
      { cause },
    );
  }
}

@Module({
  controllers: [HealthController, InstallationBootstrapController],
  providers,
  exports: [DATABASE, TokenVerifier, OBJECT_STORAGE],
})
export class CoreModule {}
