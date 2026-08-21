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

  // RosterSelectionStep.tsx (0107)
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
  rolesRoleAdmin: { id: 'control.roles.role.admin', defaultMessage: 'Admin' },
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
  wizardProblemMinParticipants: {
    id: 'control.wizard.problem.minParticipants',
    defaultMessage: 'A tournament needs at least two participants',
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
  wizardFieldRegion: { id: 'control.wizard.field.region', defaultMessage: 'Region' },
  wizardFieldCapacity: { id: 'control.wizard.field.capacity', defaultMessage: 'Capacity' },
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

  // Zone/Group management, entrant assignment, and promotion plans (0108).
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

  // Post-login landing (ControlApp.tsx's LoginLanding, 0063)
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

  // Load match data (0106) — bulk/structured entry for a match played with no live console.
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

  // Club management (0109) — the first club-related screen in the app.
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

  // Organization identity (0109) — name and emblem, in the org settings surface.
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
});
