## Context

`../chaos-vault/50-research/toornament-clean-room/bracket-display-algorithm-reference.md` researched
a general in-order-traversal tree-layout technique for bracket display and explicitly found it
insufficient for double elimination, leaving the layout as an open design gap. This design resolves
that gap and covers how fixture generation, standings, and advancement work for all six MVP formats.

## Goals / Non-Goals

**Goals:**
- A single, correct double-elimination model (winners bracket, losers bracket, grand final,
  including bracket reset) that phase 16's UI can render directly without reinventing layout logic.
- Deterministic, replayable fixture generation and advancement for all six formats.
- Standings that always carry a trace, never a bare ranking number.

**Non-Goals:**
- No live match operation (scoring, clocks, event recording) — phase 8.
- No resource/venue scheduling — phase 7 assigns times/venues to the fixtures this phase generates.
- No formats beyond the six MVP formats — explicitly rejected, not designed around.

## Decisions

**Open gate resolved: double-elimination is modeled as two coupled single-elimination trees plus a
grand-final node, not one generalized tree.** Rather than trying to extend the in-order-traversal
technique researched for single elimination, the engine models a winners bracket (a standard
single-elimination tree of `N` entrants) and a losers bracket (a tree with round count `2*log2(N)-1`
for power-of-two `N`) as two separate fixture graphs joined by explicit routing edges: a winners-
bracket round-`R` loser's edge targets a specific losers-bracket round computed by the standard
double-elimination drop-round formula (odd/even round alternation between "losers bracket round
receiving one new entrant stream" and "losers bracket round merging two entrant streams"). The grand
final is a distinct node consuming the winners-bracket champion and losers-bracket champion, with an
explicit bracket-reset match generated conditionally (only if the losers-bracket champion wins game
one). This is a well-understood, widely-implemented structure (distinct from the generic tree-
traversal approach that failed); modeling it as two coupled trees plus routing edges, rather than one
generalized graph, keeps single-elimination code reusable for the winners bracket instead of writing
double-elimination-specific code from scratch. Alternative considered: a single generalized
directed-acyclic-graph fixture model flexible enough for arbitrary formats — rejected as premature
generality; the MVP format list is fixed at six, and a DAG abstraction would be harder to test
deterministically than two coupled trees with named rounds.

**Fixture generation is pure and repository-independent.** Fixture generation takes an entrant list
+ seeds + format as input and returns a fixture graph as output, with no database access inside the
generation function itself. Phase 4's repositories persist the result afterward. This keeps fixture
generation unit-testable without Postgres and makes the "repeated generation is identical" scenario
trivial to assert.

**Standings computation always calls phase 3's comparator pipeline, never reimplements tiebreak
logic locally.** The fixture engine assembles the *inputs* (accounting parameters per entrant) and
delegates comparison entirely to `packages/rules`, so the explanation trace phase 16's UI depends on
is always the actual trace produced by the pipeline that ran, not a parallel implementation that
could drift from it.

**Advancement is computed, not stored as a precomputed graph edge list mutated in place.** Given a
recorded result, advancement is recalculated from the fixture graph's structure each time rather than
mutating a stored "next fixture" pointer imperatively — this keeps the correction/audit workflow
(phase 8) able to recompute advancement deterministically after a result correction, rather than
needing to unwind imperative mutations.

## Risks / Trade-offs

- [Risk] The two-coupled-trees double-elimination model adds real implementation complexity beyond
  single elimination. → Mitigation: the drop-round routing formula is a well-known, testable
  computation; golden-fixture tests for 4/8/16-entrant double-elimination brackets catch routing
  errors directly.
- [Risk] Non-power-of-two entrant counts require bye handling in both single and double elimination,
  and byes interact with double elimination's losers-bracket routing in non-obvious ways. →
  Mitigation: explicit golden-fixture tests for non-power-of-two entrant counts (e.g. 5, 6, 11
  entrants) in both formats, not just power-of-two cases.
- [Risk] Round robin and league standings recalculation on every result could become expensive for
  large entrant counts. → Mitigation: not a concern at MVP scale; revisit only if measured.

## Migration Plan

N/A — no prior fixture engine exists to migrate from.
