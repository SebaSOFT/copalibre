export function alerts(): string[] {
  return [
    '.cl-inline-alert {',
    '  display: flex;',
    '  gap: var(--cl-space-2);',
    '  padding: var(--cl-space-3);',
    '  border-left: var(--cl-space-1) solid var(--cl-state-live);',
    '  background: var(--cl-surface-chrome);',
    '}',
    '',
    '/* An alert is its accent *and* its words: the variant colours the rail, the text says what happened. */',
    '.cl-inline-alert--destructive { border-left-color: var(--cl-state-destructive); }',
    '.cl-inline-alert--warning { border-left-color: var(--cl-state-warning); }',
    // `success` completes the set the Alert atom exposes. Until it existed, 65
    // of 68 inline alerts declared no tone at all, so an error, a success
    // confirmation and a loading message all drew the same rail — the class was
    // doing three jobs and looking identical for each.
    '.cl-inline-alert--success { border-left-color: var(--cl-state-positive); }',
    '.cl-inline-alert--live {',
    '  border-left-color: var(--cl-state-positive);',
    '  animation: cl-alert-live-pulse var(--cl-motion-slow) ease-in-out infinite alternate;',
    '}',
    '@keyframes cl-alert-live-pulse {',
    '  from { border-left-color: var(--cl-state-positive); }',
    '  to { border-left-color: color-mix(in srgb, var(--cl-state-positive) 65%, transparent); }',
    '}',
    '@media (prefers-reduced-motion: reduce) { .cl-inline-alert--live { animation: none; } }',
    // Only where an alert carries more than one line. The base rule stays a
    // row: BroadcastStatusPanel and the public surfaces already lay their
    // single-line alerts out along it.
    '.cl-inline-alert--stacked { flex-direction: column; }',
    // Opt-in, never automatic: a component does not set its own external
    // margin, but a caller placing an alert after a form step needs the same
    // gap every time, and an inline `marginTop` literal at each site is what
    // this replaces.
    '.cl-inline-alert--spaced { margin-block-start: var(--cl-space-4); }',
    '.cl-inline-alert__title { margin: 0; font-weight: var(--cl-weight-bold); }',
    '.cl-inline-alert__body { margin: 0; color: var(--cl-text-secondary); font-size: var(--cl-font-size-sm); }',
    // Pushed to the end of the alert's own row rather than carrying a margin of
    // its own — the same rule the entity-card footer uses for its destructive
    // action, and for the same reason: spacing belongs to the container.
    '.cl-inline-alert__dismiss { margin-inline-start: auto; align-self: start; background: none; border: 0; color: inherit; cursor: pointer; padding: 0 var(--cl-space-1); }',
    // A card's content is a grid that owns its own spacing, so an alert placed
    // in it brings no paragraph margin of its own.
    '.cl-card__content > .cl-inline-alert { margin: 0; }',
    '',
    // The accent rail (`.impeccable/config.json`'s
    // `side-tab` suppression): a left border in the tone it means, paired
    // with a written label elsewhere in the component so the state is never
    // colour alone — DESIGN.md's Cards and Inline Alerts guidance,
    // independently reinvented inline in `audit-log-panel.tsx`,
    // `callout-banner.tsx` and the former `LiveMatchScorecard.tsx` (now
    // `MatchCard.tsx`'s comparator trace) before this class existed.
    // `--thin` exists because the comparator trace's rail was declared at
    // 3px, not the 4px (`--cl-space-1`) the other two use — narrower by a
    // deliberate original choice this move does not revisit.
    '.cl-accent-rail { border-left: var(--cl-space-1) solid var(--cl-state-live); }',
    '.cl-accent-rail--correction { border-left-color: var(--cl-color-amber-400); }',
    '.cl-accent-rail--neutral { border-left-color: var(--cl-border-muted); }',
    '.cl-accent-rail--thin { border-left-width: 3px; }',
    '',
    "/* An unauthenticated screen's form: one column, the fields evenly spaced. */",
  ];
}
