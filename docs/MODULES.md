# Disciplines and tournament profiles

CopaLibre models a competition as two independently authored artifacts. Both are versioned,
attributed, serializable documents — never code — which is what makes accepting third-party
submissions safe.

|            | Discipline                                                                                | Tournament profile                                      |
| ---------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Answers    | What is this sport, and how is a match won?                                               | How is this competition run?                            |
| Declares   | Segments, event definitions, statistics, scoring inputs, available formats, win condition | Stages, formats, points, tiebreak order                 |
| Depends on | Nothing                                                                                   | Discipline **capabilities**, never a discipline version |

## Capabilities, not version pins

A profile mostly needs a way to win a match and some standing values. Those are named differently
across disciplines — `goals-for` in football, `frags` in a shooter — so a profile declares what it
consumes rather than which discipline it works with:

```jsonc
{
  "capability": "primary-scoring",
  "satisfiedBy": ["goals-for", "points-for", "frags"], // ordered: first match wins
  "necessity": "required",
}
```

Binding resolves each capability against the discipline's declared codes at compile time, and the
resolution is frozen onto the compiled snapshot. Consequences:

- One profile works across disciplines that name the same concept differently.
- A discipline release never invalidates a profile, so no re-release treadmill.
- `optional` capabilities that nothing satisfies degrade through the comparator's `missingValue`
  behaviour, and the explanation trace says the comparator discriminated nothing and why.
- `required` capabilities that nothing satisfies are reported, and an operator may still override —
  the dependency is deliberately soft. The gap is recorded on the binding, so it appears in the audit
  trail rather than only at install time.

Semver on a discipline or profile identifies a **release**. It is not a compatibility contract; that
is what capabilities are for.

## The same mechanism, two real disciplines apart

`football.json` — timed segments, a scoring event with a rich payload:

```jsonc
"segmentTypes": [{ "name": "half", "timed": true, "defaultDurationSeconds": 2700 }],
"eventDefinitions": [{
  "code": "goal", "category": "positive", "actorRequirement": "person",
  "payloadSchema": { "properties": { "assistedBy": { "type": "string" }, "penalty": { "type": "boolean" } } }
}]
```

`tennis.json` — untimed, set-based segments; statistics with no event log behind them at all:

```jsonc
"segmentTypes": [{ "name": "set", "timed": false }, { "name": "tiebreak", "timed": false }],
"statistics": [{ "code": "matches-won", "aggregation": "sum" }]
```

Same descriptor shape, genuinely different sports: one drives its statistics from event effects
recorded during play; the other declares a statistic no event definition ever touches, populated
some other way a discipline is free to choose.

**Illustrative only — no esports discipline ships in `packages/module-catalogue/` today.** The
same mechanism applied to a round-based team FPS would look like this:

```jsonc
// Illustrative only — no esports discipline ships in packages/module-catalogue/ today.
// Shows the same mechanism applied to a round-based team FPS.
"segmentTypes": [{ "name": "round", "timed": true, "defaultDurationSeconds": 120 }],
"eventDefinitions": [{
  "code": "elimination", "category": "positive", "actorRequirement": "person",
  "payloadSchema": { "properties": { "victimId": { "type": "string" } } }
}],
"statistics": [{ "code": "kills", "aggregation": "sum" }, { "code": "objectives-captured", "aggregation": "sum" }]
```

## Canonical statistic codes

Strongly suggested, never enforced. Converging on these names means most profiles satisfy most
disciplines without a wide `satisfiedBy` list; the predicate exists because authors will still
diverge, and that is fine.

| Code                      | Meaning                                                    |
| ------------------------- | ---------------------------------------------------------- |
| `goals-for`               | Primary scoring quantity produced by an entrant            |
| `goals-against`           | Primary scoring quantity conceded                          |
| `score-difference`        | `goals-for` minus `goals-against`                          |
| `wins`, `draws`, `losses` | Match outcome counts                                       |
| `points`                  | Competition points from the configured win/draw/loss rules |

Exported as `CANONICAL_STATISTICS` from `@copalibre/domain`.

## Win condition

Declared by the discipline, because it is a property of the sport. A profile may replace it **only**
where the discipline's field policy permits — a race discipline can allow `lowest-elapsed-time-wins`
to be swapped for a competition-race rule, while a discipline whose win condition is intrinsic marks
it `forbidden`. This reuses the same override mechanism as every other configurable field.

## Freezing

Once a tournament is `started`, its discipline and profile versions cannot change. Starting happens
when the first match begins, and the transition validates its preconditions: entrants locked, fixtures
generated, profile bound, required capabilities satisfied or explicitly overridden.

From that point, the competition's record is self-contained. The compiled ruleset and binding are
persisted, and each finalised match writes its outcome and the standings as of that moment, so the
tournament remains readable with the modules that produced it deleted — necessary once modules are
community-authored and can be retracted.

## Distribution

Packaging, `copalibre module add`, asset handling and the module-repository CI are
`0036-community-module-distribution`. This document covers the model those build on.

### Authoring, running, and submitting a new module locally

1. `copalibre module scaffold <discipline|tournament-profile> <alias>` — writes a structurally-valid
   module package, seeded from one of CopaLibre's own already-valid catalogue documents (real
   segments/events/statistics or real stages/points/tiebreak, not a blank schema), as a tagged local
   Git repository.
2. Edit `<output>/disciplines/<alias>/artifact.json` (or `profiles/<alias>/artifact.json`) and its
   `manifest.json` to describe the real sport or tournament format.
3. `copalibre module validate-local <path>` — the exact check `module add`/`module verify` apply,
   with no fetch and no install.
4. Try it for real, in a local development installation — no separate "local install" mechanism
   exists; a scaffolded module is already a Git repository in the layout `module add` expects:
   ```bash
   COPALIBRE_MODULE_SOURCE_ALLOWLIST=file:///abs/path/to/the/scaffold \
     copalibre module add <alias> --source file:///abs/path/to/the/scaffold
   ```
5. `copalibre module submit <path>` — forks `copalibre-modules`, pushes the module on a new branch,
   and opens a pull request for a human reviewer.

Against a self-hosted instance with no source checkout, `copalibre init --module-dev` sets this up
without hand-managing the allowlist: it writes a `modules-dev/` directory bind-mounted into `api`/
`worker` at `/var/lib/copalibre/modules-dev`, with `COPALIBRE_MODULE_SOURCE_ALLOWLIST` already
pointed at it. Scaffold with `--output modules-dev/<alias>`, then `copalibre module add <alias>
--source file:///var/lib/copalibre/modules-dev/<alias>` — no per-invocation environment variable
needed.

`--module-dev` is Compose-only — the Helm chart (`copalibre init --kubernetes`) has no equivalent
values group, since a `hostPath` volume only reaches a laptop's filesystem when the pod is
guaranteed to run on that one machine, true for a local single-node `kind`/`minikube` cluster but
never a real multi-node one. Developing a module against a local `kind`/`minikube` cluster anyway is
a manual patch, not a chart feature — see
[`docs/deployment/enterprise-kubernetes.md`](deployment/enterprise-kubernetes.md#kubernetes-hosted-module-development-kindminikube-only)
for the recipe.

All five steps are also exposed as MCP tools (`copalibre_module_scaffold`,
`copalibre_module_validate_local`, `copalibre_module_submit`) — see [`docs/MCP.md`](MCP.md) — so an
AI agent can drive this whole flow: read a sport's rules, ask the operator any details it needs, and
build, validate, and submit the module without shelling out to the CLI.
