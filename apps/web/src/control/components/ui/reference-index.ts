/**
 * The reference index.
 *
 * One row per supplied reference: the story that renders it, and the production
 * surface that consumes it. It exists because a story is not delivery — a
 * pattern that renders beautifully in the workbench and nowhere else has not
 * shipped, and without a list saying so, that is invisible.
 *
 * `consumers` is empty only where there genuinely is none, and `note` then says
 * why. Recording that honestly is the point: an index that quietly omitted the
 * unconsumed rows would report parity this change did not achieve.
 *
 * Not a `.tsx`, deliberately: `ui/` holds components, and the story-coverage
 * check requires a story beside every component in it.
 */

export interface ReferenceIndexEntry {
  /** The reference's own name, as the review refers to it. */
  readonly reference: string;
  /** Storybook title, plus the story within it that is the reference scenario. */
  readonly storyId: string;
  /** Paths relative to `apps/web/src`. Empty where nothing consumes it yet. */
  readonly consumers: readonly string[];
  /** A known discrepancy, or why a row has no consumer. */
  readonly note?: string;
}

export const REFERENCE_INDEX: readonly ReferenceIndexEntry[] = [
  {
    reference: 'Public actionable empty state',
    storyId: 'Public/Astro preview — EmptyState',
    consumers: ['components/ui/molecules/EmptyState.astro'],
  },
  {
    reference: 'Tournament completion progress figure',
    storyId: 'Public/Molecules/CompletionFigure — Playground',
    consumers: [],
    note: 'The state-led tournament overview now leads with the current match strip or placement honours; this progress breakdown remains a standalone public reference, but is not part of that page composition.',
  },
  {
    reference: 'Single-zone tournament honour card',
    storyId: 'Public/Astro preview — TournamentHonourBoardSingleTier',
    consumers: ['components/ui/organisms/TournamentHonourBoard.astro'],
  },
  {
    reference: 'Resilient page read chrome',
    storyId: 'Admin/Templates/ReadState — Stale',
    consumers: ['control/components/pages/PreferencesPage.tsx'],
  },
  {
    reference: 'Loading and data recovery states',
    storyId: 'Admin/Atoms/Skeleton — Matrix',
    consumers: ['control/components/pages/DashboardPage.tsx'],
  },
  {
    reference: 'Actionable empty state',
    storyId: 'Admin/Molecules/EmptyState — ReferenceNoTournaments',
    consumers: ['control/components/screens/DashboardTemplate.tsx'],
  },
  {
    reference: 'Stale data mark',
    storyId: 'Admin/Molecules/StaleMark — ReferenceStaleData',
    consumers: ['control/components/pages/DashboardPage.tsx'],
  },
  {
    reference: 'Per-event synchronization mark',
    storyId: 'Admin/Molecules/EventSyncMark — ReferenceEventSync',
    consumers: ['control/components/screens/MatchConsoleTemplate.tsx'],
  },
  {
    reference: 'Persistent connection status',
    storyId: 'Admin/Organisms/ConnectionStatus — ReferenceOfflineStatus',
    consumers: ['control/components/screens/MatchConsoleTemplate.tsx'],
  },
  {
    reference: 'Standings panel',
    storyId: 'Admin/Organisms/StandingsPanel — Playground',
    consumers: ['control/components/screens/StandingsTemplate.tsx'],
  },
  {
    reference: 'Operational tags',
    storyId: 'Admin/Atoms/Badge — OperationalTags',
    consumers: [
      'control/components/ui/organisms/standings-panel.tsx',
      'control/components/ui/molecules/editorial-card.tsx',
    ],
  },
  {
    reference: 'Outcome legend',
    storyId: 'Public/OutcomeLegend — Playground',
    consumers: ['components/ui/organisms/BracketView.astro'],
  },
  {
    reference: 'Ticker — compact public and broadcast',
    storyId: 'Public/Astro preview — ScoreTicker, ScoreTickerEmpty, ScoreTickerStale',
    consumers: [
      'pages/[...locale]/[organization]/tournaments/[tournament].astro',
      'pages/tv/[organization]/tournaments/[tournament].astro',
    ],
  },
  {
    reference: 'Bracket stage',
    storyId: 'Public/Astro preview — BracketStage',
    consumers: ['pages/[...locale]/[organization]/tournaments/[tournament]/stages/[stage].astro'],
    note: 'Single elimination only. The double-elimination graph layout stays open; the textual round-and-branch view carries what the graph does not draw.',
  },
  {
    reference: 'Public header and in-flow mobile navigation',
    storyId: 'Public/Astro preview — PublicHeader',
    consumers: ['layouts/PublicLayout.astro'],
  },
  {
    reference: 'Inverse informational card',
    storyId: 'Admin/Molecules/EditorialCard — Matrix',
    consumers: ['control/components/ControlApp.tsx'],
  },
  {
    reference: 'Numbered step heading',
    storyId: 'Admin/Molecules/StepHeading — Matrix',
    consumers: ['control/components/TournamentSetupWizard.tsx'],
  },
  {
    reference: 'Metric strip',
    storyId: 'Admin/Molecules/MetricStrip — Matrix',
    consumers: ['control/components/QuickStats.tsx'],
  },
  {
    reference: 'Generic data entity card',
    storyId: 'Admin/Molecules/DataEntityCard — Playground',
    consumers: [],
    note: 'Retained as a generic Storybook reference for linked metadata; the dashboard now uses the lifecycle-aware TournamentCard organism.',
  },
  {
    reference: 'Editorial release composition',
    storyId: 'Admin/Molecules/EditorialCard — Playground',
    consumers: ['control/components/pages/PlatformAdministrationPage.tsx'],
    note: 'The application has no release listing, so the composition is reached through the existing module-update information surface. No release-management subsystem was added.',
  },
  {
    reference: 'Code block — plain file header',
    storyId: 'Admin/Atoms/TerminalBlock — FileVariant',
    consumers: ['control/components/DescriptorBuilderWizard.tsx'],
  },
  {
    reference: 'Audited results ledger',
    storyId: 'Admin/Organisms/AuditLogPanel — ReferenceCorrection',
    consumers: ['control/components/screens/AuditTrailTemplate.tsx'],
  },
  {
    reference: 'Live match scorecard',
    storyId: 'Public/LiveMatchScorecard — ReferenceLiveMatch',
    consumers: [],
    note: 'Predecessor component, extended here with reference data but still unconsumed: the live page renders LiveMatchHero. Recorded rather than adopted — giving it a consumer is a change to what the live page shows, which is not this one.',
  },
  {
    reference: 'Action control states',
    storyId: 'Admin/Atoms/Button — StatePairs',
    consumers: ['control/components/TournamentSetupWizard.tsx'],
  },
  {
    reference: 'Locale control',
    storyId: 'Admin/i18n/LanguageSwitcher — EverySupportedLanguage',
    consumers: ['control/components/ControlShell.tsx'],
    note: 'Repointed here from the deleted LanguageSelector atom, which duplicated this control and had no consumer of its own; LanguageSwitcher carries its language-glyph icon now and is the one the operator shell actually renders.',
  },
  {
    reference: 'Astro preview seam',
    storyId: 'Public/Astro preview — ResultLegend',
    consumers: [],
    note: 'The development preview seam itself: it frames a production Astro component through the production renderer for review, answers 404 in a build, and ships to no production surface by design — a permanent exemption, not debt pending adoption.',
  },
  {
    reference: 'Chamfer-safe square emblem and proportional sizes',
    storyId: 'Public/Astro preview — EmblemImage, EmblemImageMatrix',
    consumers: ['components/ui/atoms/EmblemImage.astro'],
  },
  {
    reference: 'Contained transparent person cutout',
    storyId: 'Public/Astro preview — PersonPhotoCutout',
    consumers: ['components/ui/atoms/PersonPhotoImage.astro'],
  },
  {
    reference: 'Shared page header and settings form',
    storyId: 'Admin/Screens/PageHeaderTemplate — SettingsForm',
    consumers: [],
    note: 'The shared composition is available for the dashboard and configuration pages; the dashboard adoption is still in progress.',
  },
  {
    reference: 'Venue list with a side form',
    storyId: 'Admin/Screens/ListWithRailTemplate — VenueListWithForm',
    consumers: [],
    note: 'The dashboard adoption is still in progress; this shape is also ready for resource-management pages.',
  },
  {
    reference: 'Two-pane operator workspace',
    storyId: 'Admin/Screens/WorkspaceTemplate — SeedingWorkspace',
    consumers: [],
    note: 'The workspace is exercised in the component workbench and is awaiting its first production composition.',
  },
  {
    reference: 'Wizard with a sticky action footer',
    storyId: 'Admin/Screens/WizardTemplate — TournamentSetup',
    consumers: [],
    note: 'Existing wizards still use WizardShell directly; new wizard pages can use this template when they adopt the shared pattern.',
  },
  {
    reference: 'API-bound KPI strip',
    storyId: 'Admin/Organisms/KpiStrip — Playground',
    consumers: ['control/components/QuickStats.tsx'],
    note: 'Dashboard figures use named response fields; no match count is synthesized without an authoritative source.',
  },
  {
    reference: 'Organization and tournament context rail header',
    storyId: 'Admin/Organisms/ContextRailHeader — OrganizationAdmin',
    consumers: ['control/components/ControlShell.tsx'],
  },
  {
    reference: 'Search and lifecycle filters',
    storyId: 'Admin/Organisms/FilterBar — Playground',
    consumers: ['control/components/screens/DashboardTemplate.tsx'],
  },
  {
    reference: 'Tournament summary card',
    storyId: 'Admin/Organisms/TournamentCard — Playground',
    consumers: ['control/components/TournamentSummaryCard.tsx'],
    note: 'The dashboard adapter supplies live tournament data and lifecycle actions; Storybook fixture values are demonstrations.',
  },
  {
    reference: 'Dirty-form save bar',
    storyId: 'Admin/Organisms/UnsavedChangesBar — Playground',
    consumers: [],
    note: 'No current form adopts persistent save controls; the pattern is available to configuration screens.',
  },
  {
    reference: 'Section route tabs',
    storyId: 'Admin/Organisms/SectionTabs — Playground',
    consumers: [],
    note: 'No current page in this change needs section-level route navigation.',
  },
  {
    reference: 'Image upload drop zone',
    storyId: 'Admin/Organisms/DropZone — Playground',
    consumers: [],
    note: 'No image-editing page adopts the shared upload layout in this change.',
  },
  {
    reference: 'Named entity with emblem and metadata',
    storyId: 'Admin/Molecules/EntityIdentityCell — Playground',
    consumers: [
      'control/components/screens/RolesPermissionsTemplate.tsx',
      'control/components/screens/AuditTrailTemplate.tsx',
    ],
  },
];
