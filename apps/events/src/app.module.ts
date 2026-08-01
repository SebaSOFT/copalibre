import { Module, type Provider } from '@nestjs/common';
import { TokenVerifier, authConfigFromEnv } from '@copalibre/auth';
import { createDatabase, databaseConfigFromEnv, type Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { DATABASE } from './database.token.js';
import { EventsController, LongPollController } from './events.controller.js';
import { HealthController } from './health.controller.js';
import { StreamAuthGuard } from './stream/stream-auth.guard.js';

/**
 * The events process (0018). The database and the verifier are behind tokens so
 * a test can hand over a scratch database and an in-memory key set — the same
 * shape `apps/api` uses, and for the same reason.
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
  StreamAuthGuard,
];

@Module({
  controllers: [HealthController, EventsController, LongPollController],
  providers,
})
export class AppModule {}
