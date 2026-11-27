# Impeccable design workflow — review

## Scope

This review documents the verification of design token synchronization between `packages/design-tokens`
and `DESIGN.md`, the integration of the Impeccable detector workflow, and the disposition of all baseline
detector findings across the repository.

## Token Source Verification & Drift Detection

`DESIGN.md` serves as the descriptive type and token authority for design tooling. To guarantee that
documentation does not drift from the executable implementation:

- `packages/design-tokens/src/design-document.ts` implements a fail-closed YAML frontmatter reader and an
  explicit source-to-document projection covering colors, typography roles, radius, and spacing.
- `tokens.test.ts` asserts that `DESIGN.md` matches the token source symmetrically in both directions
  from any working directory.
- `yarn workspace @copalibre/design-tokens refresh:design` provides repeatable single-command frontmatter
  refresh for PR workflows, while preserving the normative-source note under H1 and narrative documentation.

## Detector Baseline & Dispositions

The initial Impeccable detector scan produced 53 findings across UI components and test files. Each finding
was triaged and resolved as follows:

| Category                                | Initial Count | Disposition & Actions Taken                                                                                                                                                                                                                                                                                                            | Resulting Status                     |
| --------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Documented State Rails (`side-tab`)** | 4             | `LiveMatchScorecard.tsx`, `CalloutBanner.tsx`, `AuditLogCard.tsx`, and `css.ts` implement the documented left state rail paired with explicit written status text per `DESIGN.md` Cards and Inline Alerts. File-scoped suppressions added to `.impeccable/config.json` with rationale.                                                 | Resolved (Suppressed with rationale) |
| **Off-Scale Radius Literals**           | 18            | Literal `border-radius` values (`12px`, `6px`, `3px`, `2px`) replaced with standard tokens (`--cl-radius-lg`, `--cl-radius-md`, `--cl-radius-sm`) in `ChampionPodium.astro`, `PlayerProfileView.astro`, `StandingsPreview.astro`, `TournamentCard.astro`, `ScoreTicker.astro`, `TiebreakerSequence.tsx`, and `LiveMatchScorecard.tsx`. | Resolved (Tokens adopted)            |
| **Off-Scale Font Sizes**                | 16            | Literal font sizes (`0.9rem`, `0.7rem`, `0.65rem`, `clamp(...)` literals) replaced with standard tokens (`--cl-font-size-sm`, `--cl-font-size-xs`, `clamp(var(--cl-font-size-xs), ...)` in `TvDashboard.tsx`, `DisciplineCard.tsx`, `LiveMatchScorecard.tsx`, `HelpPageTitle.astro`, `TiebreakerSequence.tsx`, and `AuditLogCard.tsx`. | Resolved (Tokens adopted)            |
| **Test Fixtures**                       | 15            | `PreferencesRoute.test.tsx` excluded via `ignoreFiles`. Test fixture strings in `design-document.test.ts` (parser tests) and `integrity.test.ts` (motion lint tests) scoped in `ignoreValues` with justification.                                                                                                                      | Resolved (Excluded/Scoped)           |

### Summary Counts

- **Before:** 53 findings (warnings & advisories across source and test files)
- **After:** 0 unsuppressed warnings / 0 unresolved advisories on application source surfaces (`apps/web/src`, `packages/design-tokens/src`).

## Reproducing & Verification

```bash
# Token drift and documentation tests
yarn workspace @copalibre/design-tokens test:coverage

# Refresh verified frontmatter
yarn workspace @copalibre/design-tokens refresh:design

# Impeccable detector scan
npx impeccable detect --no-advisory apps/web/src packages/design-tokens/src

# Web tests & Help coverage
yarn workspace @copalibre/web test
node scripts/check-help-coverage.mjs
```

## Addendum: detector residue, 2026-11-16

The baseline above was checked again. A file scan of `apps/web/src` found three `side-tab` findings with no
recorded decision, and one of `packages/design-tokens/src` found two `design-system-font` findings in test
files; a browser scan of the running pages found the same plus `cramped-padding` on emblem frames.

| Finding                                    | Disposition                                                                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `side-tab`, live match-day row             | Fixed to the documented 4px rail; recorded as a rail paired with the live state badge                                                                                                                         |
| `side-tab`, standings promotion rows       | Recorded: a 4px rail paired with each row's written promotion band                                                                                                                                            |
| `side-tab`, featured tournament card       | Fixed: a 3px edge in the ordinary border colour signalled nothing; the badge says "featured"                                                                                                                  |
| `design-system-font`, two token test files | Recorded: an escape sequence and a regular expression the tests feed to the code under test                                                                                                                   |
| `cramped-padding`, emblem frame            | Left: `DESIGN.md` documents the padding that scales with the emblem, and a frame holds an image, not text. Only a browser scan reports it, and no exception narrower than the whole rule exists for that mode |
| `broken-image`, `EntrantEmblem.tsx`        | Not reproduced by either mode                                                                                                                                                                                 |

Each recorded exception is file-scoped, in `.impeccable/config.json`, and `scripts/check-detector-exceptions.mjs`
fails one with no reason.
