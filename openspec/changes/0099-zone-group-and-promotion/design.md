## Context

See proposal.md - Why / What Changes. Owner-directed (2026-08-18), not chaos-vault-sourced — same
footing as `0015-competition-identity-and-seasons` and `0016-statistic-collectors-and-tags`, both of
which state in their own `design.md` that the feature specification named neither seasons nor a
person/player split, and this phase is in the same position for Zone/Group. Surfaced during a
CodeGraph-assisted verification pass across six feature requests; this is the first of those six,
picked because the other five (tournament-listing winner highlight, per-tournament segment-duration
override UI, schedule-conflict duration/extension buffer, per-entity screens, cross-tournament player
career stats) either read from this hierarchy directly or are independent small items better done as
separate, smaller proposals once this lands.

**Current model, confirmed by reading the schema and the fixture-generation code directly** (not
assumed): `seasons(season_id, tournament_id, ...)` → `stages(stage_id, season_id, number, format,
stage_configuration_id)` → `fixtures(fixture_id, stage_id, round, home_entrant_id, away_entrant_id,
...)` → `matches(match_id, fixture_id, ...)`. `createFixtures`/`replaceFixtures` in
`competition-repository.ts` write directly against `stage_id`; both have roughly 30 call sites across
the domain, persistence, and API layers. `TournamentFormat` splits into `DuelFormat` (single/double
elimination, round-robin, league, round-robin single-leg/home-away) and `PlacementFormat`
(free-for-all, heats) — a round-robin-type stage today generates one flat table across every entrant
assigned to the stage; there is no partitioning step anywhere in `packages/tournament-engine/src/
fixtures/`.

**Revised (2026-08-18, owner-directed) after competitive-analysis browsing of a live rink-hockey
results site**: a real tournament (`wsa.sidgad.com/league/288`) splits its terminal phase into a
"Copa Oro" and a "Copa Plata" — two independent bracket zones, each seeded from a different band of
the preceding group stage's combined promotion order, neither feeding any further phase because both
belong to the *last* phase. This proposal's original `PromotionPlan` design produced one combined,
ordered list feeding one next stage's seeding undifferentiated — correct for a single-zone next phase,
but unable to express "top N of the combined order to one zone, the next M to a different zone of that
same phase." The fix (see Decisions, and the `bands` field below) keeps everything already designed —
per-group cuts, cross-group combination — and adds only the routing step: a next phase already has at
least its one implicit zone and may declare several, so a `PromotionPlan` partitions its combined list
into bands, each naming which of the next phase's zones it seeds.

## Goals / Non-Goals

**Goals:**
- Zone and Group exist as real, addressable, persisted levels between Stage and Fixture.
- Every tournament that never explicitly creates more than the default zone/group behaves identically
  to today — same generated fixture graphs (`tournament-fixture-engine`'s existing golden-fixture
  byte-for-byte guarantee holds), same standings shape, same API responses for a caller that never asks
  about zones or groups.
- A stage-level round-robin-type phase can be split into named pools (groups), each independently
  seeded and independently standing, within one or more named zones.
- A zone's groups can each promote a declared number of top finishers (variable per group, so an
  uneven-sized zone works), combined into one ordered list — by a declared cross-group comparator, by
  explicit operator placement, or by simple group-then-rank order — and routed to one or more zones of
  the next phase (a single implicit zone in the common case; named bands to distinct zones, such as a
  terminal phase's "Copa Oro"/"Copa Plata" split, when the plan declares them).
- Entrants can be drawn into zones and into groups by a seeded, reproducible, constraint-satisfying
  draw (region separation, strength-tier distribution), reusing the existing `runDraw` solver — or
  placed manually, an operator's choice either way.
- **Every computation this proposal adds is decision-support an officer reviews, not a trigger.** A
  draw, a promotion plan's combined list, a group's standings — all computable and previewable at any
  time, on demand, never auto-applied. Setting up a phase (drawing zones/groups, generating the next
  stage's fixtures) stays exactly what it already is for every other phase transition in this codebase:
  an explicit, separate, audited operator action.
- The change is complete and testable end-to-end in the domain/persistence/tournament-engine/API layers
  without needing any web UI to verify it.

**Non-Goals (this proposal):**
- **No web UI.** Zone/Group screens are the "dedicated screens per entity" gap this review round also
  found — a separate, follow-up proposal, once this lands and the API shape it needs is stable.
- **Not a continuous-metric balancing optimizer.** `runDraw` satisfies *discrete* constraints
  (separation, and min/max counts of a categorical attribute value) — it does not balance a continuous
  metric evenly across groups (e.g. "make each group's summed strength-rating as equal as possible").
  That is a different, harder problem (balanced partitioning) than constraint satisfaction, and is an
  explicit open gate below, not resolved here. A tier-based categorical attribute plus a distribution
  constraint (`tier=elite, max: 1` per group) already covers the common "don't stack the strong teams"
  case without it.
- **Not a general multi-level qualification engine.** This proposal composes group promotion from
  existing primitives (see Decisions) for the one shape described: N groups in a zone, each cutting to
  a declared count, combined into one ordered list. It does not build, e.g., qualification spanning
  multiple *zones*, or a cut that itself spans more than one round of promotion — those stay possible to
  build later on the same primitives, just not built here.
- **No change to how a tournament without groups is scheduled, corrected, or reported on** — `Fixture`
  is still the unit `schedule-repository.ts` and `result-correction.ts` operate on, unchanged.
- **Not touching `packages/statistics-refold`** — per-match statistic folding is keyed by
  `matchId`/`stageId`/`seasonId`/`tournamentId` already and needs no group awareness to keep working;
  only the *standings table projection* (a different, already-existing read path) becomes group-scoped.

**Open gates this proposal does not resolve** (stated explicitly per this repo's own "never silently
resolve" convention):
- Continuous-metric balanced partitioning across groups (as opposed to discrete constraint
  satisfaction, which `runDraw` already handles — see Decisions) — deferred, noted above.
- **Narrows chaos-vault's still-open "cross-group qualification normalisation (best third-placed
  teams)" gate from phase 10 to one specific, optional remainder.** Groups of different sizes within
  one zone are fully supported structurally (no equal-size assumption anywhere in `Zone`/`Group`, and
  `perGroupAdvance` is already per-group) — this is not the open part. The `mode: 'ranked'` cross-group
  comparator ranking same-position cohorts (all group winners against each other, then all runners-up)
  already produces a fair comparison across unevenly-sized groups *if* the declared pipeline compares a
  per-game-normalized statistic (`aggregation: 'average'`, already supported by `standings/index.ts`'s
  `fold()`) rather than a raw total — an organizer declares `pointsPerGame` and ranks on it, no new
  engine code. What stays open is narrower than "uneven groups don't work": UEFA's specific convention
  of *discarding* results against the extra team(s) in the larger group(s) before comparing, rather
  than averaging per game — a genuine, bespoke exclusion rule this proposal does not build, for a
  follow-up if an organizer wants that exact convention rather than the already-supported
  per-game-average comparison.
- Whether a Zone itself can carry its own `StageConfiguration`-style ruleset overrides (distinct from
  its parent Stage's) — not built here; a Zone inherits its Stage's compiled ruleset unconditionally
  this round.

## Decisions

- **Additive schema, not a migration of `fixtures.stage_id`.** `zone_id`/`group_id` are new nullable
  columns; `stage_id` is untouched. Every one of the ~30 existing `createFixtures`/`replaceFixtures`
  call sites, and every read path keyed on `fixtures.stage_id`, keeps compiling and behaving unchanged.
  A migration that replaced `stage_id` with a required `group_id` would force-touch all thirty in one
  proposal — worse risk for no behavior gain, since `stage_id` remains a valid, useful, directly
  queryable denormalization regardless of grouping.
- **Implicit default zone and implicit default group, created the moment fixtures are generated for a
  stage that has none explicit.** Exactly `Season`'s `IMPLICIT_SEASON_NAME`/`isImplicitSeason` pattern:
  one row costs nothing and removes a branch every reader downstream would otherwise need
  ("does this stage have zones or not"). `Zone.name`/`Group.name` default to a fixed sentinel
  (`"Zona única"`/`"Grupo único"`, matching the existing Spanish-first UI copy convention seen in
  `season.ts`'s `IMPLICIT_SEASON_NAME = 'Edición única'`), and `isImplicitZone`/`isImplicitGroup`
  helpers mirror `isImplicitSeason` exactly.
- **Fixture generation partitions entrants by group, then calls the existing generator once per group,
  unmodified.** `packages/tournament-engine/src/fixtures/{single-elimination,double-elimination,
  round-robin,placement}.ts` take an entrant list and a seed order today and know nothing about stages,
  zones, or groups — they stay exactly that ignorant. The new partitioning step lives one layer up, in
  the fixture-generation entry point, and is the only new code that knows groups exist. This is what
  makes the "unaffected" guarantee for existing tournaments checkable by inspection: with one implicit
  group, "partition into groups, then generate per group" degenerates to exactly what happens today.
- **Standings/table-projection scope key becomes `(stageId, groupId)`, `groupId` defaulting to the
  implicit group.** The read path already keys standings by `stageId`; widening the key rather than
  replacing it means a caller that only ever knew about stages (every caller today) keeps working by
  implicitly asking for the one group that stage has.
- **Zone and group entrant assignment reuses `runDraw` unchanged, called twice: once for zones, once
  more per zone for groups.** Checked before designing this: `runDraw` (`packages/tournament-engine/
  src/draw/index.ts`) already exists as a seeded, reproducible, backtracking constraint solver, and is
  already in production for placement-format heat lobbies (`fixtures/placement.ts`'s `heats()` calls it
  with `shape: {kind:'groups', count: lobbyCount}`). Reusing it for zone/group assignment is the same
  call shape against a different `DrawShape.count` and a persisted (rather than per-round-ephemeral)
  result:
  1. **Zone draw**: `runDraw({ entrants, constraints, shape: {kind:'groups', count: zoneCount}, seed })`
     assigns every entrant a zone. `constraints` may include a `SeparationConstraint` on a `region`-like
     attribute ("no two San Juan clubs in the same zone") or a `DistributionConstraint` on a tier-like
     attribute ("at most one top-tier club per zone") — the exact mechanism named in the request this
     proposal responds to, already built, already tested.
  2. **Group draw, per zone**: for each zone, `runDraw` runs again with that zone's own entrant subset
     and `shape: {kind:'groups', count: groupCountForThisZone}` — independently seeded, independently
     constrained (a zone-scoped constraint set, since "keep the two strongest apart" may mean something
     different within one zone than across zones).
  3. **Manual placement stays available**, unchanged from how it already works for bracket seeding: an
     empty constraint set plus an operator-supplied `DrawAssignment` (or `runDraw` skipped entirely,
     assignment written directly) — not a second mechanism, the same one with no constraints imposed.
  4. **The recorded seed is what makes a zone/group draw auditable and replayable**, exactly as
     `runDraw`'s own doc comment states for its existing use — a `Zone`/`Group` assignment audit entry
     records the seed and the constraint set used, not just the resulting placement.
  - **Not resolved here**: continuous-metric balancing (see Non-Goals/open gates) — `runDraw`'s
    constraint model is discrete (separation, min/max-by-value), which covers the two concrete examples
    in the request but not "minimize the variance of summed team strength across groups."
- **Group promotion composes three already-existing primitives instead of inventing a fourth
  mechanism** — this is the direct answer to "it depends on the tournament: sometimes ordering
  criteria, sometimes hand-picked, sometimes a different count per group":
  1. **Per-group cut, reusing `evaluateQualification` unchanged.** For each group, call it with that
     group's own `EntrantAccounting` (already produced by the now-group-scoped standings) and that
     group's own `advance` count (a `PromotionPlan` field: `perGroupAdvance: number |
     Record<groupNumber, number>`, so an 8-team and a 6-team group in one zone can promote different
     counts). Ties at a group's own cut line surface as `ContestedCut`, exactly as they do today for a
     single-pool cut — no new tie-handling code.
  2. **Cross-group combination is declared, not hardcoded**, as one of:
     - `{ mode: 'ranked', pipeline: TiebreakPipeline }` — entrants are bucketed by *within-group
       finishing position* (all group winners, then all runners-up, ...); a cohort sharing one
       position is ordered by this pipeline, the same declarative comparator mechanism (and the same
       "unresolved tie surfaces, never silently broken" guarantee) group standings already use. This is
       the "first, by ordering criteria" case.
     - `{ mode: 'manual' }` — the operator supplies the full cross-group order directly, audited the
       same way manual seed placement already is. This is the "hand-picked for particular reasons"
       case.
     - `{ mode: 'group-order' }` — the simple fallback: concatenate groups in group-number order, each
       group's own promoted entrants in their own rank order. No comparator, no operator step; the
       right default for a tournament that genuinely does not care how "2nd of Group A" compares to
       "2nd of Group B".
  3. **The combined, ordered list is exactly `AllocationInput.qualified`** — `allocateSeeds` with
     `{ mode: 'automatic' }` consumes it completely unchanged. Promotion produces the list; it is not a
     new allocation mode, and `stage-allocation.ts` needs no changes at all.
  4. **Bands partition the combined list across destination zones of the next stage**, corrected from
     this design's original framing of "one list feeds one next stage's seeding" — a next stage is not
     always undifferentiated. `PromotionPlan.bands?: readonly { zoneRef: string; count: number }[]`
     slices the already-combined, already-ordered list into contiguous runs, one per declared band, each
     routed to a named zone of the next stage; `allocateSeeds` then runs once per targeted zone against
     that zone's own slice, unchanged in every other respect. This is the direct mechanism behind a
     terminal phase that splits into a "Copa Oro"/"Copa Plata" pair — see Context/Decisions below — and
     is additive: a plan that omits `bands` keeps exactly the single-list-to-single-implicit-zone
     behavior already described in steps 1–3, with no observable change for every tournament that never
     declares more than one zone.
- **A `PromotionPlan`'s combined list is preview data, computable at any time, never a trigger.**
  `evaluateGroupPromotion` is a pure function over standings a caller already has — nothing about
  declaring or evaluating a promotion plan writes anything or starts next-stage generation. Consuming
  its output to actually seed a next stage is a separate, explicit act (an operator-initiated "generate
  next stage" call, exactly the shape `stage-qualification`'s existing single-pool qualification
  already requires: "next stage's fixtures SHALL NOT be generated until the prior stage is marked
  complete and its qualification output is resolved"). This proposal extends that gate to the
  group-promotion case rather than relaxing it — a multi-group phase does not get an automatic path a
  single-pool phase does not also have.

- [Risk] `fixtures.zone_id`/`group_id` being nullable, rather than backfilled to the implicit default
  at write time, leaves two representations of "no explicit grouping" (`NULL` vs. an implicit-default
  row's id) that a future reader could confuse → Mitigation: `createFixtures`/`replaceFixtures` always
  resolve and write the implicit default's real id when the caller supplies none — the column is
  nullable at the schema level only to keep the migration additive and reversible; application code
  never writes `NULL` there once this proposal lands.
- [Risk] Partitioning entrants by group before generation could silently change seed numbering
  (global seed 5 becoming "seed 2 of group B") in a way some existing caller assumes is stage-global →
  Mitigation: seed numbering is already documented (`stage-allocation.ts`) as scoped to "this stage",
  and `allocateSeeds`' contiguous 1-based output is naturally reinterpreted as "1-based within
  whichever partition it was computed over" — the implicit-default single-group case produces
  identical numbers to today either way, which is the concrete regression check.
- [Risk] Widening the standings scope key touches a code path several other features read
  (`StandingsPage`, CSV export, public overview) → Mitigation: every one of those already resolves a
  `stageNumber`; adding an optional `groupNumber` alongside it (defaulting to the implicit group) is the
  same kind of additive widening the schema change uses, not a breaking rename.
- [Risk] An organizer declares `mode: 'ranked'` against a *raw-total* statistic (points, wins) rather
  than a per-game-average one for a zone with unevenly-sized groups, producing an unfair comparison
  that is not a bug in the engine — the engine ranks exactly what it was told to — but reads as one
  → Mitigation: the API/domain docs for `PromotionPlan.combination` explicitly call out that an uneven
  zone should rank on an `aggregation: 'average'` statistic, with a worked example, the same way this
  proposal's own docs do; a UI validation warning ("this zone's groups are uneven; consider ranking on
  a per-game statistic") is a reasonable task for the follow-up screens proposal, not this one.
- [Risk] A group's own cut (step 1) lands contested (a tie at that group's own cut line) at the same
  time the cross-group combination (step 2) is requested → Mitigation: step 2 is refused outright while
  any input group's own cut is contested — resolving the group-level tie first is a precondition, not a
  case step 2 tries to reason around; this mirrors `evaluateQualification`'s existing "no partial or
  invented result" rule.
- [Risk] A two-level draw (zone, then group per zone) with tight separation constraints at both levels
  could be jointly unsatisfiable in a way the per-level `assertSatisfiable` pigeonhole check (checked
  independently at each level) does not catch in advance, only surfacing as an exhausted search at the
  second level → Mitigation: this is an existing, accepted property of `runDraw` even for its current
  single-level use (heats) — "the search was exhausted" is already a defined, explained failure mode,
  not a new risk this proposal introduces; an operator facing it loosens a constraint or accepts a
  wider `maxSteps`, exactly as they would for a heat draw today.

## Migration Plan

- Additive migration: `CREATE TABLE zones`, `CREATE TABLE groups`, `ALTER TABLE fixtures ADD COLUMN
  zone_id`, `ADD COLUMN group_id` (both nullable, both FK-constrained, no default).
- No backfill of existing rows required for correctness: every *read* path that needs a group falls
  back to resolving/creating the implicit default lazily, the same way `currentSeason` lazily creates
  the implicit season today rather than requiring a backfill when seasons were introduced. A batch
  backfill of the implicit zone/group onto already-generated fixtures is a `tasks.md` item for
  read-path efficiency (avoiding a lazy-resolve on every read of an old stage), not a correctness
  requirement.
- Reversible: dropping the two new columns and two new tables loses nothing existing behavior depends
  on, since no existing code path is changed to require their presence.
