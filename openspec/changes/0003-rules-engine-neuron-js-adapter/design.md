## Context

`packages/rules` depends only on `packages/domain` (phase 2) and the published `@sebasoft/neuron-js`
package. See proposal.md for motivation; the governing decision is `../chaos-vault/30-processes/
decisions/2026-07-27-copalibre-tournament-engine-mvp-and-result-authority.md`, "Neuron-JS decision
layer" and "Scoring and tiebreakers" sections.

## Goals / Non-Goals

**Goals:**
- Every tiebreak/eligibility/advancement/notification decision in the product routes through this
  package, so there is exactly one place that produces an explanation trace.
- The registry boundary makes it structurally impossible for a `DisciplineDescriptor` (product
  configuration, potentially operator-authored) to execute arbitrary code.

**Non-Goals:**
- No real default comparator catalogues per competition type yet — that is populated when phase 6
  implements the 6 MVP formats against real fixtures; this phase ships the mechanism only.
- No UI — the explanation trace this package produces is rendered by phase 16's control-web screen,
  not built here.
- No persistence of trace history — *storing* traces for audit is `packages/persistence`'s concern
  (phase 4); this package only produces a trace value per evaluation call.

## Decisions

**Neuron-JS is a decision runtime, not a replacement for the domain model or fixture generator.**
Per the source decision doc: "Neuron-JS is the decision runtime for declarative rules inside an
effective ruleset; it is not a substitute for the tournament domain model, persistence layer, or
fixture generator." This package therefore takes a compiled `MatchRuleset` (phase 2's output) as
input and never constructs or mutates domain aggregates itself.

**Typed registry, not free-form rule authoring.** Alternative considered: let
`DisciplineDescriptor`s embed raw Neuron-JS rule JSON referencing arbitrary registered Neuron-JS
primitives directly — rejected because CopaLibre is self-hosted and potentially multi-tenant; an
operator-authored discipline profile must not be able to reference an action/condition the
application didn't explicitly vet and register. The typed registry is the enforcement point.

**Comparator pipeline evaluates sequentially and stops at first resolution**, matching the source
doc's "the engine evaluates them in sequence until it resolves the tie" — not evaluating all
comparators and picking the "best" retroactively, which would make the explanation trace harder to
reason about and would not match the documented product behavior.

**Explanation trace is a first-class, versioned, serializable type**, not a debug log side-channel.
Because phase 16's UI renders it directly (the A5 screen's "Tiebreaker Resolution Trace" — see the
already-built mockup at `../copalibre-design-system-fixed/a5-standings-explainable-tiebreakers/`),
the trace shape is effectively a public contract from this phase onward; changing it later is a
breaking change for the control-web app.

## Risks / Trade-offs

- [Risk] `@sebasoft/neuron-js` is a real but independently-versioned dependency; a breaking upstream
  release could destabilize this adapter. → Mitigation: pin an exact version, and this phase's task
  list includes a task confirming the adapter is exercised against the pinned version's public API
  only (no reliance on undocumented internals).
- [Risk] The registry boundary can become a bottleneck if every new discipline needs an application
  code change to register a new action/condition. → Mitigation: this is an intentional trade-off
  (safety over dynamism) per the source decision doc; not a defect to fix, but worth noting for
  anyone extending the registry later — extend by adding registry entries, not by loosening the
  registry boundary itself.
- [Risk] Idempotent notification delivery is easy to get wrong under concurrent recalculation. →
  Mitigation: task list requires an explicit test for the "reconnect after threshold crossing does
  not re-fire" scenario, not just a single-evaluation happy path.

## Open Questions

- The first standard tiebreak parameter catalogue and default comparator order per competition type
  remains explicitly open (same open item noted in phase 2's design.md) and is deferred to phase 6.
  This does not change this phase's approach or task breakdown — the pipeline mechanism is
  content-agnostic.
