/**
 * The reference index (OpenSpec 0223).
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
    note: 'Repointed here from the deleted LanguageSelector atom (openspec 0225 task 4.3a), which duplicated this control and had no consumer of its own; LanguageSwitcher carries its language-glyph icon now and is the one the operator shell actually renders.',
  },
];
