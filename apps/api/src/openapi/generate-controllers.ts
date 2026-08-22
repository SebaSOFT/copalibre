import { HealthController } from '../health.controller.js';
import { AdminModulesController } from '../controllers/admin-modules.controller.js';
import { AdminStatisticsController } from '../controllers/admin-statistics.controller.js';
import { DataExportController } from '../controllers/data-export.controller.js';
import { DataImportExportController } from '../controllers/data-import-export.controller.js';
import { InstallationBootstrapController } from '../controllers/installation-bootstrap.controller.js';
import { MatchControlController } from '../controllers/match-control.controller.js';
import { OrganizationsController } from '../controllers/organizations.controller.js';
import {
  DisciplinesController,
  EntrantsController,
  RegistrationsController,
} from '../controllers/registrations.controller.js';
import { SchedulesController } from '../controllers/schedules.controller.js';
import { SeedingController } from '../controllers/seeding.controller.js';
import { StagesController } from '../controllers/stages.controller.js';
import { DisplayTokenController } from '../controllers/broadcast.controller.js';
import { StandingsController } from '../controllers/standings.controller.js';
import { TableProjectionsController } from '../controllers/table-projections.controller.js';
import { TournamentsController } from '../controllers/tournaments.controller.js';
import { ZonesGroupsController } from '../controllers/zones-groups.controller.js';
import { ClubsController } from '../controllers/clubs.controller.js';
import { ResourcesController } from '../controllers/resources.controller.js';
import {
  InvitationAcceptanceController,
  OrganizationAccessController,
} from '../controllers/organization-access.controller.js';
import {
  ParticipantIdentityLinksController,
  ParticipantsController,
} from '../controllers/participants.controller.js';
import {
  ParticipantReportsController,
  ReportReviewController,
} from '../controllers/reports.controller.js';
import {
  PublicProjectionsController,
  PublicTournamentListingController,
} from '../controllers/public-projections.controller.js';
import {
  NativeAuthController,
  PersonalAccessTokenController,
} from '../controllers/auth.controller.js';
import {
  ClubMediaController,
  OrganizationMediaController,
  PersonMediaController,
} from '../controllers/identity-media.controller.js';
import { PublicObjectsController } from '../controllers/public-objects.controller.js';

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
  EntrantsController,
  DisciplinesController,
  SchedulesController,
  MatchControlController,
  DataImportExportController,
  DataExportController,
  StandingsController,
  TableProjectionsController,
  SeedingController,
  StagesController,
  DisplayTokenController,
  OrganizationAccessController,
  InvitationAcceptanceController,
  ParticipantsController,
  ParticipantIdentityLinksController,
  ParticipantReportsController,
  ReportReviewController,
  InstallationBootstrapController,
  PublicTournamentListingController,
  PublicProjectionsController,
  PublicObjectsController,
  NativeAuthController,
  PersonalAccessTokenController,
  AdminStatisticsController,
  AdminModulesController,
  PersonMediaController,
  ClubMediaController,
  OrganizationMediaController,
  ClubsController,
  ResourcesController,
  ZonesGroupsController,
] as const;
