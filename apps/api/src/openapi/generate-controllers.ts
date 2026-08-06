import { HealthController } from '../health.controller.js';
import { DataExportController } from '../controllers/data-export.controller.js';
import { DataImportExportController } from '../controllers/data-import-export.controller.js';
import { InstallationBootstrapController } from '../controllers/installation-bootstrap.controller.js';
import { MatchControlController } from '../controllers/match-control.controller.js';
import { OrganizationsController } from '../controllers/organizations.controller.js';
import {
  DisciplinesController,
  RegistrationsController,
} from '../controllers/registrations.controller.js';
import { SchedulesController } from '../controllers/schedules.controller.js';
import { SeedingController } from '../controllers/seeding.controller.js';
import { DisplayTokenController } from '../controllers/broadcast.controller.js';
import { StandingsController } from '../controllers/standings.controller.js';
import { TournamentsController } from '../controllers/tournaments.controller.js';
import {
  InvitationAcceptanceController,
  OrganizationAccessController,
} from '../controllers/organization-access.controller.js';
import {
  ParticipantIdentityLinksController,
  ParticipantsController,
} from '../controllers/participants.controller.js';

/**
 * The controllers the OpenAPI artifact is generated from.
 *
 * Separate from `AppModule` because generation must run without a database or a
 * reachable identity provider, and identical to it by test: a controller the app
 * serves and the contract omits is a route no client can discover, and nothing
 * else in the build would notice.
 */
export const OPENAPI_CONTROLLERS = [
  HealthController,
  OrganizationsController,
  TournamentsController,
  RegistrationsController,
  DisciplinesController,
  SchedulesController,
  MatchControlController,
  DataImportExportController,
  DataExportController,
  StandingsController,
  SeedingController,
  DisplayTokenController,
  OrganizationAccessController,
  InvitationAcceptanceController,
  ParticipantsController,
  ParticipantIdentityLinksController,
  InstallationBootstrapController,
] as const;
