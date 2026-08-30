import type { OrganizationCapability } from '@copalibre/domain';

/**
 * Which capability each currently `@RequireOrganizationRole(...)`-guarded route
 * will require once its guard is converted (task 2.2). Keyed by
 * `${ControllerName}.${methodName}`, matching how `access-coverage.test.ts`
 * walks `OPENAPI_CONTROLLERS`.
 *
 * This table is the oracle `capability-guard-equivalence.test.ts` (task 1.4)
 * checks against, written before any guard is actually converted — the
 * mapping is derived from, and named-exceptions aside must resolve back to,
 * the roles each route admits today.
 */
export const ROUTE_CAPABILITIES: Readonly<Record<string, OrganizationCapability>> = Object.freeze({
  // org.manage-users
  'OrganizationAccessController.change': 'org.manage-users',
  'OrganizationAccessController.grantable': 'org.manage-users',
  'OrganizationAccessController.list': 'org.manage-users',
  'OrganizationAccessController.remove': 'org.manage-users',

  // org.manage-settings
  'OrganizationsController.updateSettings': 'org.manage-settings',
  'OrganizationsController.getStorageUsage': 'org.manage-settings',
  'OrganizationMediaController.uploadEmblem': 'org.manage-settings',

  // org.manage-clubs — deliberate exception, see CLUB_ADMIN_EXCEPTIONS below:
  // today these admit only `admin`; the mapping resolves to `admin` and
  // `club-admin`, narrowed to administered clubs by the ownership check
  // added in task 3.1/3.2.
  'ClubMediaController.uploadEmblem': 'org.manage-clubs',
  'ClubsController.create': 'org.manage-clubs',
  'ClubsController.list': 'org.manage-clubs',
  'ClubsController.update': 'org.manage-clubs',

  // org.manage-persons
  'ParticipantIdentityLinksController.link': 'org.manage-persons',
  'PersonMediaController.getPerson': 'org.manage-persons',
  'PersonMediaController.setNationality': 'org.manage-persons',
  'PersonMediaController.uploadPhoto': 'org.manage-persons',

  // org.manage-resources
  'ResourcesController.createOfficial': 'org.manage-resources',
  'ResourcesController.createSchedule': 'org.manage-resources',
  'ResourcesController.createVenue': 'org.manage-resources',
  'ResourcesController.deleteSchedule': 'org.manage-resources',
  'ResourcesController.listOfficials': 'org.manage-resources',
  'ResourcesController.listSchedules': 'org.manage-resources',
  'ResourcesController.listVenues': 'org.manage-resources',
  'ResourcesController.updateOfficial': 'org.manage-resources',
  'ResourcesController.updateSchedule': 'org.manage-resources',
  'ResourcesController.updateVenue': 'org.manage-resources',

  // org.create-tournaments
  'TournamentsController.create': 'org.create-tournaments',
  'TournamentsController.listActive': 'org.create-tournaments',
  'TournamentsController.customScriptVocabulary': 'org.create-tournaments',

  // org.manage-tournament-lifecycle
  'TournamentsController.archive': 'org.manage-tournament-lifecycle',
  'TournamentsController.customScripts': 'org.manage-tournament-lifecycle',
  'TournamentsController.exportConfiguration': 'org.manage-tournament-lifecycle',
  'TournamentsController.publish': 'org.manage-tournament-lifecycle',
  'TournamentsController.updateCustomScripts': 'org.manage-tournament-lifecycle',

  // org.rebuild-statistics
  'AdminStatisticsController.rebuild': 'org.rebuild-statistics',

  // org.view-audit-trail
  'AuditTrailController.trail': 'org.view-audit-trail',

  // org.manage-stages
  'StagesController.create': 'org.manage-stages',
  'StagesController.fixtures': 'org.manage-stages',
  'StagesController.previewSeriesMutation': 'org.manage-stages',

  // org.manage-zones-groups
  'ZonesGroupsController.assignGroupsManually': 'org.manage-zones-groups',
  'ZonesGroupsController.assignZonesManually': 'org.manage-zones-groups',
  'ZonesGroupsController.confirmGroups': 'org.manage-zones-groups',
  'ZonesGroupsController.confirmZones': 'org.manage-zones-groups',
  'ZonesGroupsController.createGroup': 'org.manage-zones-groups',
  'ZonesGroupsController.createZone': 'org.manage-zones-groups',
  'ZonesGroupsController.previewGroups': 'org.manage-zones-groups',
  'ZonesGroupsController.previewPromotion': 'org.manage-zones-groups',
  'ZonesGroupsController.previewZones': 'org.manage-zones-groups',
  'ZonesGroupsController.promotionPlansTargetingStage': 'org.manage-zones-groups',
  'ZonesGroupsController.savePromotionPlan': 'org.manage-zones-groups',

  // org.manage-schedule
  'SchedulesController.preview': 'org.manage-schedule',
  'SchedulesController.publish': 'org.manage-schedule',

  // org.manage-seeding
  'SeedingController.publish': 'org.manage-seeding',
  'SeedingController.seeding': 'org.manage-seeding',

  // org.manage-registrations
  'RegistrationsController.bulkReview': 'org.manage-registrations',
  'RegistrationsController.editTeamMemberships': 'org.manage-registrations',
  'RegistrationsController.list': 'org.manage-registrations',
  'RegistrationsController.review': 'org.manage-registrations',
  'EntrantsController.needingAbbreviation': 'org.manage-registrations',
  'EntrantsController.setAbbreviation': 'org.manage-registrations',

  // org.review-reports
  'ReportReviewController.listPending': 'org.review-reports',
  'ReportReviewController.review': 'org.review-reports',

  // org.operate-match
  'MatchControlController.adjustClock': 'org.operate-match',
  'MatchControlController.bulkLoad': 'org.operate-match',
  'MatchControlController.command': 'org.operate-match',
  'MatchControlController.console': 'org.operate-match',
  'MatchControlController.recordEvent': 'org.operate-match',
  'MatchControlController.resolveTimer': 'org.operate-match',
  'MatchControlController.rosterCandidates': 'org.operate-match',
  'MatchControlController.rosters': 'org.operate-match',
  'MatchControlController.setRoster': 'org.operate-match',

  // org.correct-match-results
  'MatchControlController.correct': 'org.correct-match-results',
  'MatchControlController.history': 'org.correct-match-results',
  'MatchControlController.previewCorrection': 'org.correct-match-results',

  // org.manage-display-tokens
  'DisplayTokenController.issue': 'org.manage-display-tokens',
  'DisplayTokenController.list': 'org.manage-display-tokens',
  'DisplayTokenController.revoke': 'org.manage-display-tokens',

  // org.view-internal-tables
  'TableProjectionsController.stageTable': 'org.view-internal-tables',
  'TableProjectionsController.stageTableCsv': 'org.view-internal-tables',
  'TableProjectionsController.tableLayouts': 'org.view-internal-tables',
  'TableProjectionsController.tournamentTable': 'org.view-internal-tables',
  'TableProjectionsController.tournamentTableCsv': 'org.view-internal-tables',

  // org.view-internal-standings
  'StandingsController.standings': 'org.view-internal-standings',
  'StandingsController.trace': 'org.view-internal-standings',

  // org.manage-tournament-data
  'DataExportController.participants': 'org.manage-tournament-data',
  'DataExportController.results': 'org.manage-tournament-data',
  'DataExportController.standings': 'org.manage-tournament-data',
  'DataImportExportController.commit': 'org.manage-tournament-data',
  'DataImportExportController.create': 'org.manage-tournament-data',
  'DataImportExportController.preview': 'org.manage-tournament-data',
});

/**
 * Routes whose mapped capability resolves to more roles than the route
 * admits today, by design rather than by mistake. Every entry here must be
 * named in `design.md`'s Decisions — currently only `club-admin`'s deliberate
 * addition to `org.manage-clubs` routes, immediately narrowed to administered
 * clubs by the ownership check in task 3.1/3.2. Nothing else may use this
 * escape hatch; the equivalence test enforces that everywhere else, the
 * mapping-resolved roles equal today's roles exactly.
 */
export const DELIBERATE_EQUIVALENCE_EXCEPTIONS: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    'ClubMediaController.uploadEmblem': ['club-admin'],
    'ClubsController.create': ['club-admin'],
    'ClubsController.list': ['club-admin'],
    'ClubsController.update': ['club-admin'],
  });
