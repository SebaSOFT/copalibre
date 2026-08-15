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
});
