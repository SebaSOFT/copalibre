import { Module, type Provider } from '@nestjs/common';
import { createObjectStorageAdapter, objectStorageConfigFromEnv } from '@copalibre/object-storage';
import {
  createDatabase,
  databaseConfigFromEnv,
  EVIDENCE_VALIDATION_REQUESTED_EVENT,
  OBJECT_PROCESSING_REQUESTED_EVENT,
  type Database,
  type Refold,
} from '@copalibre/persistence';
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
import {
  emailDeliveryConfigFromEnv,
  invitationEmailHandler,
  passwordResetEmailHandler,
} from './invitations/email-delivery.js';
import { objectProcessingHandler } from './jobs/object-processing-handler.js';
import { reportEvidenceValidationHandler } from './jobs/report-evidence-handler.js';
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
    useFactory: async (db: Kysely<Database>): Promise<JobDispatcher> => {
      // No collectors are resolvable yet, so the fold produces nothing rather
      // than guessing at a discipline. Wired here so the path is real the day
      // the catalogue lands.
      const refold: Refold = async () => undefined;
      const handler = statisticsHandler({ db, refold });
      const csvImport = csvImportValidationHandler({ db });
      const invitation = invitationEmailHandler(emailDeliveryConfigFromEnv());
      const passwordReset = passwordResetEmailHandler(emailDeliveryConfigFromEnv());
      const evidence = reportEvidenceValidationHandler({ db });
      const objectProcessing = objectProcessingHandler({
        db,
        storage: createObjectStorageAdapter(objectStorageConfigFromEnv(process.env)),
        scanner: await createClamScanClient(),
      });
      return new JobDispatcher()
        .register('match.finalized', handler)
        .register('result.superseded', handler)
        .register(CSV_IMPORT_VALIDATION_EVENT, csvImport)
        .register('organization.invite.requested', invitation)
        .register('password-reset-requested', passwordReset)
        .register(EVIDENCE_VALIDATION_REQUESTED_EVENT, evidence)
        .register(OBJECT_PROCESSING_REQUESTED_EVENT, objectProcessing);
    },
  },
  RelayService,
];

@Module({
  controllers: [HealthController, DeadLetterController],
  providers,
})
export class AppModule {}
