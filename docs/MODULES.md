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
`0034-community-module-distribution`. This document covers the model those build on.
