import { Module, type Provider } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { createObjectStorageAdapter, objectStorageConfigFromEnv } from '@copalibre/object-storage';
import { createDatabase, databaseConfigFromEnv, type Database } from '@copalibre/persistence';
import { DATABASE } from '../database.token.js';
import { OBJECT_STORAGE } from '../object-storage.token.js';
import { authConfigFromEnv } from '../auth/auth-config.js';
import { TokenVerifier } from '../auth/token-verifier.js';
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
    useFactory: (): TokenVerifier => new TokenVerifier(authConfigFromEnv()),
  },
  {
    provide: OBJECT_STORAGE,
    useFactory: () => createObjectStorageAdapter(objectStorageConfigFromEnv(process.env)),
  },
];

@Module({
  controllers: [HealthController, InstallationBootstrapController],
  providers,
  exports: [DATABASE, TokenVerifier, OBJECT_STORAGE],
})
export class CoreModule {}
