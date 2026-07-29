## Why

Phase 2 defines the domain shapes for Stage/Fixture/Match; phase 3 defines the rules engine adapter
that can *evaluate* tiebreak comparators once given inputs. Neither phase actually *generates* a
tournament's fixtures or calculates standings from results. `../chaos-vault/30-processes/decisions/
2026-07-27-copalibre-tournament-engine-mvp-and-result-authority.md` fixes the MVP format scope to
six duel formats and states "the engine must not advertise or simulate support for formats outside
this list." `../chaos-vault/50-research/copalibre-market-segment-feature-specification.md`'s TMS-004
(seeding/fixture generation) and TMS-008 (explainable standings/advancement) are both P0 release-
gate capabilities. This phase builds the engine that satisfies both.

This phase also closes a real, currently-open gap: `../chaos-vault/50-research/toornament-clean-room/
bracket-display-algorithm-reference.md` documents that the general in-order-traversal bracket-layout
technique researched as design input is "structurally false" for double elimination, and explicitly
flags double-elimination bracket layout as "an open design gap for CopaLibre, not a documented
Toornament technique to draw from." This proposal resolves that gap (see `design.md`).

## What Changes

- Implement deterministic fixture generation for exactly the six MVP formats: single elimination,
  double elimination, round robin, league, round robin single-leg, round robin home-and-away.
  Any other format request SHALL be rejected, not approximated.
- **Resolve the double-elimination bracket layout gap**: design and implement a layout/advancement
  algorithm that correctly models the winners-bracket/losers-bracket/grand-final structure (see
  `design.md` "Decisions" for the chosen approach and why the simple in-order-traversal tree
  technique doesn't apply).
- Implement deterministic seeding (seed-to-slot placement, bye handling for non-power-of-two
  entrant counts).
- Wire standings/tiebreak calculation to phase 3's rules engine: every standing produced by this
  phase carries the explanation trace phase 3 already contracts to provide.
- Implement the advancement engine: given a completed match/round, deterministically compute which
  fixtures unlock next, for every one of the six formats.
- Implement mutation-class enforcement (`safe`/`requires_rebuild`/`blocked_after_results`) for any
  operation that would regenerate already-generated fixtures, per phase 2's mutation model.
- Explicit non-goal: no live match *operation* (scoring, timers, event recording) — that's phase 8.
  This phase only generates the fixture graph and computes standings/advancement from recorded
  results already present in phase 4's storage.

## Capabilities

### New Capabilities
- `tournament-fixture-engine`: deterministic fixture generation, seeding, standings/tiebreak
  calculation, and advancement for the six MVP tournament formats, including a resolved double-
  elimination bracket layout algorithm.

### Modified Capabilities
(none)

## Impact

- **New files/dirs**: `packages/domain/fixtures/{single-elimination,double-elimination,
  round-robin,league}/`, `packages/domain/standings/`, `packages/domain/advancement/` (or a
  dedicated `packages/tournament-engine` if the fixture logic outgrows `packages/domain` — decide
  during implementation; document the choice in an ADR-style note in `packages/domain/README.md`).
- **Depends on**: phase 2 (aggregate shapes, mutation classes), phase 3 (tiebreak comparator
  pipeline and explanation trace), phase 4 (repositories for reading recorded results).
- **Unblocks**: phase 7 (`0007-resource-scheduling-and-conflicts`, schedules the fixtures this phase
  generates), phase 8 (`0008-live-match-operations-result-authority`, operates the matches this phase
  creates), phase 16 (`0016-standings-bracket-builder-control`, the UI that renders this phase's
  standings trace and bracket layout — including the resolved double-elimination layout).
