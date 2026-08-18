## Why

No chaos-vault architecture decision governs this change — it comes directly from the owner
(2026-08-18), the same footing `0015`/`0016` stood on for the season and person/player split. The
product need: a club league (the motivating case is roller hockey, but the shape is generic) runs a
tournament as `Tournament → Season → Phase → Zone (one by default, often several — "Zona Norte" /
"Zona Sur") → Group/Round (round-robin pools in a group-type phase; the existing round numbering in an
elimination-type phase) → Matches`. Today the domain only models four of those six levels:
`Tournament → Season → Stage → Fixture/Match` (confirmed: `fixtures` carries `stage_id` and `round`
only — no group or zone column anywhere; `packages/persistence/src/schema.ts`). `Stage` already
carries a `format` and a `StageAllocation` (seeding mode), which is what "Phase (with type and
seeding)" already means in the existing model — that part needs no new concept. What's missing is
everything between Phase and the fixture graph: a round-robin-type phase generates one flat table
across every entrant in the stage today, with no way to split them into pools, and there is no "Zone"
grouping above that either.

This is the foundational piece a cluster of other requests depend on (a tournament-listing winner
highlight needs to know which zone/group a champion came from when a phase has several; per-entity
screens need a Zone and a Group screen to exist; nothing about career stats or scheduling changes
because of this). Those are deliberately **out of scope here** — this proposal is scoped to landing
Zone and Group as real, queryable levels, additively, with zero behavior change for every
tournament that never uses more than the one implicit zone and one implicit group every stage already
gets by default.

**Group promotion is in scope, folded in rather than deferred**, on the owner's explicit direction: a
group with no way to promote its top finishers into the next phase is half a feature. **This is
decision-support, not automation** — the owner's own framing, and consistent with a principle already
built into this platform ("CopaLibre enforces the integrity of its own records and what *this*
organizer explicitly configured, never what a sport usually requires," and `stage-qualification`'s
existing "advancement preview without commitment" requirement): a promotion plan computes and shows an
ordered candidate list an officer reviews, it never fires a next phase's seeding on its own. Setting up
a phase is a conscious, explicit act every time, whatever the promotion tooling suggests. Checked before
designing it: the within-group ranking machinery this needs — "most matches won, then goal
difference, then goals against" as an ordered, tie-broken cut — already exists in full
(`packages/rules/src/tiebreak/`'s declarative `TiebreakPipeline`, and phase 10's
`evaluateQualification`), and needs no new engine, only group-scoped standings to call it against
(which this proposal already builds). The one genuinely new piece is **combining multiple groups'**
cuts into one ordered list for the next phase's seeding, and the owner's own framing of it is the
right one: it depends on the tournament, sometimes "first by ordering criteria," sometimes "hand-picked
for particular reasons," sometimes a different count per group depending on how many teams it has —
which is exactly the same three-shape question `StageAllocation` (automatic / manual / weighted) already
answers for ordinary seeding. This proposal composes that answer rather than inventing a fourth
mechanism: see design.md's "Group promotion" decision.

## What Changes

- Two new domain aggregates, `Zone` (belongs to a `Stage`) and `Group` (belongs to a `Zone`), each
  carrying a `number` and a `name`, mirroring `Season`'s existing implicit-default pattern
  (`IMPLICIT_SEASON_NAME`): every stage gets one implicit zone and every zone one implicit group the
  moment fixtures are generated, unless an operator explicitly created more first. A tournament that
  never touches this feature sees identical behavior to today, byte-for-byte — the same guarantee
  `tournament-fixture-engine`'s "Duel format generation is unaffected" scenario already holds fixture
  generation to.
- `fixtures` gains nullable `zone_id`/`group_id` columns (additive; `stage_id` is untouched, so the 30
  existing call sites of `createFixtures`/`replaceFixtures` and everything reading `fixtures.stage_id`
  keep working unmodified). Fixture generation runs the **existing, unmodified** single-elimination /
  double-elimination / round-robin / placement generators **once per group**, over that group's own
  entrant subset, rather than once per stage over the whole stage.
- Entrant-to-zone and entrant-to-group assignment reuses `packages/tournament-engine/src/draw/index.ts`'s
  existing `runDraw` — a seeded, reproducible, constraint-satisfying backtracking solver already in
  production for placement-format heat lobbies (`fixtures/placement.ts`). Separation constraints ("no
  two San Juan clubs in the same group") and distribution constraints ("at most one top-tier club per
  group") work exactly as they already do for heats — no new constraint types, no new solver. Manual
  placement remains available too (an empty constraint set plus an operator-supplied assignment,
  matching how bracket seeding already offers both automatic and manual paths). See design.md.
- Standings and table projections become group-scoped: a `TableProjection` read for a `group-phase`
  target now resolves against one group's matches, not a whole stage's. A phase with the historically
  common single implicit group reads identically to today.
- New repository methods and API routes to create/list zones and groups and to read a group-scoped
  standings/bracket — enough for the domain and API layers to be complete and independently testable.
  **No web UI in this proposal** — Zone/Group screens are explicitly deferred to a follow-up (tracked
  against the "dedicated screens per entity" gap this same review round found).
- A `PromotionPlan`, declared per zone: how many entrants advance from each group (a single count, or
  one per group, so an 8-team and a 6-team group in the same zone can advance different numbers) and how
  the resulting entrants across groups are combined into one ordered list — by a declared cross-group
  `TiebreakPipeline` (reusing the same comparator vocabulary group standings already use), by explicit
  operator placement, or by simple group-then-rank order for a tournament that does not care.
- **The combined list routes to zones of the next phase, not to the phase as an undifferentiated
  whole** — a next phase is itself a `Stage`, which (like every stage) has at least its one implicit
  default zone but may declare several, and a `PromotionPlan` MAY partition its combined list into
  contiguous **bands**, each naming the destination zone it seeds: `bands: readonly { zoneRef: string;
  count: number }[]`, consumed in order (first `count` entrants of the combined list to the first band's
  zone, the next `count` to the second, and so on). This is what a phase whose last stage splits into a
  "Copa Oro"/"Copa Plata" pair of zones needs — group winners banded into one zone, runners-up into the
  other, both zones belonging to the *same* terminal phase rather than each becoming a phase of its own.
  Omitting `bands` routes the whole combined list to the next stage's one implicit zone, exactly the
  single-zone behavior already described above — fully backward compatible. Whichever zone a band
  targets, the slice of the combined list assigned to it is exactly the shape `StageAllocation`'s
  existing `mode: 'automatic'` + `AllocationInput.qualified` already consumes for that zone's own
  seeding — nothing about seeding itself changes, it is simply run once per destination zone instead of
  once per stage.

## Capabilities

### Modified Capabilities
- `tournament-engine/tournament-domain-model`: the competition hierarchy requirement now names Zone and
  Group as explicit levels between Stage and Fixture, with the same "not silently collapsed" guarantee
  Season already carries.
- `tournament-engine/tournament-fixture-engine`: fixture generation is now group-scoped; the existing
  "Duel format generation is unaffected" / determinism / accounting requirements are re-stated to hold
  per-group, and a new requirement covers the implicit-default zone/group a stage with none explicitly
  created still gets.
- `tournament-engine/stage-qualification`: a new requirement covers combining several groups' qualified
  entrants into one ordered list, alongside the existing single-pool qualification-cut requirements.

## Impact

- `packages/domain/src/aggregates/` — new `zone.ts` (`Zone`, `validateZone`, `IMPLICIT_ZONE_NAME`
  pattern) and `group.ts` (`Group`, `validateGroup`, `IMPLICIT_GROUP_NAME` pattern), mirroring
  `season.ts` closely enough that a reviewer familiar with `Season` recognizes the shape immediately.
- `packages/persistence/src/schema.ts` — new `zones`/`groups` tables; `fixtures` gains nullable
  `zone_id`/`group_id`.
- `packages/persistence/src/repositories/competition-repository.ts` — `createZone`, `listZones`,
  `createGroup`, `listGroups`, and the implicit-default resolution `createFixtures`/`replaceFixtures`
  now perform when no explicit zone/group exists yet for a stage.
- `packages/tournament-engine/src/fixtures/` — generation entry point partitions entrants by group
  before calling the existing per-format generators; the generators themselves are unmodified.
- `packages/tournament-engine/src/draw/index.ts` — no changes; `runDraw` is called with `shape:
  {kind:'groups', count}` for zone assignment and again per zone for group assignment, exactly the call
  shape `fixtures/placement.ts` already uses for heat lobbies.
- `packages/persistence` table-projection / standings read path — scope key extended from `stageId` to
  `stageId + groupId`.
- `apps/api/src/controllers/` — new routes for zone/group CRUD and group-scoped reads, alongside the
  existing stage-scoped ones (which keep working against the implicit default).
- No change to `packages/persistence/src/repositories/schedule-repository.ts` — scheduling already
  operates on individual fixtures, which already carry everything scheduling needs; Zone/Group are
  transparent to it.
- No web UI, no cross-tournament statistics change, no change to `resource-scheduling`.
