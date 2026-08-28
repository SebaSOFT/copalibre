import { defineMessages } from 'react-intl';

/**
 * Every control-panel interface string, keyed by a stable ID. English is the
 * catalog's default/source language — `defaultMessage` here is also what
 * `react-intl` falls back to for any locale missing a translation.
 *
 * Plain-TypeScript helper modules (outside any component) import specific
 * descriptors from here and return them un-formatted; the component that
 * renders them calls `useIntl().formatMessage()`. JSX uses `<FormattedMessage
 * {...messages.someKey} />` directly.
 */
export const messages = defineMessages({
  // Shell
  shellSections: { id: 'control.shell.sections', defaultMessage: 'Sections' },
  shellWhatIsThisScreen: {
    id: 'control.shell.whatIsThisScreen',
    defaultMessage: 'What is this screen?',
  },
  shellLanguage: { id: 'control.shell.language', defaultMessage: 'Language' },
  shellLogout: { id: 'control.shell.logout', defaultMessage: 'Log out' },

  // Sidenav (lib/dashboard.ts SIDENAV)
  navDashboard: { id: 'control.nav.dashboard', defaultMessage: 'Dashboard' },
  navLiveConsole: { id: 'control.nav.liveConsole', defaultMessage: 'Live console' },
  navTournaments: { id: 'control.nav.tournaments', defaultMessage: 'Tournaments' },
  navRoles: { id: 'control.nav.roles', defaultMessage: 'Roles' },
  navOrganization: { id: 'control.nav.organization', defaultMessage: 'Organization' },
  navAnalytics: { id: 'control.nav.analytics', defaultMessage: 'Analytics' },
  navResources: { id: 'control.nav.resources', defaultMessage: 'Venues & officials' },
  navPlatformAdministration: {
    id: 'control.nav.platformAdministration',
    defaultMessage: 'Platform administration',
  },

  // Installation-wide super-admin console.
  platformSectionLabel: { id: 'control.platform.sectionLabel', defaultMessage: 'Installation' },
  platformTitle: { id: 'control.platform.title', defaultMessage: 'Platform administration' },
  platformDescription: {
    id: 'control.platform.description',
    defaultMessage: 'Create organizations and manage installed tournament modules.',
  },
  platformOrganizationHeading: {
    id: 'control.platform.organization.heading',
    defaultMessage: 'Create organization',
  },
  platformOrganizationDescription: {
    id: 'control.platform.organization.description',
    defaultMessage: 'Creates the organization and immediately invites its first administrator.',
  },
  platformOrganizationAlias: { id: 'control.platform.organization.alias', defaultMessage: 'Alias' },
  platformOrganizationName: { id: 'control.platform.organization.name', defaultMessage: 'Name' },
  platformPrimaryLanguage: {
    id: 'control.platform.organization.language',
    defaultMessage: 'Primary language',
  },
  platformTimezone: { id: 'control.platform.organization.timezone', defaultMessage: 'Time zone' },
  platformFirstAdminEmail: {
    id: 'control.platform.organization.adminEmail',
    defaultMessage: 'First administrator email',
  },
  platformFirstAdminRole: {
    id: 'control.platform.organization.adminRole',
    defaultMessage: 'First administrator role',
  },
  platformInviteAdministrator: {
    id: 'control.platform.organization.inviteAdministrator',
    defaultMessage: 'Invite administrator',
  },
  platformCreateOrganization: {
    id: 'control.platform.organization.create',
    defaultMessage: 'Create organization',
  },
  platformOrganizationReady: {
    id: 'control.platform.organization.ready',
    defaultMessage: 'Organization {alias} created. Invite its first administrator.',
  },
  platformOrganizationCreated: {
    id: 'control.platform.organization.created',
    defaultMessage: 'Organization {alias} created and administrator invited.',
  },
  platformUsersHeading: {
    id: 'control.platform.users.heading',
    defaultMessage: 'User administration',
  },
  platformUsersDescription: {
    id: 'control.platform.users.description',
    defaultMessage:
      'Manage installation super-admins, or drill into one organization to manage its users.',
  },
  platformManageOrganizationAlias: {
    id: 'control.platform.users.manageOrganizationAlias',
    defaultMessage: 'Organization alias',
  },
  platformManageOrganizationUsers: {
    id: 'control.platform.users.manageOrganizationUsers',
    defaultMessage: 'Manage users',
  },
  platformSuperAdminsHeading: {
    id: 'control.platform.users.superAdminsHeading',
    defaultMessage: 'Installation super-admins',
  },
  platformNoSuperAdmins: {
    id: 'control.platform.users.noSuperAdmins',
    defaultMessage: 'No installation super-admins yet.',
  },
  platformSuperAdminPrincipalId: {
    id: 'control.platform.users.superAdminPrincipalId',
    defaultMessage: 'Principal ID',
  },
  platformCreateSuperAdmin: {
    id: 'control.platform.users.createSuperAdmin',
    defaultMessage: 'Grant super-admin',
  },
  platformModulesHeading: {
    id: 'control.platform.modules.heading',
    defaultMessage: 'Installed modules',
  },
  platformModulesDescription: {
    id: 'control.platform.modules.description',
    defaultMessage: 'Install, remove, verify, and check published module updates.',
  },
  platformCheckUpdates: {
    id: 'control.platform.modules.checkUpdates',
    defaultMessage: 'Check for updates',
  },
  platformUpdatesAvailable: {
    id: 'control.platform.modules.updatesAvailable',
    defaultMessage: 'Available module updates',
  },
  platformModuleAlias: { id: 'control.platform.modules.alias', defaultMessage: 'Module alias' },
  platformVersionRange: {
    id: 'control.platform.modules.range',
    defaultMessage: 'Version range (optional)',
  },
  platformAlternateSource: {
    id: 'control.platform.modules.source',
    defaultMessage: 'Alternate source (one use only)',
  },
  platformInstallModule: {
    id: 'control.platform.modules.install',
    defaultMessage: 'Install module',
  },
  platformModuleInstalled: {
    id: 'control.platform.modules.installed',
    defaultMessage: '{alias} {version} installed.',
  },
  platformModuleRemoved: {
    id: 'control.platform.modules.removed',
    defaultMessage: '{alias} removed.',
  },
  platformRemoveConfirm: {
    id: 'control.platform.modules.removeConfirm',
    defaultMessage: 'Remove {alias} from this installation?',
  },
  platformLoadingModules: {
    id: 'control.platform.modules.loading',
    defaultMessage: 'Loading installed modules…',
  },
  platformNoModules: {
    id: 'control.platform.modules.empty',
    defaultMessage: 'No modules are installed.',
  },
  platformKind: { id: 'control.platform.modules.kind', defaultMessage: 'Kind' },
  platformVersion: { id: 'control.platform.modules.version', defaultMessage: 'Version' },
  platformSourceKind: { id: 'control.platform.modules.sourceKind', defaultMessage: 'Source' },
  platformAuthor: { id: 'control.platform.modules.author', defaultMessage: 'Author' },
  platformActions: { id: 'control.platform.modules.actions', defaultMessage: 'Actions' },
  platformVerify: { id: 'control.platform.modules.verify', defaultMessage: 'Verify' },
  platformRemove: { id: 'control.platform.modules.remove', defaultMessage: 'Remove' },
  platformVerified: { id: 'control.platform.modules.verified', defaultMessage: 'Verified' },
  platformVerificationPassed: {
    id: 'control.platform.modules.verificationPassed',
    defaultMessage: '{alias} passed verification.',
  },
  platformVerificationFailed: {
    id: 'control.platform.modules.verificationFailed',
    defaultMessage: '{alias} failed verification.',
  },

  // Tournament lifecycle labels (lib/dashboard.ts LIFECYCLE_PRESENTATION)
  lifecycleLive: { id: 'control.lifecycle.live', defaultMessage: 'LIVE' },
  lifecycleUpcoming: { id: 'control.lifecycle.upcoming', defaultMessage: 'UPCOMING' },
  lifecycleDraft: { id: 'control.lifecycle.draft', defaultMessage: 'DRAFT' },
  lifecycleFinished: { id: 'control.lifecycle.finished', defaultMessage: 'FINISHED' },

  // Dashboard (QuickStats.tsx, TournamentCard.tsx, ActivityLog.tsx, Dashboard.tsx)
  dashboardSummary: { id: 'control.dashboard.summary', defaultMessage: 'Summary' },
  dashboardActiveTournaments: {
    id: 'control.dashboard.activeTournaments',
    defaultMessage: 'Active tournaments',
  },
  dashboardPendingRegistrations: {
    id: 'control.dashboard.pendingRegistrations',
    defaultMessage: 'Pending registrations',
  },
  dashboardMatchesToday: {
    id: 'control.dashboard.matchesToday',
    defaultMessage: 'Matches today',
  },
  dashboardRecentActivity: {
    id: 'control.dashboard.recentActivity',
    defaultMessage: 'Recent activity',
  },
  dashboardNoActivityYet: {
    id: 'control.dashboard.noActivityYet',
    defaultMessage: 'No activity yet.',
  },
  dashboardTournaments: { id: 'control.dashboard.tournaments', defaultMessage: 'Tournaments' },
  dashboardNoTournaments: {
    id: 'control.dashboard.noTournaments',
    defaultMessage: 'This organization has no tournaments yet.',
  },
  dashboardParticipantsCsv: {
    id: 'control.dashboard.participantsCsv',
    defaultMessage: 'Participants CSV',
  },
  dashboardResultsCsv: { id: 'control.dashboard.resultsCsv', defaultMessage: 'Results CSV' },
  dashboardStandingsCsv: {
    id: 'control.dashboard.standingsCsv',
    defaultMessage: 'Standings CSV',
  },
  dashboardConfigurationJson: {
    id: 'control.dashboard.configurationJson',
    defaultMessage: 'Export configuration JSON',
  },
  dashboardArchive: { id: 'control.dashboard.archive', defaultMessage: 'Archive' },

  // Device heartbeat (lib/device-heartbeat.ts, DeviceHeartbeat.tsx)
  heartbeatOnline: { id: 'control.heartbeat.online', defaultMessage: 'Online' },
  heartbeatStale: { id: 'control.heartbeat.stale', defaultMessage: 'No signal' },
  heartbeatNeverSeen: {
    id: 'control.heartbeat.neverSeen',
    defaultMessage: 'Never connected',
  },
  heartbeatRevoked: { id: 'control.heartbeat.revoked', defaultMessage: 'Revoked' },
  deviceHeartbeatSectionLabel: {
    id: 'control.deviceHeartbeat.sectionLabel',
    defaultMessage: 'TV screen status',
  },
  deviceHeartbeatTitle: { id: 'control.deviceHeartbeat.title', defaultMessage: 'TV screens' },
  deviceHeartbeatEmpty: {
    id: 'control.deviceHeartbeat.empty',
    defaultMessage: 'No TV devices provisioned yet.',
  },
  deviceHeartbeatLastSeen: {
    id: 'control.deviceHeartbeat.lastSeen',
    defaultMessage: 'last signal',
  },

  // Bracket canvas (BracketCanvas.tsx)
  bracketZoomOut: { id: 'control.bracket.zoomOut', defaultMessage: 'Zoom out' },
  bracketZoomIn: { id: 'control.bracket.zoomIn', defaultMessage: 'Zoom in' },
  bracketEmpty: {
    id: 'control.bracket.empty',
    defaultMessage: 'No structure has been generated for this stage yet.',
  },
  bracketGroupLabel: { id: 'control.bracket.groupLabel', defaultMessage: 'Bracket' },

  // Mutation feedback (lib/mutation-feedback.ts)
  mutationBlockedAfterResults: {
    id: 'control.mutation.blockedAfterResults',
    defaultMessage:
      'This change can no longer be applied through normal editing: use the audited correction flow.',
  },
  mutationRequiresRebuild: {
    id: 'control.mutation.requiresRebuild',
    defaultMessage:
      '{count, plural, =0 {This change requires regenerating the competitive structure.} one {This change requires regenerating # fixture.} other {This change requires regenerating # fixtures.}}',
  },

  // SeedingBuilderPage.tsx
  seedingSectionLabel: {
    id: 'control.seeding.sectionLabel',
    defaultMessage: 'Seeding and bracket',
  },
  seedingTitle: { id: 'control.seeding.title', defaultMessage: 'Seeding' },
  seedingUndo: { id: 'control.seeding.undo', defaultMessage: 'Undo' },
  seedingRedo: { id: 'control.seeding.redo', defaultMessage: 'Redo' },
  seedingRandomizeUnlocked: {
    id: 'control.seeding.randomizeUnlocked',
    defaultMessage: 'Shuffle unlocked',
  },
  seedingPublish: { id: 'control.seeding.publish', defaultMessage: 'Publish seeding' },
  seedingOrder: { id: 'control.seeding.order', defaultMessage: 'Seeding order' },
  seedingToggleLockAriaLabel: {
    id: 'control.seeding.toggleLockAriaLabel',
    defaultMessage: '{locked, select, true {Release seed {seed}} other {Lock seed {seed}}}',
  },
  seedingLocked: { id: 'control.seeding.locked', defaultMessage: 'Locked' },
  seedingUnlocked: { id: 'control.seeding.unlocked', defaultMessage: 'Unlocked' },
  seedingNoParticipants: {
    id: 'control.seeding.noParticipants',
    defaultMessage: 'This stage has no participants.',
  },
  seedingGeneratedBracket: {
    id: 'control.seeding.generatedBracket',
    defaultMessage: 'Generated bracket',
  },

  // Reports/disputes (lib/reports.ts, ReportReviewRoute.tsx)
  reportKindReport: { id: 'control.report.kind.report', defaultMessage: 'Proposed result' },
  reportKindDispute: { id: 'control.report.kind.dispute', defaultMessage: 'Dispute' },
  reportGenericSummary: {
    id: 'control.report.genericSummary',
    defaultMessage: 'Result proposed by the participant — see detail.',
  },
  reportSectionLabel: {
    id: 'control.report.sectionLabel',
    defaultMessage: 'Pending reports and disputes',
  },
  reportTitle: { id: 'control.report.title', defaultMessage: 'Pending reports and disputes' },
  reportLoading: { id: 'control.report.loading', defaultMessage: 'Loading reports...' },
  reportLoadFailed: {
    id: 'control.report.loadFailed',
    defaultMessage: 'Could not load the reports.',
  },
  reportEmpty: {
    id: 'control.report.empty',
    defaultMessage: 'There are no pending reports or disputes.',
  },
  reportAttachedEvidence: {
    id: 'control.report.attachedEvidence',
    defaultMessage: 'Attached evidence',
  },
  reportDismiss: { id: 'control.report.dismiss', defaultMessage: 'Dismiss' },

  // TournamentAuthoringPage.tsx
  authoringLoadingDisciplines: {
    id: 'control.authoring.loadingDisciplines',
    defaultMessage: 'Loading disciplines...',
  },
  authoringNoDisciplines: {
    id: 'control.authoring.noDisciplines',
    defaultMessage: 'No disciplines are installed.',
  },
  authoringLoadFailed: {
    id: 'control.authoring.loadFailed',
    defaultMessage: 'Could not load the disciplines.',
  },
  authoringCreating: {
    id: 'control.authoring.creating',
    defaultMessage: 'Creating tournament...',
  },
  authoringCreated: {
    id: 'control.authoring.created',
    defaultMessage: 'Tournament created: {alias}',
  },
  authoringCreateFailed: {
    id: 'control.authoring.createFailed',
    defaultMessage: 'Could not create the tournament.',
  },

  // MatchConsoleRoute.tsx
  matchConsoleLoading: {
    id: 'control.matchConsole.loading',
    defaultMessage: 'Loading match control...',
  },
  matchConsoleLoadFailed: {
    id: 'control.matchConsole.loadFailed',
    defaultMessage: 'Could not load the match’s authoritative state.',
  },
  matchConsoleOperationRejected: {
    id: 'control.matchConsole.operationRejected',
    defaultMessage: 'The operation was rejected.',
  },
  matchConsoleFinalizeNotConfirmed: {
    id: 'control.matchConsole.finalizeNotConfirmed',
    defaultMessage: 'Finalization could not be confirmed.',
  },
  matchConsoleSectionLabel: {
    id: 'control.matchConsole.sectionLabel',
    defaultMessage: 'Operate match',
  },
  matchConsoleBreadcrumb: {
    id: 'control.matchConsole.breadcrumb',
    defaultMessage: '{tournamentAlias} / Match {matchId}',
  },
  matchConsoleTitle: {
    id: 'control.matchConsole.title',
    defaultMessage: 'Match operations',
  },
  matchConsoleLive: { id: 'control.matchConsole.live', defaultMessage: 'LIVE' },
  matchConsoleAwaitingProjection: {
    id: 'control.matchConsole.awaitingProjection',
    defaultMessage: 'Awaiting authoritative projection...',
  },
  // Sync status — always visible, not only surfaced on failure.
  matchConsoleSyncStatus: {
    id: 'control.matchConsole.syncStatus',
    defaultMessage: 'Sync status',
  },
  matchConsoleOnline: { id: 'control.matchConsole.online', defaultMessage: 'Online' },
  matchConsoleOffline: { id: 'control.matchConsole.offline', defaultMessage: 'Offline' },
  matchConsoleQueuedCount: {
    id: 'control.matchConsole.queuedCount',
    defaultMessage:
      '{count, plural, =0 {No queued actions} one {# queued action} other {# queued actions}}',
  },
  matchConsoleLastSynced: {
    id: 'control.matchConsole.lastSynced',
    defaultMessage: 'Last synced {time}',
  },
  matchConsoleNeverSynced: {
    id: 'control.matchConsole.neverSynced',
    defaultMessage: 'Not yet synced',
  },
  matchConsoleRefusedAction: {
    id: 'control.matchConsole.refusedAction',
    defaultMessage: 'Refused ({kind}): {reason}',
  },
  matchConsoleRefusedContents: {
    id: 'control.matchConsole.refusedContents',
    defaultMessage: 'You recorded: {contents}',
  },
  matchConsoleDismiss: { id: 'control.matchConsole.dismiss', defaultMessage: 'Dismiss' },
  matchConsoleControls: {
    id: 'control.matchConsole.controls',
    defaultMessage: 'Match controls',
  },
  matchConsoleCurrentScoreboard: {
    id: 'control.matchConsole.currentScoreboard',
    defaultMessage: 'Current scoreboard',
  },
  matchConsoleClockAndPeriod: {
    id: 'control.matchConsole.clockAndPeriod',
    defaultMessage: 'Clock and period',
  },
  matchConsoleSegment: { id: 'control.matchConsole.segment', defaultMessage: 'Segment' },
  matchConsoleActiveSegment: {
    id: 'control.matchConsole.activeSegment',
    defaultMessage: 'Active segment',
  },
  matchConsoleElapsedSeconds: {
    id: 'control.matchConsole.elapsedSeconds',
    defaultMessage: 'Elapsed seconds',
  },
  matchConsoleApplyClock: {
    id: 'control.matchConsole.applyClock',
    defaultMessage: 'Apply clock',
  },
  matchConsoleRecordEvent: {
    id: 'control.matchConsole.recordEvent',
    defaultMessage: 'Record event',
  },
  matchConsoleParticipant: {
    id: 'control.matchConsole.participant',
    defaultMessage: 'Participant',
  },
  matchConsoleEventParticipant: {
    id: 'control.matchConsole.eventParticipant',
    defaultMessage: 'Event participant',
  },
  matchConsolePerson: { id: 'control.matchConsole.person', defaultMessage: 'Person' },
  matchConsoleEventPerson: {
    id: 'control.matchConsole.eventPerson',
    defaultMessage: 'Event person',
  },
  matchConsoleStaff: { id: 'control.matchConsole.staff', defaultMessage: 'Staff' },
  matchConsoleEventStaff: {
    id: 'control.matchConsole.eventStaff',
    defaultMessage: 'Event staff',
  },
  matchConsoleNoAttribution: {
    id: 'control.matchConsole.noAttribution',
    defaultMessage: 'No attribution',
  },
  matchConsoleEventOutcome: {
    id: 'control.matchConsole.eventOutcome',
    defaultMessage: 'Event outcome',
  },
  matchConsoleDescription: {
    id: 'control.matchConsole.description',
    defaultMessage: 'Description',
  },
  matchConsoleEventDescription: {
    id: 'control.matchConsole.eventDescription',
    defaultMessage: 'Event description',
  },
  matchConsoleFinalize: { id: 'control.matchConsole.finalize', defaultMessage: 'Finalize' },
  matchConsoleFinalizeMatch: {
    id: 'control.matchConsole.finalizeMatch',
    defaultMessage: 'Finalize match',
  },
  matchConsoleFinalizeImmutable: {
    id: 'control.matchConsole.finalizeImmutable',
    defaultMessage: 'The result will be recorded as an immutable fact.',
  },
  matchConsoleFinalizeCorrections: {
    id: 'control.matchConsole.finalizeCorrections',
    defaultMessage: 'Later corrections will preserve the reason and history.',
  },
  matchConsoleCancel: { id: 'control.matchConsole.cancel', defaultMessage: 'Cancel' },
  matchConsoleConfirmFinalization: {
    id: 'control.matchConsole.confirmFinalization',
    defaultMessage: 'Confirm finalization',
  },
  matchConsoleLedgerAndStatus: {
    id: 'control.matchConsole.ledgerAndStatus',
    defaultMessage: 'Ledger and status',
  },
  matchConsoleActiveTimers: {
    id: 'control.matchConsole.activeTimers',
    defaultMessage: 'Active timers',
  },
  matchConsoleNoActiveTimers: {
    id: 'control.matchConsole.noActiveTimers',
    defaultMessage: 'No active timers.',
  },
  matchConsoleResolve: { id: 'control.matchConsole.resolve', defaultMessage: 'Resolve' },
  matchConsoleEventLedger: {
    id: 'control.matchConsole.eventLedger',
    defaultMessage: 'Event ledger',
  },
  matchConsoleAll: { id: 'control.matchConsole.all', defaultMessage: 'All' },
  matchConsoleUnknownSegment: {
    id: 'control.matchConsole.unknownSegment',
    defaultMessage: 'Unknown segment',
  },
  matchConsoleClockAriaLabel: {
    id: 'control.matchConsole.clockAriaLabel',
    defaultMessage: 'Clock {time}',
  },
  matchConsoleLogNote: { id: 'control.matchConsole.logNote', defaultMessage: 'Log note' },
  matchConsoleOperationalSignal: {
    id: 'control.matchConsole.operationalSignal',
    defaultMessage: 'Operational signal',
  },
  matchConsoleLatency: { id: 'control.matchConsole.latency', defaultMessage: 'Latency' },
  matchConsolePacketLoss: {
    id: 'control.matchConsole.packetLoss',
    defaultMessage: 'Packet loss',
  },
  matchConsoleViewers: { id: 'control.matchConsole.viewers', defaultMessage: 'Viewers' },
  matchConsoleUptime: { id: 'control.matchConsole.uptime', defaultMessage: 'Uptime' },
  matchConsoleUnavailable: {
    id: 'control.matchConsole.unavailable',
    defaultMessage: 'Unavailable',
  },

  // JerseyGrid.tsx
  matchConsoleJerseyGridLabel: {
    id: 'control.matchConsole.jerseyGridLabel',
    defaultMessage: 'Jersey grid',
  },
  matchConsoleOnField: { id: 'control.matchConsole.onField', defaultMessage: 'On field' },
  matchConsoleBench: { id: 'control.matchConsole.bench', defaultMessage: 'Bench' },
  matchConsoleGoalkeeperBadge: {
    id: 'control.matchConsole.goalkeeperBadge',
    defaultMessage: 'Goalkeeper',
  },
  matchConsoleCaptainBadge: {
    id: 'control.matchConsole.captainBadge',
    defaultMessage: 'Captain',
  },
  matchConsoleSentOff: { id: 'control.matchConsole.sentOff', defaultMessage: 'Sent off' },

  // RosterSelectionStep.tsx
  matchConsoleNoRosterSelected: {
    id: 'control.matchConsole.noRosterSelected',
    defaultMessage: 'No roster selected for this match yet.',
  },
  matchConsoleSelectRoster: {
    id: 'control.matchConsole.selectRoster',
    defaultMessage: 'Select roster',
  },
  matchConsoleEditRoster: {
    id: 'control.matchConsole.editRoster',
    defaultMessage: 'Edit roster',
  },
  matchConsoleHideRosterStep: {
    id: 'control.matchConsole.hideRosterStep',
    defaultMessage: 'Hide roster editor',
  },
  matchConsoleLoadMatchData: {
    id: 'control.matchConsole.loadMatchData',
    defaultMessage: 'Load match data',
  },
  matchConsoleRosterStepLabel: {
    id: 'control.matchConsole.rosterStepLabel',
    defaultMessage: 'Roster selection',
  },
  matchConsoleRosterLoading: {
    id: 'control.matchConsole.rosterLoading',
    defaultMessage: 'Loading roster candidates...',
  },
  matchConsoleRosterLoadFailed: {
    id: 'control.matchConsole.rosterLoadFailed',
    defaultMessage: 'Could not load roster candidates.',
  },
  matchConsoleRosterSaveFailed: {
    id: 'control.matchConsole.rosterSaveFailed',
    defaultMessage: 'Could not save the roster.',
  },
  matchConsoleRosterSave: {
    id: 'control.matchConsole.rosterSave',
    defaultMessage: 'Save roster',
  },
  matchConsoleRosterNumber: {
    id: 'control.matchConsole.rosterNumber',
    defaultMessage: 'Shirt number for {name}',
  },
  matchConsoleRosterNumberPlaceholder: {
    id: 'control.matchConsole.rosterNumberPlaceholder',
    defaultMessage: 'No.',
  },
  matchConsoleRosterNoCandidates: {
    id: 'control.matchConsole.rosterNoCandidates',
    defaultMessage: 'This entrant has no registered players yet.',
  },

  // RegistrationReviewRoute.tsx
  registrationLoading: {
    id: 'control.registration.loading',
    defaultMessage: 'Loading registrations...',
  },
  registrationLoadFailed: {
    id: 'control.registration.loadFailed',
    defaultMessage: 'Could not load the registrations.',
  },
  registrationImportSection: {
    id: 'control.registration.importSection',
    defaultMessage: 'Import participants',
  },
  registrationCsvLabel: {
    id: 'control.registration.csvLabel',
    defaultMessage: 'Participants CSV',
  },
  registrationImportQueued: {
    id: 'control.registration.importQueued',
    defaultMessage: 'Validation queued.',
  },
  registrationImportCreateFailed: {
    id: 'control.registration.importCreateFailed',
    defaultMessage: 'Could not create the import.',
  },
  registrationPreviewValid: {
    id: 'control.registration.previewValid',
    defaultMessage: 'Valid preview.',
  },
  registrationPreviewInvalid: {
    id: 'control.registration.previewInvalid',
    defaultMessage: 'Preview has errors.',
  },
  registrationRow: {
    id: 'control.registration.row',
    defaultMessage: 'Row {rowNumber}: {errors}',
  },
  registrationImportConfirmed: {
    id: 'control.registration.importConfirmed',
    defaultMessage: 'Import confirmed.',
  },
  registrationConfirmImport: {
    id: 'control.registration.confirmImport',
    defaultMessage: 'Confirm import',
  },
  registrationContactUnavailable: {
    id: 'control.registration.contactUnavailable',
    defaultMessage: 'Not available in this response',
  },
  registrationExperienceUnrecorded: {
    id: 'control.registration.experienceUnrecorded',
    defaultMessage: 'Not recorded',
  },

  // lib/review.ts, RegistrationReviewPage.tsx
  reviewLockExplanation: {
    id: 'control.review.lockExplanation',
    defaultMessage:
      'Check-in closed: registered memberships hold eligibility. If this is an error, correct it with a report.',
  },
  reviewFilterAll: { id: 'control.review.filter.all', defaultMessage: 'All' },
  reviewFilterPending: { id: 'control.review.filter.pending', defaultMessage: 'Pending' },
  reviewFilterAccepted: { id: 'control.review.filter.accepted', defaultMessage: 'Accepted' },
  reviewFilterRefused: { id: 'control.review.filter.refused', defaultMessage: 'Refused' },
  reviewStatusPending: { id: 'control.review.status.pending', defaultMessage: 'Pending' },
  reviewStatusAccepted: { id: 'control.review.status.accepted', defaultMessage: 'Accepted' },
  reviewStatusRefused: { id: 'control.review.status.refused', defaultMessage: 'Refused' },
  reviewStatusWithdrawn: { id: 'control.review.status.withdrawn', defaultMessage: 'Withdrawn' },
  reviewStatusCheckedIn: { id: 'control.review.status.checkedIn', defaultMessage: 'Checked in' },
  reviewSectionLabel: {
    id: 'control.review.sectionLabel',
    defaultMessage: 'Registration review',
  },
  reviewTitle: { id: 'control.review.title', defaultMessage: 'Registration review' },
  reviewStatusFieldLabel: { id: 'control.review.statusFieldLabel', defaultMessage: 'Status' },
  reviewApprove: { id: 'control.review.approve', defaultMessage: 'Approve' },
  reviewRefuse: { id: 'control.review.refuse', defaultMessage: 'Refuse' },
  reviewExport: { id: 'control.review.export', defaultMessage: 'Export' },
  reviewSelectVisible: {
    id: 'control.review.selectVisible',
    defaultMessage: 'Select visible',
  },
  reviewColumnName: { id: 'control.review.columnName', defaultMessage: 'Name' },
  reviewColumnStatus: { id: 'control.review.columnStatus', defaultMessage: 'Status' },
  reviewColumnSubmitted: { id: 'control.review.columnSubmitted', defaultMessage: 'Submitted' },
  reviewSelectRow: {
    id: 'control.review.selectRow',
    defaultMessage: 'Select {displayName}',
  },
  reviewIdLabel: { id: 'control.review.idLabel', defaultMessage: 'ID: {entrantId}' },
  reviewContact: { id: 'control.review.contact', defaultMessage: 'Contact' },
  reviewTeamMembers: { id: 'control.review.teamMembers', defaultMessage: 'Team members' },
  reviewTeamMembersUnavailable: {
    id: 'control.review.teamMembersUnavailable',
    defaultMessage: 'Not available in this response',
  },
  reviewExperience: { id: 'control.review.experience', defaultMessage: 'Experience' },
  reviewMessage: { id: 'control.review.message', defaultMessage: 'Message' },
  reviewEditMembers: { id: 'control.review.editMembers', defaultMessage: 'Edit members' },
  reviewRevoke: { id: 'control.review.revoke', defaultMessage: 'Revoke' },
  reviewEmptyFilter: {
    id: 'control.review.emptyFilter',
    defaultMessage: 'There are no registrations for this filter.',
  },
  reviewPagination: {
    id: 'control.review.pagination',
    defaultMessage: 'Page {page} of {pageCount}',
  },
  reviewNationalityLabel: {
    id: 'control.review.nationalityLabel',
    defaultMessage: 'Nationality',
  },
  reviewNationalityNone: { id: 'control.review.nationalityNone', defaultMessage: 'Not set' },
  reviewSaveNationality: { id: 'control.review.saveNationality', defaultMessage: 'Save' },
  reviewUploadPhoto: { id: 'control.review.uploadPhoto', defaultMessage: 'Upload photo' },
  reviewViewProfile: { id: 'control.review.viewProfile', defaultMessage: 'View profile' },

  // AbbreviationReviewSection.tsx
  abbreviationReviewSectionLabel: {
    id: 'control.abbreviationReview.sectionLabel',
    defaultMessage: 'Entrants needing an abbreviation',
  },
  abbreviationReviewTitle: {
    id: 'control.abbreviationReview.title',
    defaultMessage: 'Entrants needing an abbreviation',
  },
  abbreviationReviewEmpty: {
    id: 'control.abbreviationReview.empty',
    defaultMessage: 'Every entrant already has an abbreviation.',
  },
  abbreviationReviewInputLabel: {
    id: 'control.abbreviationReview.inputLabel',
    defaultMessage: 'Abbreviation for {displayName}',
  },
  abbreviationReviewSet: { id: 'control.abbreviationReview.set', defaultMessage: 'Set' },
  abbreviationReviewFormatError: {
    id: 'control.abbreviationReview.formatError',
    defaultMessage:
      'Uppercase letters and digits only, separated by single spaces, up to {maxLength} characters.',
  },
  abbreviationReviewSetFailed: {
    id: 'control.abbreviationReview.setFailed',
    defaultMessage: 'Could not set the abbreviation.',
  },

  // CountrySelect.tsx
  countrySelectLabel: { id: 'control.country.label', defaultMessage: 'Country' },
  countrySelectSearchPlaceholder: {
    id: 'control.country.searchPlaceholder',
    defaultMessage: 'Search country…',
  },

  // PersonProfileRoute.tsx
  personProfileTitle: { id: 'control.personProfile.title', defaultMessage: 'Person profile' },
  personProfileLoading: {
    id: 'control.personProfile.loading',
    defaultMessage: 'Loading profile…',
  },
  personProfileLoadFailed: {
    id: 'control.personProfile.loadFailed',
    defaultMessage: 'Could not load this profile.',
  },
  personProfilePhotoAlt: {
    id: 'control.personProfile.photoAlt',
    defaultMessage: '{displayName}’s photo',
  },
  personProfilePhotoPlaceholderAlt: {
    id: 'control.personProfile.photoPlaceholderAlt',
    defaultMessage: 'No photo uploaded',
  },
  personProfileNaturalKeyLabel: {
    id: 'control.personProfile.naturalKeyLabel',
    defaultMessage: 'Document',
  },
  personProfileNaturalKeyUnavailable: {
    id: 'control.personProfile.naturalKeyUnavailable',
    defaultMessage: 'Not recorded',
  },
  personProfileNationalityLabel: {
    id: 'control.personProfile.nationalityLabel',
    defaultMessage: 'Nationality',
  },
  personProfileBack: {
    id: 'control.personProfile.back',
    defaultMessage: 'Back to registrations',
  },

  // JerseyGrid.tsx
  jerseyGridEmblemAlt: { id: 'control.jerseyGrid.emblemAlt', defaultMessage: 'Club emblem' },
  jerseyGridEmblemPlaceholderAlt: {
    id: 'control.jerseyGrid.emblemPlaceholderAlt',
    defaultMessage: 'No emblem',
  },

  // RolesPermissionsRoute.tsx, RolesPermissionsPage.tsx
  rolesLoadFailed: {
    id: 'control.roles.loadFailed',
    defaultMessage: 'Could not load the users.',
  },
  rolesChangeFailed: {
    id: 'control.roles.changeFailed',
    defaultMessage: 'Could not apply the change.',
  },
  rolesSectionLabel: { id: 'control.roles.sectionLabel', defaultMessage: 'Roles and permissions' },
  rolesBreadcrumb: {
    id: 'control.roles.breadcrumb',
    defaultMessage: '{organizationAlias} / Organization',
  },
  rolesTitle: { id: 'control.roles.title', defaultMessage: 'Roles and permissions' },
  rolesAddRecipient: { id: 'control.roles.addRecipient', defaultMessage: 'Add recipient' },
  rolesColumnUser: { id: 'control.roles.columnUser', defaultMessage: 'User' },
  rolesColumnRole: { id: 'control.roles.columnRole', defaultMessage: 'Role' },
  rolesColumnStatus: { id: 'control.roles.columnStatus', defaultMessage: 'Status' },
  rolesColumnActions: { id: 'control.roles.columnActions', defaultMessage: 'Actions' },
  rolesLoading: { id: 'control.roles.loading', defaultMessage: 'Loading users...' },
  rolesEmpty: { id: 'control.roles.empty', defaultMessage: 'No users are assigned.' },
  rolesRoleOf: { id: 'control.roles.roleOf', defaultMessage: 'Role of {email}' },
  rolesStatusOf: { id: 'control.roles.statusOf', defaultMessage: 'Status of {email}' },
  rolesActive: { id: 'control.roles.active', defaultMessage: 'Active' },
  rolesInactive: { id: 'control.roles.inactive', defaultMessage: 'Inactive' },
  rolesDeleteOf: { id: 'control.roles.deleteOf', defaultMessage: 'Delete {email}' },
  rolesDelete: { id: 'control.roles.delete', defaultMessage: 'Delete' },
  rolesLastActiveAdminNotice: {
    id: 'control.roles.lastActiveAdminNotice',
    defaultMessage: 'This organization must always keep at least one active admin.',
  },
  rolesRoleAdmin: { id: 'control.roles.role.admin', defaultMessage: 'Admin' },
  rolesRoleClubAdmin: { id: 'control.roles.role.clubAdmin', defaultMessage: 'Club admin' },
  rolesRoleReferee: { id: 'control.roles.role.referee', defaultMessage: 'Referee' },
  rolesRoleBroadcaster: { id: 'control.roles.role.broadcaster', defaultMessage: 'Broadcast' },
  rolesRoleViewer: { id: 'control.roles.role.viewer', defaultMessage: 'Viewer' },
  rolesInviteDialogClose: { id: 'control.roles.inviteDialog.close', defaultMessage: 'Close' },
  rolesInviteDialogEmail: { id: 'control.roles.inviteDialog.email', defaultMessage: 'Email' },
  rolesInviteDialogRole: { id: 'control.roles.inviteDialog.role', defaultMessage: 'Role' },
  rolesInviteDialogRoleAriaLabel: {
    id: 'control.roles.inviteDialog.roleAriaLabel',
    defaultMessage: 'Invitation role',
  },
  rolesInviteDialogActiveOnAccept: {
    id: 'control.roles.inviteDialog.activeOnAccept',
    defaultMessage: 'Active once accepted',
  },
  rolesInviteDialogCancel: { id: 'control.roles.inviteDialog.cancel', defaultMessage: 'Cancel' },
  rolesInviteDialogSubmit: {
    id: 'control.roles.inviteDialog.submit',
    defaultMessage: 'Send invitation',
  },

  // Wizard steps (lib/wizard.ts WIZARD_STEPS)
  wizardStepName: { id: 'control.wizard.step.name', defaultMessage: 'Name' },
  wizardStepDiscipline: { id: 'control.wizard.step.discipline', defaultMessage: 'Discipline' },
  wizardStepFormat: { id: 'control.wizard.step.format', defaultMessage: 'Format' },
  wizardStepRules: { id: 'control.wizard.step.rules', defaultMessage: 'Event rules' },
  wizardStepWindow: { id: 'control.wizard.step.window', defaultMessage: 'Window' },

  // Wizard validation problems (lib/wizard.ts stepProblems)
  wizardProblemMissingName: {
    id: 'control.wizard.problem.missingName',
    defaultMessage: 'The name is missing',
  },
  wizardProblemAliasFormat: {
    id: 'control.wizard.problem.aliasFormat',
    defaultMessage: 'The alias uses lowercase letters and hyphens',
  },
  wizardProblemChooseDiscipline: {
    id: 'control.wizard.problem.chooseDiscipline',
    defaultMessage: 'Choose a discipline',
  },
  wizardProblemChooseFormat: {
    id: 'control.wizard.problem.chooseFormat',
    defaultMessage: 'Choose a format',
  },
  wizardProblemFormatNotSupported: {
    id: 'control.wizard.problem.formatNotSupported',
    defaultMessage: 'The chosen discipline does not support that format',
  },
  wizardProblemSeriesOnPlacementFormat: {
    id: 'control.wizard.problem.seriesOnPlacementFormat',
    defaultMessage:
      'This format ranks every entrant rather than pitting two against each other, so it cannot be settled by a series',
  },
  wizardProblemSeriesSpan: {
    id: 'control.wizard.problem.seriesSpan',
    defaultMessage: 'A series spans at least two matches',
  },
  wizardProblemSeriesEvenBestOf: {
    id: 'control.wizard.problem.seriesEvenBestOf',
    defaultMessage:
      'A best-of series needs an odd number of matches so one side can win the majority. Use Aggregate or Points per leg for an even number.',
  },
  wizardProblemMinParticipants: {
    id: 'control.wizard.problem.minParticipants',
    defaultMessage: 'A tournament needs at least two participants',
  },
  wizardProblemChooseAction: {
    id: 'control.wizard.problem.chooseAction',
    defaultMessage: 'Choose an action for the event rule',
  },
  wizardProblemCompleteRule: {
    id: 'control.wizard.problem.completeRule',
    defaultMessage: 'Complete required rule values using the accepted schema',
  },

  // TournamentSetupWizard.tsx
  wizardBreadcrumb: {
    id: 'control.wizard.breadcrumb',
    defaultMessage: 'Tournaments > New',
  },
  wizardTitle: { id: 'control.wizard.title', defaultMessage: 'Create tournament' },
  wizardConfigured: { id: 'control.wizard.configured', defaultMessage: 'configured' },
  wizardSteps: { id: 'control.wizard.steps', defaultMessage: 'Steps' },
  wizardFieldName: { id: 'control.wizard.field.name', defaultMessage: 'Name' },
  wizardFieldAlias: { id: 'control.wizard.field.alias', defaultMessage: 'Alias' },
  wizardFieldDiscipline: { id: 'control.wizard.field.discipline', defaultMessage: 'Discipline' },
  wizardFieldFormat: { id: 'control.wizard.field.format', defaultMessage: 'Format' },
  wizardEnableSeries: {
    id: 'control.wizard.series.enable',
    defaultMessage: 'Settle each cross with a series of matches',
  },
  wizardSeriesHelp: {
    id: 'control.wizard.series.help',
    defaultMessage:
      'Leave this off to play one match per cross. Turning it on schedules several matches between the same two sides and decides the cross from all of them together.',
  },
  wizardFieldSeriesSpan: {
    id: 'control.wizard.field.seriesSpan',
    defaultMessage: 'Matches per series',
  },
  wizardFieldSeriesResolutionClass: {
    id: 'control.wizard.field.seriesResolutionClass',
    defaultMessage: 'Decided by',
  },
  wizardSeriesClassBestOf: {
    id: 'control.wizard.series.class.bestOf',
    defaultMessage: 'Best of — first side to win the majority',
  },
  wizardSeriesClassAggregate: {
    id: 'control.wizard.series.class.aggregate',
    defaultMessage: 'Aggregate — scores from every match added together',
  },
  wizardSeriesClassPointsPerLeg: {
    id: 'control.wizard.series.class.pointsPerLeg',
    defaultMessage: 'Points per leg — each match awards points',
  },
  wizardFieldSeriesNeutralGround: {
    id: 'control.wizard.field.seriesNeutralGround',
    defaultMessage: 'Played on neutral ground (no home and away)',
  },
  wizardFieldSeriesStandingsAccounting: {
    id: 'control.wizard.field.seriesStandingsAccounting',
    defaultMessage: 'Counts towards standings as',
  },
  wizardSeriesAccountingMatch: {
    id: 'control.wizard.series.accounting.match',
    defaultMessage:
      'One result per match — every game in the series adds its own win, draw or loss to the standings table',
  },
  wizardSeriesAccountingSeries: {
    id: 'control.wizard.series.accounting.series',
    defaultMessage:
      'One result per series — the whole series adds a single win, draw or loss to the standings table, however many games it took',
  },
  wizardEnableCustomRule: {
    id: 'control.wizard.rule.enable',
    defaultMessage: 'Add rule for every recorded event',
  },
  wizardRuleHookHelp: {
    id: 'control.wizard.rule.hookHelp',
    defaultMessage: 'Runs synchronously at event.recorded using vocabulary accepted by server.',
  },
  wizardRuleCondition: { id: 'control.wizard.rule.condition', defaultMessage: 'Condition' },
  wizardRuleAction: { id: 'control.wizard.rule.action', defaultMessage: 'Action' },
  wizardRuleChooseAction: {
    id: 'control.wizard.rule.chooseAction',
    defaultMessage: 'Choose action',
  },
  wizardRuleConditionAlways: {
    id: 'control.wizard.rule.conditionAlways',
    defaultMessage: 'No condition — run for every event',
  },
  wizardRuleConditionlessExplanation: {
    id: 'control.wizard.rule.conditionlessExplanation',
    defaultMessage: 'Without a condition, this rule fires for every recorded event.',
  },
  wizardRuleOptions: { id: 'control.wizard.rule.options', defaultMessage: 'Options (JSON)' },
  wizardRuleAddAnother: {
    id: 'control.wizard.rule.addAnother',
    defaultMessage: 'Add another rule',
  },
  wizardRuleRemove: { id: 'control.wizard.rule.remove', defaultMessage: 'Remove' },
  wizardFieldRegion: { id: 'control.wizard.field.region', defaultMessage: 'Region' },
  wizardFieldCapacity: { id: 'control.wizard.field.capacity', defaultMessage: 'Capacity' },
  wizardFieldProfile: {
    id: 'control.wizard.field.profile',
    defaultMessage: 'Competition Profile',
  },
  wizardProfileNone: {
    id: 'control.wizard.profile.none',
    defaultMessage: 'None (Single stage)',
  },
  wizardFieldCheckInClosesAt: {
    id: 'control.wizard.field.checkInClosesAt',
    defaultMessage: 'Check-in Deadline',
  },
  wizardPublicRegistration: {
    id: 'control.wizard.publicRegistration',
    defaultMessage: 'Open public registration',
  },
  wizardRequiresCheckIn: {
    id: 'control.wizard.requiresCheckIn',
    defaultMessage: 'Requires check-in',
  },
  wizardBack: { id: 'control.wizard.back', defaultMessage: 'Back' },
  wizardCreate: { id: 'control.wizard.create', defaultMessage: 'Create tournament' },
  wizardContinue: { id: 'control.wizard.continue', defaultMessage: 'Continue' },

  // Standings (components/StandingsPage.tsx)
  standingsSectionLabel: { id: 'control.standings.sectionLabel', defaultMessage: 'Standings' },
  standingsTitle: { id: 'control.standings.title', defaultMessage: 'Standings' },
  standingsProjectionVersion: {
    id: 'control.standings.projectionVersion',
    defaultMessage: 'Projection v{version}',
  },
  standingsUnresolvedTie: {
    id: 'control.standings.unresolvedTie',
    defaultMessage: ' · unresolved tie',
  },
  standingsParticipant: { id: 'control.standings.participant', defaultMessage: 'Participant' },
  standingsTiebreak: { id: 'control.standings.tiebreak', defaultMessage: 'Tiebreak' },
  standingsNoTiebreak: {
    id: 'control.standings.noTiebreak',
    defaultMessage: 'No tiebreak comparator intervened at this position.',
  },
  standingsNoResultsYet: {
    id: 'control.standings.noResultsYet',
    defaultMessage: 'There are no results in this stage yet.',
  },
  standingsTraceFetchFailed: {
    id: 'control.standings.traceFetchFailed',
    defaultMessage: 'Could not retrieve the rules engine trace.',
  },
  standingsTraceLoading: {
    id: 'control.standings.traceLoading',
    defaultMessage: 'Retrieving the trace…',
  },
  standingsTraceOpenRow: {
    id: 'control.standings.traceOpenRow',
    defaultMessage: 'Open the row to see the trace.',
  },
  standingsTraceNoComparators: {
    id: 'control.standings.traceNoComparators',
    defaultMessage: 'The engine recorded no comparators.',
  },
  standingsTraceAriaLabel: {
    id: 'control.standings.traceAriaLabel',
    defaultMessage: 'Tiebreak trace',
  },
  standingsTraceTitle: { id: 'control.standings.traceTitle', defaultMessage: 'Tiebreak trace' },
  standingsDistributionAriaLabel: {
    id: 'control.standings.distributionAriaLabel',
    defaultMessage: 'Points distribution',
  },
  standingsDistributionTitle: {
    id: 'control.standings.distributionTitle',
    defaultMessage: 'Points distribution · Top {count}',
  },
  standingsDistributionEmpty: {
    id: 'control.standings.distributionEmpty',
    defaultMessage: 'No data to chart.',
  },
  standingsSharedRank: { id: 'control.standings.sharedRank', defaultMessage: 'Shared position' },
  standingsTieBroken: { id: 'control.standings.tieBroken', defaultMessage: 'Tiebreak applied' },
  standingsExportCsv: { id: 'control.standings.exportCsv', defaultMessage: 'Export CSV' },
  standingsNoLayouts: {
    id: 'control.standings.noLayouts',
    defaultMessage: 'This discipline declares no tables for this tournament.',
  },
  standingsGroupSelector: { id: 'control.standings.groupSelector', defaultMessage: 'Group' },
  standingsGrainSeries: {
    id: 'control.standings.grain.series',
    defaultMessage: 'This table counts one result per series.',
  },
  standingsGrainMatch: {
    id: 'control.standings.grain.match',
    defaultMessage: 'This table counts one result per played match.',
  },
  standingsColumnSeriesLabel: {
    id: 'control.standings.column.series.label',
    defaultMessage: 'Series',
  },
  standingsColumnSeriesShortLabel: {
    id: 'control.standings.column.series.shortLabel',
    defaultMessage: 'S',
  },

  // Zone/Group management, entrant assignment, and promotion plans.
  zoneGroupLoading: { id: 'control.zoneGroup.loading', defaultMessage: 'Loading…' },
  zoneGroupLoadFailed: {
    id: 'control.zoneGroup.loadFailed',
    defaultMessage: 'Could not load zones and groups.',
  },
  zoneGroupSaveFailed: {
    id: 'control.zoneGroup.saveFailed',
    defaultMessage: 'The request was refused.',
  },
  zoneGroupSectionLabel: {
    id: 'control.zoneGroup.sectionLabel',
    defaultMessage: 'Zones and groups',
  },
  zoneGroupBreadcrumb: {
    id: 'control.zoneGroup.breadcrumb',
    defaultMessage: '{tournamentAlias} · Stage {stageNumber}',
  },
  zoneGroupTitle: { id: 'control.zoneGroup.title', defaultMessage: 'Zones and groups' },
  zoneGroupZonesHeading: { id: 'control.zoneGroup.zonesHeading', defaultMessage: 'Zones' },
  zoneGroupNewZoneName: { id: 'control.zoneGroup.newZoneName', defaultMessage: 'New zone name' },
  zoneGroupAddZone: { id: 'control.zoneGroup.addZone', defaultMessage: 'Add zone' },
  zoneGroupAssignZonesHeading: {
    id: 'control.zoneGroup.assignZonesHeading',
    defaultMessage: 'Assign entrants to zones',
  },
  zoneGroupAutomaticDraw: {
    id: 'control.zoneGroup.automaticDraw',
    defaultMessage: 'Automatic draw',
  },
  zoneGroupManualPlacement: {
    id: 'control.zoneGroup.manualPlacement',
    defaultMessage: 'Manual placement',
  },
  zoneGroupZoneCount: { id: 'control.zoneGroup.zoneCount', defaultMessage: 'Number of zones' },
  zoneGroupGroupCount: { id: 'control.zoneGroup.groupCount', defaultMessage: 'Number of groups' },
  zoneGroupSeed: { id: 'control.zoneGroup.seed', defaultMessage: 'Draw seed' },
  zoneGroupPreviewDraw: { id: 'control.zoneGroup.previewDraw', defaultMessage: 'Preview draw' },
  zoneGroupConfirmDraw: { id: 'control.zoneGroup.confirmDraw', defaultMessage: 'Confirm draw' },
  zoneGroupPlacementNumber: {
    id: 'control.zoneGroup.placementNumber',
    defaultMessage: '{name} — number',
  },
  zoneGroupSaveAssignment: {
    id: 'control.zoneGroup.saveAssignment',
    defaultMessage: 'Save assignment',
  },
  zoneGroupPreviewResult: {
    id: 'control.zoneGroup.previewResult',
    defaultMessage: 'Preview ready — {count} entrant(s) assigned.',
  },
  zoneGroupAssignmentSaved: {
    id: 'control.zoneGroup.assignmentSaved',
    defaultMessage: 'Assignment saved.',
  },
  zoneGroupSelectZone: { id: 'control.zoneGroup.selectZone', defaultMessage: 'Zone' },
  zoneGroupGroupsHeading: { id: 'control.zoneGroup.groupsHeading', defaultMessage: 'Groups' },
  zoneGroupNewGroupName: { id: 'control.zoneGroup.newGroupName', defaultMessage: 'New group name' },
  zoneGroupAddGroup: { id: 'control.zoneGroup.addGroup', defaultMessage: 'Add group' },
  zoneGroupAssignGroupsHeading: {
    id: 'control.zoneGroup.assignGroupsHeading',
    defaultMessage: 'Assign entrants to groups',
  },
  zoneGroupOpenPromotionPlan: {
    id: 'control.zoneGroup.openPromotionPlan',
    defaultMessage: 'Open promotion plan',
  },

  promotionLoading: { id: 'control.promotion.loading', defaultMessage: 'Loading…' },
  promotionSectionLabel: {
    id: 'control.promotion.sectionLabel',
    defaultMessage: 'Promotion plan',
  },
  promotionBreadcrumb: {
    id: 'control.promotion.breadcrumb',
    defaultMessage: '{tournamentAlias} · {zoneName}',
  },
  promotionTitle: { id: 'control.promotion.title', defaultMessage: 'Promotion plan' },
  promotionConfigHeading: {
    id: 'control.promotion.configHeading',
    defaultMessage: 'Configuration',
  },
  promotionNextStageNumber: {
    id: 'control.promotion.nextStageNumber',
    defaultMessage: 'Next stage number',
  },
  promotionPerGroupAdvance: {
    id: 'control.promotion.perGroupAdvance',
    defaultMessage: 'Entrants advancing per group',
  },
  promotionBandsHeading: {
    id: 'control.promotion.bandsHeading',
    defaultMessage: 'Bands (only if the next stage has more than one zone)',
  },
  promotionBandZoneRef: {
    id: 'control.promotion.bandZoneRef',
    defaultMessage: 'Destination zone name',
  },
  promotionBandCount: { id: 'control.promotion.bandCount', defaultMessage: 'Count' },
  promotionRemoveBand: { id: 'control.promotion.removeBand', defaultMessage: 'Remove band' },
  promotionAddBand: { id: 'control.promotion.addBand', defaultMessage: 'Add band' },
  promotionSavePlan: { id: 'control.promotion.savePlan', defaultMessage: 'Save promotion plan' },
  promotionReviewHeading: {
    id: 'control.promotion.reviewHeading',
    defaultMessage: 'Review — computed candidate order',
  },
  promotionPlanSaved: { id: 'control.promotion.planSaved', defaultMessage: 'Plan saved.' },
  promotionSaveFailed: {
    id: 'control.promotion.saveFailed',
    defaultMessage: 'The plan was refused.',
  },
  promotionNoPlanYet: {
    id: 'control.promotion.noPlanYet',
    defaultMessage: 'No promotion plan saved for this zone yet.',
  },

  // Post-login landing (ControlApp.tsx's LoginLanding)
  landingEmptyTitle: { id: 'control.landing.emptyTitle', defaultMessage: 'No organizations yet' },
  landingEmptyBody: {
    id: 'control.landing.emptyBody',
    defaultMessage:
      'This account has no role in any organization yet. An administrator needs to send an invitation.',
  },
  landingPickerTitle: {
    id: 'control.landing.pickerTitle',
    defaultMessage: 'Choose an organization',
  },

  // Load match data — bulk/structured entry for a match played with no live console.
  loadMatchDataTitle: { id: 'control.loadMatchData.title', defaultMessage: 'Load match data' },
  loadMatchDataBreadcrumb: {
    id: 'control.loadMatchData.breadcrumb',
    defaultMessage: '{tournamentAlias} · Match {matchId}',
  },
  loadMatchDataSectionLabel: {
    id: 'control.loadMatchData.sectionLabel',
    defaultMessage: 'Load match data',
  },
  loadMatchDataLoading: { id: 'control.loadMatchData.loading', defaultMessage: 'Loading…' },
  loadMatchDataLoadFailed: {
    id: 'control.loadMatchData.loadFailed',
    defaultMessage: 'Could not load this match.',
  },
  loadMatchDataForbidden: {
    id: 'control.loadMatchData.forbidden',
    defaultMessage: 'You do not hold the capabilities this screen requires for this match.',
  },
  loadMatchDataNotScheduled: {
    id: 'control.loadMatchData.notScheduled',
    defaultMessage:
      'This match already has recorded activity or a result. Use the live console instead — ' +
      'bulk-loading here would create a second, conflicting event history.',
  },
  loadMatchDataRosterHeading: {
    id: 'control.loadMatchData.rosterHeading',
    defaultMessage: 'Roster',
  },
  loadMatchDataRosterCandidatesLoading: {
    id: 'control.loadMatchData.rosterCandidatesLoading',
    defaultMessage: 'Loading roster candidates…',
  },
  loadMatchDataSegmentsHeading: {
    id: 'control.loadMatchData.segmentsHeading',
    defaultMessage: 'Segments',
  },
  loadMatchDataAddSegment: {
    id: 'control.loadMatchData.addSegment',
    defaultMessage: 'Add segment',
  },
  loadMatchDataRemoveSegment: {
    id: 'control.loadMatchData.removeSegment',
    defaultMessage: 'Remove segment',
  },
  loadMatchDataSegmentType: {
    id: 'control.loadMatchData.segmentType',
    defaultMessage: 'Type',
  },
  loadMatchDataSegmentTypePlaceholder: {
    id: 'control.loadMatchData.segmentTypePlaceholder',
    defaultMessage: 'e.g. half, period, set',
  },
  loadMatchDataSegmentElapsedSeconds: {
    id: 'control.loadMatchData.segmentElapsedSeconds',
    defaultMessage: 'Duration (seconds)',
  },
  loadMatchDataEventsHeading: {
    id: 'control.loadMatchData.eventsHeading',
    defaultMessage: 'Events',
  },
  loadMatchDataAddEvent: { id: 'control.loadMatchData.addEvent', defaultMessage: 'Add event' },
  loadMatchDataRemoveEvent: {
    id: 'control.loadMatchData.removeEvent',
    defaultMessage: 'Remove event',
  },
  loadMatchDataMoveEventUp: {
    id: 'control.loadMatchData.moveEventUp',
    defaultMessage: 'Move up',
  },
  loadMatchDataMoveEventDown: {
    id: 'control.loadMatchData.moveEventDown',
    defaultMessage: 'Move down',
  },
  loadMatchDataEventDefinition: {
    id: 'control.loadMatchData.eventDefinition',
    defaultMessage: 'Event',
  },
  loadMatchDataEventSegment: {
    id: 'control.loadMatchData.eventSegment',
    defaultMessage: 'Segment',
  },
  loadMatchDataEventOccurredAt: {
    id: 'control.loadMatchData.eventOccurredAt',
    defaultMessage: 'When',
  },
  loadMatchDataEventSide: { id: 'control.loadMatchData.eventSide', defaultMessage: 'Side' },
  loadMatchDataEventPerson: { id: 'control.loadMatchData.eventPerson', defaultMessage: 'Person' },
  loadMatchDataEventNoAttribution: {
    id: 'control.loadMatchData.eventNoAttribution',
    defaultMessage: 'No attribution',
  },
  loadMatchDataEventNotes: { id: 'control.loadMatchData.eventNotes', defaultMessage: 'Notes' },
  loadMatchDataNoEvents: {
    id: 'control.loadMatchData.noEvents',
    defaultMessage: 'No events yet. Add one, or import a CSV below.',
  },
  loadMatchDataResultHeading: {
    id: 'control.loadMatchData.resultHeading',
    defaultMessage: 'Result',
  },
  loadMatchDataWinner: { id: 'control.loadMatchData.winner', defaultMessage: 'Winner' },
  loadMatchDataNoWinnerDraw: {
    id: 'control.loadMatchData.noWinnerDraw',
    defaultMessage: 'No winner / draw',
  },
  loadMatchDataSubmit: { id: 'control.loadMatchData.submit', defaultMessage: 'Submit match data' },
  loadMatchDataSubmitting: {
    id: 'control.loadMatchData.submitting',
    defaultMessage: 'Submitting…',
  },
  loadMatchDataSubmitSucceeded: {
    id: 'control.loadMatchData.submitSucceeded',
    defaultMessage: 'Match loaded and finalized — {eventCount} event(s) recorded.',
  },
  loadMatchDataSubmitFailed: {
    id: 'control.loadMatchData.submitFailed',
    defaultMessage:
      'Submission was refused. Nothing was recorded — fix the entry below and resubmit.',
  },
  loadMatchDataBackToConsole: {
    id: 'control.loadMatchData.backToConsole',
    defaultMessage: 'Open match console',
  },
  loadMatchDataCsvHeading: {
    id: 'control.loadMatchData.csvHeading',
    defaultMessage: 'Import from CSV',
  },
  loadMatchDataCsvHelp: {
    id: 'control.loadMatchData.csvHelp',
    defaultMessage:
      'Loads a spreadsheet into the builder above for review — nothing submits until you review ' +
      'and press "Submit match data" yourself.',
  },
  loadMatchDataCsvChooseFile: {
    id: 'control.loadMatchData.csvChooseFile',
    defaultMessage: 'Choose CSV file',
  },
  loadMatchDataCsvDownloadTemplate: {
    id: 'control.loadMatchData.csvDownloadTemplate',
    defaultMessage: 'Download template',
  },
  loadMatchDataCsvErrorsHeading: {
    id: 'control.loadMatchData.csvErrorsHeading',
    defaultMessage: '{count} problem(s) found — fix these in the spreadsheet and re-import.',
  },
  loadMatchDataCsvLoaded: {
    id: 'control.loadMatchData.csvLoaded',
    defaultMessage: 'CSV loaded into the builder below for review.',
  },

  // Club management — the first club-related screen in the app.
  clubManagementSectionLabel: {
    id: 'control.clubManagement.sectionLabel',
    defaultMessage: 'Club management',
  },
  clubManagementTitle: { id: 'control.clubManagement.title', defaultMessage: 'Clubs' },
  clubManagementLoading: { id: 'control.clubManagement.loading', defaultMessage: 'Loading…' },
  clubManagementLoadFailed: {
    id: 'control.clubManagement.loadFailed',
    defaultMessage: 'Could not load clubs.',
  },
  clubManagementSaveFailed: {
    id: 'control.clubManagement.saveFailed',
    defaultMessage: 'The request was refused.',
  },
  clubManagementEmpty: {
    id: 'control.clubManagement.empty',
    defaultMessage: 'This organization has no clubs yet.',
  },
  clubManagementEdit: { id: 'control.clubManagement.edit', defaultMessage: 'Edit' },
  clubManagementNewClubName: {
    id: 'control.clubManagement.newClubName',
    defaultMessage: 'New club name',
  },
  clubManagementNewClubAlias: {
    id: 'control.clubManagement.newClubAlias',
    defaultMessage: 'Alias (optional)',
  },
  clubManagementNewClubAbbreviation: {
    id: 'control.clubManagement.newClubAbbreviation',
    defaultMessage: 'Abbreviation (optional)',
  },
  clubManagementAddClub: { id: 'control.clubManagement.addClub', defaultMessage: 'Add club' },
  clubManagementEditHeading: {
    id: 'control.clubManagement.editHeading',
    defaultMessage: 'Edit club',
  },
  clubManagementName: { id: 'control.clubManagement.name', defaultMessage: 'Name' },
  clubManagementAlias: { id: 'control.clubManagement.alias', defaultMessage: 'Alias' },
  clubManagementAbbreviation: {
    id: 'control.clubManagement.abbreviation',
    defaultMessage: 'Abbreviation',
  },
  clubManagementSaveChanges: {
    id: 'control.clubManagement.saveChanges',
    defaultMessage: 'Save changes',
  },
  clubManagementUploadEmblem: {
    id: 'control.clubManagement.uploadEmblem',
    defaultMessage: 'Upload emblem',
  },
  clubManagementEmblemAlt: {
    id: 'control.clubManagement.emblemAlt',
    defaultMessage: '{name} emblem',
  },
  clubManagementEmblemPlaceholderAlt: {
    id: 'control.clubManagement.emblemPlaceholderAlt',
    defaultMessage: 'No emblem uploaded',
  },
  clubManagementSaved: { id: 'control.clubManagement.saved', defaultMessage: 'Changes saved.' },
  clubManagementCreated: { id: 'control.clubManagement.created', defaultMessage: 'Club created.' },
  clubManagementEmblemUploaded: {
    id: 'control.clubManagement.emblemUploaded',
    defaultMessage: 'Emblem uploaded.',
  },

  // Venue/official management — the resource pool a schedule assigns from.
  resourceManagementSectionLabel: {
    id: 'control.resourceManagement.sectionLabel',
    defaultMessage: 'Venue and official management',
  },
  resourceManagementTitle: {
    id: 'control.resourceManagement.title',
    defaultMessage: 'Venues & officials',
  },
  resourceManagementLoading: {
    id: 'control.resourceManagement.loading',
    defaultMessage: 'Loading…',
  },
  resourceManagementLoadFailed: {
    id: 'control.resourceManagement.loadFailed',
    defaultMessage: 'Could not load venues and officials.',
  },
  resourceManagementSaveFailed: {
    id: 'control.resourceManagement.saveFailed',
    defaultMessage: 'The request was refused.',
  },
  resourceManagementVenuesHeading: {
    id: 'control.resourceManagement.venuesHeading',
    defaultMessage: 'Venues',
  },
  resourceManagementVenuesEmpty: {
    id: 'control.resourceManagement.venuesEmpty',
    defaultMessage: 'This organization has no venues yet.',
  },
  resourceManagementOfficialsHeading: {
    id: 'control.resourceManagement.officialsHeading',
    defaultMessage: 'Officials',
  },
  resourceManagementOfficialsEmpty: {
    id: 'control.resourceManagement.officialsEmpty',
    defaultMessage: 'This organization has no officials yet.',
  },
  resourceManagementEdit: { id: 'control.resourceManagement.edit', defaultMessage: 'Edit' },
  resourceManagementNewVenueName: {
    id: 'control.resourceManagement.newVenueName',
    defaultMessage: 'New venue name',
  },
  resourceManagementNewVenueAlias: {
    id: 'control.resourceManagement.newVenueAlias',
    defaultMessage: 'Alias',
  },
  resourceManagementNewVenueCapacity: {
    id: 'control.resourceManagement.newVenueCapacity',
    defaultMessage: 'Concurrent capacity',
  },
  resourceManagementAddVenue: {
    id: 'control.resourceManagement.addVenue',
    defaultMessage: 'Add venue',
  },
  resourceManagementEditVenueHeading: {
    id: 'control.resourceManagement.editVenueHeading',
    defaultMessage: 'Edit venue',
  },
  resourceManagementVenueName: {
    id: 'control.resourceManagement.venueName',
    defaultMessage: 'Name',
  },
  resourceManagementVenueCapacity: {
    id: 'control.resourceManagement.venueCapacity',
    defaultMessage: 'Concurrent capacity',
  },
  resourceManagementVenueAddress: {
    id: 'control.resourceManagement.venueAddress',
    defaultMessage: 'Address (optional)',
  },
  resourceManagementDetailsHeading: {
    id: 'control.resourceManagement.detailsHeading',
    defaultMessage: 'Details',
  },
  resourceManagementDetailsHint: {
    id: 'control.resourceManagement.detailsHint',
    defaultMessage:
      'Free-form: an address, a playing surface, a server address, a region, a current map — ' +
      'whatever this venue needs recorded. Never validated.',
  },
  resourceManagementDetailKey: {
    id: 'control.resourceManagement.detailKey',
    defaultMessage: 'Detail name',
  },
  resourceManagementDetailValue: {
    id: 'control.resourceManagement.detailValue',
    defaultMessage: 'Value',
  },
  resourceManagementAddDetail: {
    id: 'control.resourceManagement.addDetail',
    defaultMessage: 'Add detail',
  },
  resourceManagementRemoveDetail: {
    id: 'control.resourceManagement.removeDetail',
    defaultMessage: 'Remove',
  },
  resourceManagementSaveVenueChanges: {
    id: 'control.resourceManagement.saveVenueChanges',
    defaultMessage: 'Save venue',
  },
  resourceManagementVenueSaved: {
    id: 'control.resourceManagement.venueSaved',
    defaultMessage: 'Venue saved.',
  },
  resourceManagementVenueCreated: {
    id: 'control.resourceManagement.venueCreated',
    defaultMessage: 'Venue created.',
  },
  resourceManagementNewOfficialName: {
    id: 'control.resourceManagement.newOfficialName',
    defaultMessage: 'New official name',
  },
  resourceManagementAddOfficial: {
    id: 'control.resourceManagement.addOfficial',
    defaultMessage: 'Add official',
  },
  resourceManagementEditOfficialHeading: {
    id: 'control.resourceManagement.editOfficialHeading',
    defaultMessage: 'Edit official',
  },
  resourceManagementOfficialName: {
    id: 'control.resourceManagement.officialName',
    defaultMessage: 'Name',
  },
  resourceManagementOfficialRoles: {
    id: 'control.resourceManagement.officialRoles',
    defaultMessage: 'Roles',
  },
  resourceManagementSaveOfficialChanges: {
    id: 'control.resourceManagement.saveOfficialChanges',
    defaultMessage: 'Save official',
  },
  resourceManagementOfficialSaved: {
    id: 'control.resourceManagement.officialSaved',
    defaultMessage: 'Official saved.',
  },
  resourceManagementOfficialCreated: {
    id: 'control.resourceManagement.officialCreated',
    defaultMessage: 'Official created.',
  },
  resourceManagementRoleReferee: {
    id: 'control.resourceManagement.roleReferee',
    defaultMessage: 'Referee',
  },
  resourceManagementRoleAssistant: {
    id: 'control.resourceManagement.roleAssistant',
    defaultMessage: 'Assistant',
  },
  resourceManagementRoleTableOfficial: {
    id: 'control.resourceManagement.roleTableOfficial',
    defaultMessage: 'Table official',
  },
  resourceManagementRoleObserver: {
    id: 'control.resourceManagement.roleObserver',
    defaultMessage: 'Observer',
  },
  resourceManagementSchedulesHeading: {
    id: 'control.resourceManagement.schedulesHeading',
    defaultMessage: 'Schedules',
  },
  resourceManagementSchedulesEmpty: {
    id: 'control.resourceManagement.schedulesEmpty',
    defaultMessage: 'This organization has no schedules yet.',
  },
  resourceManagementNewScheduleName: {
    id: 'control.resourceManagement.newScheduleName',
    defaultMessage: 'Schedule name',
  },
  resourceManagementNewScheduleStartsAt: {
    id: 'control.resourceManagement.newScheduleStartsAt',
    defaultMessage: 'Starts at',
  },
  resourceManagementNewScheduleEndsAt: {
    id: 'control.resourceManagement.newScheduleEndsAt',
    defaultMessage: 'Ends at',
  },
  resourceManagementNewScheduleSlotMinutes: {
    id: 'control.resourceManagement.newScheduleSlotMinutes',
    defaultMessage: 'Slot minutes',
  },
  resourceManagementNewScheduleTurnaroundMinutes: {
    id: 'control.resourceManagement.newScheduleTurnaroundMinutes',
    defaultMessage: 'Turnaround minutes',
  },
  resourceManagementNewScheduleVenues: {
    id: 'control.resourceManagement.newScheduleVenues',
    defaultMessage: 'Venues',
  },
  resourceManagementAddSchedule: {
    id: 'control.resourceManagement.addSchedule',
    defaultMessage: 'Add schedule',
  },
  resourceManagementScheduleCreated: {
    id: 'control.resourceManagement.scheduleCreated',
    defaultMessage: 'Schedule created.',
  },
  resourceManagementScheduleSaved: {
    id: 'control.resourceManagement.scheduleSaved',
    defaultMessage: 'Schedule saved.',
  },
  resourceManagementScheduleDeleted: {
    id: 'control.resourceManagement.scheduleDeleted',
    defaultMessage: 'Schedule removed.',
  },
  resourceManagementEditScheduleHeading: {
    id: 'control.resourceManagement.editScheduleHeading',
    defaultMessage: 'Edit schedule',
  },
  resourceManagementScheduleSlotsCount: {
    id: 'control.resourceManagement.scheduleSlotsCount',
    defaultMessage: '{count} slots generated',
  },
  resourceManagementSaveScheduleChanges: {
    id: 'control.resourceManagement.saveScheduleChanges',
    defaultMessage: 'Save schedule',
  },
  resourceManagementDeleteSchedule: {
    id: 'control.resourceManagement.deleteSchedule',
    defaultMessage: 'Delete schedule',
  },

  // Schedule builder — manual assignment of time, venue, and officials to a stage's fixtures.
  scheduleBuilderSectionLabel: {
    id: 'control.scheduleBuilder.sectionLabel',
    defaultMessage: 'Schedule builder',
  },
  scheduleBuilderTitle: { id: 'control.scheduleBuilder.title', defaultMessage: 'Schedule' },
  scheduleBuilderLoading: { id: 'control.scheduleBuilder.loading', defaultMessage: 'Loading…' },
  scheduleBuilderLoadFailed: {
    id: 'control.scheduleBuilder.loadFailed',
    defaultMessage: 'Could not load this stage’s schedule.',
  },
  scheduleBuilderSaveFailed: {
    id: 'control.scheduleBuilder.saveFailed',
    defaultMessage: 'The request was refused.',
  },
  scheduleBuilderCalendarViewLabel: {
    id: 'control.scheduleBuilder.calendarViewLabel',
    defaultMessage: 'Calendar view',
  },
  scheduleBuilderListViewLabel: {
    id: 'control.scheduleBuilder.listViewLabel',
    defaultMessage: 'List view',
  },
  scheduleBuilderNoFixtures: {
    id: 'control.scheduleBuilder.noFixtures',
    defaultMessage: 'This stage has no fixtures yet.',
  },
  scheduleBuilderUnassigned: {
    id: 'control.scheduleBuilder.unassigned',
    defaultMessage: 'Unassigned',
  },
  scheduleBuilderFixtureRound: {
    id: 'control.scheduleBuilder.fixtureRound',
    defaultMessage: 'Round {round}',
  },
  scheduleBuilderStartTime: {
    id: 'control.scheduleBuilder.startTime',
    defaultMessage: 'Start time',
  },
  scheduleBuilderDuration: {
    id: 'control.scheduleBuilder.duration',
    defaultMessage: 'Duration (minutes)',
  },
  scheduleBuilderVenue: { id: 'control.scheduleBuilder.venue', defaultMessage: 'Venue' },
  scheduleBuilderNoVenue: { id: 'control.scheduleBuilder.noVenue', defaultMessage: 'No venue' },
  scheduleBuilderOfficials: {
    id: 'control.scheduleBuilder.officials',
    defaultMessage: 'Officials',
  },
  scheduleBuilderPreview: {
    id: 'control.scheduleBuilder.preview',
    defaultMessage: 'Preview',
  },
  scheduleBuilderPublish: {
    id: 'control.scheduleBuilder.publish',
    defaultMessage: 'Publish',
  },
  scheduleBuilderPublished: {
    id: 'control.scheduleBuilder.published',
    defaultMessage: 'Schedule published.',
  },
  scheduleBuilderConflictsHeading: {
    id: 'control.scheduleBuilder.conflictsHeading',
    defaultMessage: 'Conflicts',
  },
  scheduleBuilderAffectedPublishedHeading: {
    id: 'control.scheduleBuilder.affectedPublishedHeading',
    defaultMessage: 'This batch would move an already-published fixture',
  },
  scheduleBuilderDayOff: {
    id: 'control.scheduleBuilder.dayOff',
    defaultMessage: 'No match scheduled in this range',
  },
  scheduleBuilderEntrantColumn: {
    id: 'control.scheduleBuilder.entrantColumn',
    defaultMessage: 'Entrant',
  },
  scheduleBuilderTimeColumn: {
    id: 'control.scheduleBuilder.timeColumn',
    defaultMessage: 'Time',
  },
  scheduleBuilderVenueColumn: {
    id: 'control.scheduleBuilder.venueColumn',
    defaultMessage: 'Venue',
  },

  // A series in the builder. Every contingency is stated in words: which game will be
  // played, which only if the series is still alive, and which now will not be. Color
  // carries none of it.
  scheduleBuilderSeriesHeading: {
    id: 'control.scheduleBuilder.seriesHeading',
    defaultMessage: 'Series of {span} games — {played} played',
  },
  scheduleBuilderSeriesGame: {
    id: 'control.scheduleBuilder.seriesGame',
    defaultMessage: 'Game {number} of {span}',
  },
  scheduleBuilderContingencyCertain: {
    id: 'control.scheduleBuilder.contingencyCertain',
    defaultMessage: 'Will be played',
  },
  scheduleBuilderContingencyContingent: {
    id: 'control.scheduleBuilder.contingencyContingent',
    defaultMessage: 'Played only if the series is still undecided',
  },
  scheduleBuilderContingencyNotRequired: {
    id: 'control.scheduleBuilder.contingencyNotRequired',
    defaultMessage: 'No longer required — the series is already settled',
  },
  scheduleBuilderReleasedSlot: {
    id: 'control.scheduleBuilder.releasedSlot',
    defaultMessage: 'Had held {slot}. That slot is free.',
  },
  scheduleBuilderReleasedSlotUnknown: {
    id: 'control.scheduleBuilder.releasedSlotUnknown',
    defaultMessage: 'Held no slot when the series settled.',
  },
  scheduleBuilderPendingReleasesHeading: {
    id: 'control.scheduleBuilder.pendingReleasesHeading',
    defaultMessage: 'Slots this series decision would free',
  },
  scheduleBuilderPendingRelease: {
    id: 'control.scheduleBuilder.pendingRelease',
    defaultMessage: 'Game {number} — {slot}',
  },

  // Organization identity — name and emblem, in the org settings surface.
  orgIdentityHeading: {
    id: 'control.orgIdentity.heading',
    defaultMessage: 'Organization identity',
  },
  orgIdentityLoading: { id: 'control.orgIdentity.loading', defaultMessage: 'Loading…' },
  orgIdentityLoadFailed: {
    id: 'control.orgIdentity.loadFailed',
    defaultMessage: 'Could not load organization settings.',
  },
  orgIdentityName: { id: 'control.orgIdentity.name', defaultMessage: 'Name' },
  orgIdentitySave: { id: 'control.orgIdentity.save', defaultMessage: 'Save' },
  orgIdentitySaved: { id: 'control.orgIdentity.saved', defaultMessage: 'Organization updated.' },
  orgIdentitySaveFailed: {
    id: 'control.orgIdentity.saveFailed',
    defaultMessage: 'The request was refused.',
  },
  orgIdentityUploadEmblem: {
    id: 'control.orgIdentity.uploadEmblem',
    defaultMessage: 'Upload emblem',
  },
  orgIdentityEmblemAlt: {
    id: 'control.orgIdentity.emblemAlt',
    defaultMessage: 'Organization emblem',
  },
  orgIdentityEmblemPlaceholderAlt: {
    id: 'control.orgIdentity.emblemPlaceholderAlt',
    defaultMessage: 'No emblem uploaded',
  },
  orgIdentityEmblemUploaded: {
    id: 'control.orgIdentity.emblemUploaded',
    defaultMessage: 'Emblem uploaded.',
  },

  // Statistics rebuild — organizer-triggered recompute, in the org settings surface.
  statisticsRebuildHeading: {
    id: 'control.statisticsRebuild.heading',
    defaultMessage: 'Statistics rebuild',
  },
  statisticsRebuildDescription: {
    id: 'control.statisticsRebuild.description',
    defaultMessage:
      'Recomputes every stored statistic total from recorded events. Matches played before a ' +
      'roster was selected contribute team-level figures only — no player-level figures, ' +
      'because none were ever recorded for them.',
  },
  statisticsRebuildTournamentLabel: {
    id: 'control.statisticsRebuild.tournamentLabel',
    defaultMessage: 'Tournament (optional)',
  },
  statisticsRebuildTournamentPlaceholder: {
    id: 'control.statisticsRebuild.tournamentPlaceholder',
    defaultMessage: 'Whole organization',
  },
  statisticsRebuildTrigger: {
    id: 'control.statisticsRebuild.trigger',
    defaultMessage: 'Rebuild statistics',
  },
  statisticsRebuildConfirmPrompt: {
    id: 'control.statisticsRebuild.confirmPrompt',
    defaultMessage: 'This recomputes every stored figure in scope. Continue?',
  },
  statisticsRebuildConfirm: {
    id: 'control.statisticsRebuild.confirm',
    defaultMessage: 'Confirm rebuild',
  },
  statisticsRebuildCancel: { id: 'control.statisticsRebuild.cancel', defaultMessage: 'Cancel' },
  statisticsRebuildResult: {
    id: 'control.statisticsRebuild.result',
    defaultMessage: '{matches, plural, one {# match} other {# matches}} processed.',
  },
  statisticsRebuildFailed: {
    id: 'control.statisticsRebuild.failed',
    defaultMessage: 'The rebuild was refused.',
  },

  // Storage usage — aggregate usage report in org settings.
  storageUsageHeading: {
    id: 'control.storageUsage.heading',
    defaultMessage: 'Storage usage',
  },
  storageUsageDescription: {
    id: 'control.storageUsage.description',
    defaultMessage: 'Total storage used by uploaded media and assets in this organization.',
  },
  storageUsageLoading: {
    id: 'control.storageUsage.loading',
    defaultMessage: 'Loading storage usage…',
  },
  storageUsageLoadFailed: {
    id: 'control.storageUsage.loadFailed',
    defaultMessage: 'Could not load storage usage.',
  },
  storageUsageSummary: {
    id: 'control.storageUsage.summary',
    defaultMessage: '{formattedBytes} across {objectCount, plural, one {# file} other {# files}}',
  },
  storageUsageEmpty: {
    id: 'control.storageUsage.empty',
    defaultMessage: '0 MB across 0 files',
  },

  // Image crop modal — shared by every profile-image upload (org/club emblem, person photo).
  imageCropModalTitle: { id: 'control.imageCropModal.title', defaultMessage: 'Adjust image' },
  imageCropModalZoom: { id: 'control.imageCropModal.zoom', defaultMessage: 'Zoom' },
  imageCropModalRotation: { id: 'control.imageCropModal.rotation', defaultMessage: 'Rotation' },
  imageCropModalCancel: { id: 'control.imageCropModal.cancel', defaultMessage: 'Cancel' },
  imageCropModalConfirm: { id: 'control.imageCropModal.confirm', defaultMessage: 'Use image' },
  imageCropModalClose: { id: 'control.imageCropModal.close', defaultMessage: 'Close' },
  imageCropModalProcessing: {
    id: 'control.imageCropModal.processing',
    defaultMessage: 'Processing…',
  },
  imageCropModalFailed: {
    id: 'control.imageCropModal.failed',
    defaultMessage: 'Could not process this image.',
  },

  // Stackable notifications and stable API error localization.
  toastDismiss: { id: 'control.toast.dismiss', defaultMessage: 'Dismiss notification' },
  toastNotifications: { id: 'control.toast.notifications', defaultMessage: 'Notifications' },
  toastDetails: { id: 'control.toast.details', defaultMessage: 'Technical details' },
  toastSeveritySuccess: { id: 'control.toast.severity.success', defaultMessage: 'Success' },
  toastSeverityError: { id: 'control.toast.severity.error', defaultMessage: 'Error' },
  toastSeverityInfo: { id: 'control.toast.severity.info', defaultMessage: 'Information' },
  apiErrorGeneric: {
    id: 'control.apiError.generic',
    defaultMessage: 'The request could not be completed. Try again.',
  },
  apiErrorBadRequest: {
    id: 'control.apiError.badRequest',
    defaultMessage: 'Check the submitted information and try again.',
  },
  apiErrorUnauthorized: {
    id: 'control.apiError.unauthorized',
    defaultMessage: 'Your session has expired. Sign in again.',
  },
  apiErrorForbidden: {
    id: 'control.apiError.forbidden',
    defaultMessage: 'You do not have permission to perform this action.',
  },
  apiErrorNotFound: {
    id: 'control.apiError.notFound',
    defaultMessage: 'The requested item could not be found.',
  },
  apiErrorConflict: {
    id: 'control.apiError.conflict',
    defaultMessage: 'This change conflicts with current tournament data. Refresh and try again.',
  },
  apiErrorUnprocessableEntity: {
    id: 'control.apiError.unprocessableEntity',
    defaultMessage: 'The submitted information could not be processed.',
  },
  apiErrorServiceUnavailable: {
    id: 'control.apiError.serviceUnavailable',
    defaultMessage: 'Service is temporarily unavailable. Try again shortly.',
  },
  apiErrorInternalServer: {
    id: 'control.apiError.internalServer',
    defaultMessage: 'An unexpected server error occurred. Try again.',
  },
});
