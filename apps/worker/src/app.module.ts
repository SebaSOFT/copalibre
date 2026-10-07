import { Logger, Module, type Provider } from '@nestjs/common';
import { createObjectStorageAdapter, objectStorageConfigFromEnv } from '@copalibre/object-storage';
import {
  createDatabase,
  databaseConfigFromEnv,
  EVIDENCE_VALIDATION_REQUESTED_EVENT,
  OBJECT_PROCESSING_REQUESTED_EVENT,
  OutboxRelay,
  type Database,
} from '@copalibre/persistence';
import { createRefold } from '@copalibre/statistics-refold';
import type { Kysely } from 'kysely';
import { createClamScanClient } from './clamav.js';
import { DATABASE } from './database.token.js';
import { DeadLetterController } from './dead-letter.controller.js';
import { HealthController } from './health.controller.js';
import { JobDispatcher } from './jobs/dispatcher.js';
import { statisticsHandler } from './jobs/statistics-handler.js';
import {
  csvImportValidationHandler,
  CSV_IMPORT_VALIDATION_EVENT,
} from './jobs/csv-import-handler.js';
import { emailDeliveryConfigFromEnv } from './invitations/email-delivery.js';
import {
  invitationEmailHandler,
  passwordResetEmailHandler,
} from './notifications/account-handlers.js';
import {
  LIFECYCLE_EMAIL_EVENTS,
  lifecycleEmailHandlers,
} from './notifications/lifecycle-handlers.js';
import { objectProcessingHandler } from './jobs/object-processing-handler.js';
import { reportEvidenceValidationHandler } from './jobs/report-evidence-handler.js';
import { RelayService } from './relay.service.js';

/**
 * The worker process.
 *
 * The dispatcher is built here and nowhere else, so "what does this deployment
 * actually run" is one list rather than a search for decorators.
 *
 * `refold` calls the real fold engine, via `@copalibre/statistics-refold`
 * — the package that resolves a match's roster/competition context from
 * persistence and hands it to `@copalibre/tournament-engine`'s
 * `foldStatistics`, since neither of those packages may depend on the other.
 */
const providers: Provider[] = [
  {
    provide: DATABASE,
    useFactory: (): Kysely<Database> => createDatabase(databaseConfigFromEnv()),
  },
  {
    provide: JobDispatcher,
    inject: [DATABASE],
    useFactory: async (db: Kysely<Database>): Promise<JobDispatcher> => {
      const handler = statisticsHandler({ db, refold: createRefold(db) });
      const csvImport = csvImportValidationHandler({ db });
      const emailConfig = emailDeliveryConfigFromEnv();
      const logger = new Logger('EmailDelivery');
      const email = {
        db,
        relay: new OutboxRelay(db),
        warn: (message: string) => logger.warn(message),
      };
      const invitation = invitationEmailHandler(emailConfig, email);
      const passwordReset = passwordResetEmailHandler(emailConfig, email);
      const lifecycle = lifecycleEmailHandlers(emailConfig, email);
      const evidence = reportEvidenceValidationHandler({ db });
      const objectProcessing = objectProcessingHandler({
        db,
        storage: createObjectStorageAdapter(objectStorageConfigFromEnv(process.env)),
        scanner: await createClamScanClient(),
      });
      const dispatcher = new JobDispatcher()
        .register('match.finalized', handler)
        .register('result.superseded', handler)
        .register(CSV_IMPORT_VALIDATION_EVENT, csvImport)
        .register('organization.invite.requested', invitation)
        .register('password-reset-requested', passwordReset)
        .register(EVIDENCE_VALIDATION_REQUESTED_EVENT, evidence)
        .register(OBJECT_PROCESSING_REQUESTED_EVENT, objectProcessing);
      for (const eventType of LIFECYCLE_EMAIL_EVENTS) {
        dispatcher.register(eventType, lifecycle[eventType]);
      }
      return dispatcher;
    },
  },
  RelayService,
];

@Module({
  controllers: [HealthController, DeadLetterController],
  providers,
})
export class AppModule {}
