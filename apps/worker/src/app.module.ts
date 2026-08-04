import { Module, type Provider } from '@nestjs/common';
import {
  createDatabase,
  databaseConfigFromEnv,
  type Database,
  type Refold,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { DATABASE } from './database.token.js';
import { DeadLetterController } from './dead-letter.controller.js';
import { HealthController } from './health.controller.js';
import { JobDispatcher } from './jobs/dispatcher.js';
import { statisticsHandler } from './jobs/statistics-handler.js';
import {
  csvImportValidationHandler,
  CSV_IMPORT_VALIDATION_EVENT,
} from './jobs/csv-import-handler.js';
import {
  emailDeliveryConfigFromEnv,
  invitationEmailHandler,
} from './invitations/email-delivery.js';
import { RelayService } from './relay.service.js';

/**
 * The worker process (0017).
 *
 * The dispatcher is built here and nowhere else, so "what does this deployment
 * actually run" is one list rather than a search for decorators.
 *
 * `refold` is a seam, not an omission: recomputing a match's figures needs the
 * discipline's collectors and the roster that played, and resolving those is
 * 0029's catalogue work. Until then the projection is exercised end to end by
 * the integration tests, which supply their own.
 */
const providers: Provider[] = [
  {
    provide: DATABASE,
    useFactory: (): Kysely<Database> => createDatabase(databaseConfigFromEnv()),
  },
  {
    provide: JobDispatcher,
    inject: [DATABASE],
    useFactory: (db: Kysely<Database>): JobDispatcher => {
      // No collectors are resolvable yet, so the fold produces nothing rather
      // than guessing at a discipline. Wired here so the path is real the day
      // the catalogue lands.
      const refold: Refold = async () => undefined;
      const handler = statisticsHandler({ db, refold });
      const csvImport = csvImportValidationHandler({ db });
      const invitation = invitationEmailHandler(emailDeliveryConfigFromEnv());
      return new JobDispatcher()
        .register('match.finalized', handler)
        .register('result.superseded', handler)
        .register(CSV_IMPORT_VALIDATION_EVENT, csvImport)
        .register('organization.invite.requested', invitation);
    },
  },
  RelayService,
];

@Module({
  controllers: [HealthController, DeadLetterController],
  providers,
})
export class AppModule {}
