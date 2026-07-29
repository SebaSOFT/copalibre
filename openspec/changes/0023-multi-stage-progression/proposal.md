## Why

TMS-012 ("Explicit multi-stage progression",
`../chaos-vault/50-research/copalibre-market-segment-feature-specification.md`) is a P1 requirement:
a tournament composed of multiple sequential stages (e.g., group stage feeding a knockout playoff)
where the output of one stage becomes the seeded input of the next. The phase-6 engine
(`tournament-engine`) already generates fixtures and standings for a single stage in any of the 6 MVP
formats; this phase adds the cross-stage contract connecting one stage's completed standings to the
next stage's seeding, without touching the single-stage generation logic itself.

## What Changes

- Add explicit **stage-to-stage advancement rules**: how many participants/teams advance from a
  completed stage, ranked by which standings criteria, into which seed positions of the next stage.
- Add a **cross-stage state machine**: a stage cannot be marked complete (and its advancement applied)
  until its own results are final per phase 8's (`live-match-operations`) result-authority rules; a
  later stage's fixtures cannot be generated until its seeding inputs (the prior stage's advancement
  output) exist.
- Add **advancement preview**: before a stage is finalized, an operator can preview which participants
  would advance under current standings, without committing the next stage's fixtures.
- Extend the audited correction workflow (phase 8) so a correction to a completed prior stage that
  would change who advanced is treated as a `blocked_after_results`-class mutation once the next
  stage has started, consistent with the existing "blocks automatic propagation into an already
  started downstream stage pending an authorized resolution" rule — this phase does not introduce a
  new mutation class, it applies the existing one across a stage boundary.

## Capabilities

### New Capabilities
- `multi-stage-progression`: cross-stage advancement rules, the stage-completion/next-stage-seeding
  state machine, and advancement preview.

### Modified Capabilities
- `tournament-engine`: adds the requirement that stage completion is a prerequisite gate for
  next-stage fixture generation (the single-stage generation behavior itself is unchanged).

## Impact

- **Depends on**: phase 6 (`tournament-engine`) for single-stage fixture/standings generation, phase
  8 (`live-match-operations`) for result finality and the correction workflow this phase extends
  across a stage boundary.
- **New files**: advancement-rule types in `packages/domain`, a stage-transition service in
  `apps/api`.
- This is a P1 phase: deferred past the initial MVP release, but fully specified here so it can be
  picked up without re-deriving the cross-stage contract later.
