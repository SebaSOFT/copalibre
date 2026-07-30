import { Module, type Provider } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { DATABASE } from './database.token';
import { HealthController } from './health.controller';
import { OrganizationsController } from './controllers/organizations.controller';
import { TournamentsController } from './controllers/tournaments.controller';
import { authConfigFromEnv } from './auth/auth-config';
import { TokenVerifier } from './auth/token-verifier';
import { createDatabase, databaseConfigFromEnv, type Database } from '@copalibre/persistence';

/**
 * The database and TokenVerifier are provided behind tokens so tests can
 * override them with a scratch database and an in-memory key set.
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
];

@Module({
  controllers: [HealthController, OrganizationsController, TournamentsController],
  providers,
})
export class AppModule {}
