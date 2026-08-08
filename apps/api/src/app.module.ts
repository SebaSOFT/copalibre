import { Module, type Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { Kysely } from 'kysely';
import { DATABASE } from './database.token.js';
import { HealthController } from './health.controller.js';
import { MatchControlController } from './controllers/match-control.controller.js';
import { DataImportExportController } from './controllers/data-import-export.controller.js';
import { InstallationBootstrapController } from './controllers/installation-bootstrap.controller.js';
import { DataExportController } from './controllers/data-export.controller.js';
import { OrganizationsController } from './controllers/organizations.controller.js';
import { SchedulesController } from './controllers/schedules.controller.js';
import { TournamentsController } from './controllers/tournaments.controller.js';
import {
  DisciplinesController,
  RegistrationsController,
} from './controllers/registrations.controller.js';
import { StandingsController } from './controllers/standings.controller.js';
import { SeedingController } from './controllers/seeding.controller.js';
import { DisplayTokenController } from './controllers/broadcast.controller.js';
import {
  ParticipantReportsController,
  ReportReviewController,
} from './controllers/reports.controller.js';
import {
  InvitationAcceptanceController,
  OrganizationAccessController,
} from './controllers/organization-access.controller.js';
import {
  ParticipantIdentityLinksController,
  ParticipantsController,
} from './controllers/participants.controller.js';
import { authConfigFromEnv } from './auth/auth-config.js';
import { TokenVerifier } from './auth/token-verifier.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { OrganizationAccessGuard } from './auth/organization-access.guard.js';
import { createObjectStorageAdapter, objectStorageConfigFromEnv } from '@copalibre/object-storage';
import { createDatabase, databaseConfigFromEnv, type Database } from '@copalibre/persistence';
import { OBJECT_STORAGE } from './object-storage.token.js';

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
  {
    provide: OBJECT_STORAGE,
    useFactory: () => createObjectStorageAdapter(objectStorageConfigFromEnv(process.env)),
  },
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: OrganizationAccessGuard },
];

@Module({
  controllers: [
    HealthController,
    OrganizationsController,
    TournamentsController,
    SchedulesController,
    MatchControlController,
    DataImportExportController,
    DataExportController,
    RegistrationsController,
    DisciplinesController,
    StandingsController,
    SeedingController,
    DisplayTokenController,
    OrganizationAccessController,
    InvitationAcceptanceController,
    ParticipantsController,
    ParticipantIdentityLinksController,
    ParticipantReportsController,
    ReportReviewController,
    InstallationBootstrapController,
  ],
  providers,
})
export class AppModule {}
