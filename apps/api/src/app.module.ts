import { Module, type Provider } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { DATABASE } from './database.token.js';
import { HealthController } from './health.controller.js';
import { MatchControlController } from './controllers/match-control.controller.js';
import { OrganizationsController } from './controllers/organizations.controller.js';
import { SchedulesController } from './controllers/schedules.controller.js';
import { TournamentsController } from './controllers/tournaments.controller.js';
import { authConfigFromEnv } from './auth/auth-config.js';
import { TokenVerifier } from './auth/token-verifier.js';
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
  controllers: [
    HealthController,
    OrganizationsController,
    TournamentsController,
    SchedulesController,
    MatchControlController,
  ],
  providers,
})
export class AppModule {}
