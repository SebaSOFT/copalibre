## Why

Two of CopaLibre's product invariants require dedicated operator UI, not just a calculating engine:
"explainable rankings" (standings must expose inputs and the tiebreak rule that resolved them,
`../chaos-vault/50-research/copalibre-market-segment-feature-specification.md` TMS-008) and
deterministic, auditable seeding (TMS-004). The design-system mockups at
`../copalibre-design-system-fixed/a5-standings-explainable-tiebreakers/` and
`../copalibre-design-system-fixed/a6-bracket-seeding-builder/` already establish the exact
interaction shape operators need: a leaderboard whose rows expand into a rule-by-rule tiebreak trace,
and a two-pane seed-lock/bracket-canvas builder. Neither screen may invent its own answer for how a
tie was broken or how a bracket was shaped — both must render exactly what
`0003-rules-engine-neuron-js-adapter` (phase 3) and `0007-tournament-engine-fixtures-mvp-formats` (phase 7)
already computed, or the "explainable" promise is just a UI claim with no backing contract.

## What Changes

- **A5 Standings & Explainable Tiebreakers**: leaderboard table (Rank/Team/Matches/W-D-L/Pts/TB
  icon), animated Top-5 points-distribution bar chart, click-to-expand rows revealing a
  **Tiebreaker Resolution Trace** — a rule-by-rule breakdown (e.g. "Rule 1 (H2H): 1-1 → Tied,
  proceed to R2" then "Rule 2 (R-Diff): +28 vs +24 → Result: X Wins") sourced verbatim from
  `packages/rules`' explanation trace (phase 3), never recomputed or reformatted client-side in a
  way that could diverge from the engine's own trace.
- **A6 Bracket/Seeding Builder**: two-pane layout — left seed-assignment list with per-seed
  lock/unlock and a "Randomize Unlocked" action that respects locked seeds; right bracket canvas
  with zoom, snap-to-grid, undo/redo, BO3/BO5 match-format badges, and TBD/pending placeholder
  states — rendering the fixture structure `0007-tournament-engine-fixtures-mvp-formats` (phase 7)
  generated, including its double-elimination layout.
- **BREAKING**: none — both screens are new UI, no existing behavior changes.
- A cross-boundary **contract test** asserting the A5 UI's rendered trace text is byte-for-byte
  identical to `packages/rules`' explanation-trace output on a fixed fixture — this is the mechanism
  that keeps "explainable" true rather than aspirational.

## Capabilities

### New Capabilities
- `standings-explainability`: public/control UI that renders standings with an expandable,
  engine-sourced tiebreak resolution trace per row.
- `bracket-seeding-builder`: control UI for seed assignment (lock/unlock, constrained randomize) and
  visual bracket construction atop engine-generated fixture structures.

### Modified Capabilities
(none)

## Impact

- **New UI**: `apps/web` `/control/{organization}/tournaments/{tournament}/standings` and
  `/control/{organization}/tournaments/{tournament}/seeding` routes (React, control surface).
- **Consumes**: phase 3 (`0003-rules-engine-neuron-js-adapter`) explanation-trace contract, phase 7
  (`0007-tournament-engine-fixtures-mvp-formats`) fixture/bracket structure, phase 5 (`api-auth-jwt-
  openapi-contract`) generated API client, phase 17 (`0019-design-tokens-broadcast-command-precision`)
  chamfer/badge/accent-bar components.
- **Dependencies introduced**: no new runtime dependencies beyond the already-decided React +
  Radix + Tailwind control stack; a lightweight charting approach for the bar chart (CSS-only,
  matching the mockup's dependency-free animated bars — no charting library required).
