## Context

Both screens are pure control-surface UI atop already-decided engines: phase 3 owns tiebreak
calculation and its explanation trace; phase 6 owns fixture/bracket generation including the
double-elimination layout. This design covers only how the UI consumes those outputs faithfully. See
`../copalibre-design-system-fixed/a5-standings-explainable-tiebreakers/code.html` and
`../copalibre-design-system-fixed/a6-bracket-seeding-builder/code.html` for the reference interaction
shapes already built as static mockups.

## Goals / Non-Goals

**Goals:**
- The tiebreak trace shown to an operator is provably the same trace the engine produced — not a
  UI paraphrase.
- The bracket canvas is a faithful renderer of engine output, including double-elimination, with no
  client-side bracket-shape logic of its own.

**Non-Goals:**
- No new tiebreak or bracket-generation logic — that belongs entirely to phases 3 and 6.
- No drag-and-drop bracket editing (the mockup's seed list has a drag-indicator icon suggesting
  reordering within the seed list, not the bracket canvas itself) — bracket structure is
  engine-derived, not manually editable.

## Decisions

**Trace rendering is a pass-through, not a re-implementation.** The A5 screen fetches the explanation
trace as pre-formatted structured data from the API (which in turn is `packages/rules`' output
passed through unmodified) and renders it; the UI never recomputes "Rule 1 (H2H): 1-1 → Tied" text
itself. Alternative considered: let the frontend format raw comparator values into trace text for
richer localization — rejected, because any client-side formatting logic is a second place the trace
could diverge from the engine's actual evaluation order, defeating the explainability guarantee.

**Bracket canvas uses hand-positioned connectors, matching the mockup's approach.** The A6 mockup
(read in full this session) uses absolutely-positioned divs for bracket connector lines rather than a
charting/graph library — confirming a vanilla/hand-rolled rendering approach is sufficient and
intentional. No bracket-visualization library dependency is introduced.

**Contract test lives at the boundary, not inside either package.** The trace-equality test is an
integration/contract test that calls the real `packages/rules` explanation-trace function and the
real A5 rendering function against the same fixed fixture, asserting byte-for-byte text equality —
it is not a snapshot test of either side in isolation, which would not catch drift between them.

## Risks / Trade-offs

- [Risk] If `packages/rules`' explanation-trace format changes (e.g. richer structured output) without
  updating A5's renderer, the trace-equality contract test is the only thing that catches it. →
  Mitigation: the contract test runs in CI on every PR touching either `packages/rules` or this
  capability's rendering code (CI path filters).
- [Risk] Double-elimination bracket rendering is complex; a rendering bug could show a structurally
  wrong bracket while the engine's data is correct. → Mitigation: golden-fixture e2e tests for both
  winners/losers bracket rendering, sourced from the same fixture datasets phase 6 uses.

## Migration Plan

N/A — new UI, no existing behavior to migrate. Ships behind the existing control-app auth boundary;
no feature flag needed since it has no effect until an operator navigates to it.
