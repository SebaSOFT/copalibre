## 1. Domain

- [x] 1.1 `packages/domain/src/aggregates/zone.ts`: `Zone { zoneId, stageId, number, name }`,
      `ZoneError`, `validateZone`, `IMPLICIT_ZONE_NAME = 'Zona única'`, `isImplicitZone` — mirror
      `season.ts`'s shape (`validateSeason`, `IMPLICIT_SEASON_NAME`, `isImplicitSeason`) closely.
- [x] 1.2 `packages/domain/src/aggregates/group.ts`: `Group { groupId, zoneId, number, name }`,
      `GroupError`, `validateGroup`, `IMPLICIT_GROUP_NAME = 'Grupo único'`, `isImplicitGroup` — same
      pattern, one level down.
- [x] 1.3 `packages/domain/src/index.ts`: export both new aggregates' types/functions.
- [x] 1.4 Unit tests: `zone.test.ts`, `group.test.ts` mirroring `season.test.ts`'s cases (name
      required, number is a positive integer, implicit-name detection).

## 2. Persistence

- [x] 2.1 Migration: `CREATE TABLE zones (zone_id uuid pk, stage_id uuid references stages, number
      int, name text, draw_seed bigint NULL, draw_constraints jsonb NULL, created_at timestamptz)`
      with a unique constraint on `(stage_id, number)`; `CREATE TABLE groups (group_id uuid pk, zone_id
      uuid references zones, number int, name text, draw_seed bigint NULL, draw_constraints jsonb NULL,
      created_at timestamptz)` with a unique constraint on `(zone_id, number)` — `draw_seed`/
      `draw_constraints` record what `runDraw` was called with when a zone/group was populated by a
      constrained draw (NULL for manual placement or the implicit default), per design.md's "recorded
      seed is what makes it auditable" decision; `ALTER TABLE fixtures ADD COLUMN zone_id uuid
      references zones NULL`, `ADD COLUMN group_id uuid references groups NULL`.
- [x] 2.2 `packages/persistence/src/schema.ts`: `ZonesTable`, `GroupsTable`; extend `FixturesTable`
      with the two new nullable columns; register both new tables on `Database`.
- [ ] 2.3 `packages/persistence/src/repositories/competition-repository.ts`: `createZone`,
      `listZonesOfStage`, `currentOrImplicitZone` (mirrors `currentSeason`'s lazy-create shape);
      `createGroup`, `listGroupsOfZone`, `currentOrImplicitGroup`.
- [ ] 2.4 `createFixtures`/`replaceFixtures`: accept optional `zoneId`/`groupId` per fixture; when
      absent, resolve (creating if needed) the stage's implicit zone and that zone's implicit group,
      and write those ids — never `NULL` — matching design.md's stated decision.
- [ ] 2.5 `packages/persistence/src/mapping.ts`: `toZone`, `toGroup`; extend `toFixture`-equivalent
      mapping to carry `zoneId`/`groupId`.
- [ ] 2.6 Integration tests (`*.integration.test.ts`, Postgres + SQLite dual-dialect per this repo's
      `dual-dialect-persistence-testing` convention): creating explicit zones/groups; generating
      fixtures with no explicit zone/group falls back to the implicit ones; generating fixtures a
      second time for the same stage without explicit ids resolves to the *same* implicit ids, not new
      ones.

## 3. Entrant assignment — constrained draw into zones and groups

- [ ] 3.1 `packages/tournament-engine/src/allocation/` (or alongside `qualification/` — implementer's
      call): `drawZones(entrants, constraints, zoneCount, seed): DrawOutcome` — a thin wrapper calling
      `runDraw({ entrants, constraints, shape: {kind:'groups', count: zoneCount}, seed })` unchanged, no
      new solver logic. `drawGroups(zoneEntrants, constraints, groupCount, seed): DrawOutcome` — the
      identical call, scoped to one zone's entrants, called once per zone.
- [ ] 3.2 `packages/persistence/src/repositories/competition-repository.ts`: `assignZones`/
      `assignGroups` — run the draw, persist the resulting `Zone`/`Group` rows with `draw_seed`/
      `draw_constraints` set, and (for manual placement) an equivalent path that writes a
      caller-supplied `DrawAssignment` directly with both columns `NULL`.
- [ ] 3.3 `apps/api` route(s): `POST .../stages/:stageId/zones/draw` (body: `constraints`, `zoneCount`,
      optional `seed` — omitted means a fresh one is generated and echoed back, mirroring how
      `runDraw`'s existing bracket-seeding caller already handles this), `POST .../zones/:zoneId/
      groups/draw`. A preview variant (mirroring the existing schedule/qualification preview pattern):
      runs the draw, returns the assignment and trace, commits nothing until a separate confirm call —
      an operator should see *which* draw a seed produced before it is final.
- [ ] 3.4 Unit tests: a region-`SeparationConstraint` produces a zone/group assignment with no two
      same-region entrants sharing a zone/group (property-checked across several seeds, not one
      example); a tier-`DistributionConstraint` (`max: 1` per group) never places two same-tier
      entrants together; an unsatisfiable constraint set (more same-region entrants than zones can
      separate) fails with `runDraw`'s existing pigeonhole-explained error, not a timeout.
- [ ] 3.5 Integration test: the same seed and constraint set, run twice against the same entrant list,
      produce the identical zone/group assignment — the reproducibility guarantee `runDraw`'s own doc
      comment states, now exercised through the persisted zone/group path rather than only through
      ephemeral heat lobbies.

## 4. Tournament engine — group-scoped fixture generation

- [ ] 4.1 `packages/tournament-engine/src/fixtures/index.ts` (or the stage-level entry point that
      currently calls the per-format generators): add an entrant-partitioning step — given a stage's
      groups and each group's entrants (from section 3's draw, or the implicit default), call the
      existing, **unmodified** single-elimination/double-elimination/round-robin/placement generator
      once per group, tagging each generated fixture with its group's (and zone's, and stage's) id.
- [ ] 4.2 Regression proof: golden-fixture tests for all six duel formats plus the two placement
      formats, generated through the new group-aware entry point with exactly one implicit group,
      asserted byte-for-byte identical to the pre-change golden fixtures (the concrete check
      design.md's "Duel format generation is unaffected" claim rests on).
- [ ] 4.3 New tests: two groups of four entrants each in one round-robin-format zone produce two
      independent round-robin fixture sets with no cross-group fixture; group numbering standings
      round-trips correctly for a scenario where the implicit-default path is *not* taken (>1 group).

## 5. Standings / table-projection scoping

- [ ] 5.1 Extend the standings/table-projection read path's scope key from `stageId` alone to
      `(stageId, groupId)`, `groupId` defaulting to the stage's implicit group when a caller (existing
      API routes) supplies none.
- [ ] 5.2 `apps/api` standings/table-projection routes: accept an optional group identifier alongside
      the existing stage-number parameter; existing callers (no group specified) read the implicit
      group and see unchanged output.
- [ ] 5.3 Integration tests: standings computed for two separate groups in one stage are independent
      (a result in group A never appears in group B's table); a stage with only the implicit group
      produces standings identical to the pre-change computation for the same fixture data.

## 6. API — zone/group CRUD and reads

- [ ] 6.1 New routes (mirroring `stages.controller.ts`'s shape): `POST .../stages/:stageId/zones`,
      `GET .../stages/:stageId/zones`, `POST .../zones/:zoneId/groups`, `GET .../zones/:zoneId/groups`
      (manual create, alongside section 3's draw routes).
- [ ] 6.2 DTOs: `ZoneResponse`, `GroupResponse`, `CreateZoneRequest`, `CreateGroupRequest`,
      `DrawZonesRequest`/`DrawGroupsRequest` (constraints + count + optional seed).
- [ ] 6.3 Regenerate `packages/contracts/openapi/v1.json` and `src/generated/v1.ts`.
- [ ] 6.4 Integration tests for the new routes (auth/role-gating mirrors `stages.controller.ts`'s
      existing `RequireOrganizationRole('admin')` pattern for writes, `public-read` for the GETs).

## 7. Wiring and CI

- [ ] 7.1 Confirm new `*.test.ts`/`*.integration.test.ts` files are picked up by the existing Jest glob
      configuration (`packages/domain/jest.config.cjs`, `packages/persistence`'s and `apps/api`'s
      integration config) with no explicit registration needed — this repo's existing convention; note
      in the PR description which config file's glob covers each new file if any doubt arises.
- [ ] 7.2 No `.github/workflows/ci.yml` change expected — this proposal adds no new top-level test
      command or job, only test files under the existing `unit`/`integration` steps' glob. Confirm by
      running `yarn test:verify-discovery` (the existing "did Jest actually find the new files" guard)
      before merging.
- [ ] 7.3 **No e2e tasks** — this proposal has no web UI (see design.md Non-Goals); e2e coverage is a
      task of the deferred follow-up screens proposal, not this one.

## 8. Group promotion

- [ ] 8.1 `packages/domain/src/rulesets/...` (or a new `packages/domain/src/aggregates/promotion.ts` —
      implementer's call once the surrounding types are in front of them): `PromotionPlan { zoneId,
      perGroupAdvance: number | Readonly<Record<number, number>>, combination:
      { mode: 'ranked'; pipeline: TiebreakPipeline } | { mode: 'manual' } | { mode: 'group-order' },
      bands?: readonly { zoneRef: string; count: number }[] }`,
      `validatePromotionPlan` (every group named in `perGroupAdvance` exists in the zone; `advance` ≥ 1
      and ≤ that group's entrant count for every group, mirroring `evaluateQualification`'s own guards;
      when `bands` is present, every `zoneRef` names a zone that exists — explicit or implicit-default —
      on the next stage, and the bands' `count`s sum to exactly the combined list's length).
- [ ] 8.1a `evaluateGroupPromotion`'s result gains a banding step, applied after cross-group combination
      resolves and only when `plan.bands` is present: slice the combined ordered list into contiguous
      runs per band's `count`, in declared order, and return a `Readonly<Record<zoneRef, readonly
      QualifiedEntrant[]>>` alongside the unbanded combined list (which remains available for a plan
      that declares no bands, per the "route to the one implicit zone unchanged" requirement).
- [ ] 8.2 `packages/tournament-engine/src/qualification/`: new `evaluateGroupPromotion(plan,
      groupAccountings: ReadonlyMap<groupId, EntrantAccounting[]>, pipeline)` — step 1 (per-group cut
      via unmodified `evaluateQualification`), step 2 (cross-group combination per `plan.combination`).
      Returns the same `qualified`/`contested`/`resolved`/`trace` shape `QualificationOutcome` already
      has, so a caller (and the trace UI, once built) doesn't need a second result shape to understand.
      Refuses (per design.md's stated precondition) if any group's own cut is contested.
- [ ] 8.3 `mode: 'ranked'` cohort ranking: bucket each group's qualified entrants by within-group rank
      (1st-place cohort, 2nd-place cohort, ...), run `resolveTiebreak` (the same function
      `evaluateQualification` uses internally) against each cohort with `plan.combination.pipeline`,
      concatenate cohorts in rank order.
- [ ] 8.4 `mode: 'manual'`: validate the operator's supplied order names exactly the union of every
      group's promoted entrants, no more and no fewer — same validation shape `applyCutResolution`
      already uses for a contested-cut resolution.
- [ ] 8.5 `mode: 'group-order'`: concatenate groups by number, each group's own qualified entrants in
      their own rank order — no comparator involved.
- [ ] 8.6 `packages/persistence/src/repositories/competition-repository.ts`: `createPromotionPlan`,
      `findPromotionPlan`; `apps/api` routes: one to save a zone's promotion plan (the officer's
      declared *rule* — data, not an action) and a `GET .../promotion-preview` that evaluates it against
      current standings and returns the combined list plus trace — and, when the plan declares `bands`,
      the same list broken down per destination `zoneRef` per 8.1a — callable any number of times,
      writing nothing else and starting no next-stage generation. Next-stage generation stays the
      existing, separate, explicitly-invoked route it already is — this proposal does not add a way to
      generate it as a side effect of anything in section 8.
- [ ] 8.7 Integration tests: a plan with two bands (e.g. `copa-oro`/`copa-plata`, 4 and 4) splits an
      eight-entrant combined list correctly and each band's slice is independently usable as
      `AllocationInput.qualified` for its own zone; a plan naming an undeclared `zoneRef` in `bands` is
      rejected; a plan whose band counts don't sum to the combined list's length is rejected; a plan
      with no `bands` still routes its full combined list to the next stage's one implicit zone
      (regression guard for the pre-existing, single-zone behavior).
- [ ] 8.7a Unit tests: per-group variable `advance` counts; each `combination.mode`; a contested
      within-group cut correctly refuses step 2; `mode: 'ranked'` producing an unresolved cross-group
      tie surfaces the same way a single-pool contested cut does.
- [ ] 8.8 Integration test: a two-group zone (4 v 4, `perGroupAdvance: 2`), `mode: 'ranked'` by
      points-then-goal-difference, produces a 4-entrant seeded list feeding an actual next-stage
      single-elimination generation — full round-trip from recorded results to a generated next-stage
      bracket.
- [ ] 8.9 Integration test: an **uneven** zone (one 5-team group, one 7-team group — the "odd team
      count" case this proposal explicitly supports), `perGroupAdvance` set per group to fill a
      pre-bracket phase, `mode: 'ranked'` against a `pointsPerGame` (`aggregation: 'average'`)
      statistic rather than raw points — confirms the promoted cohort is ordered fairly despite the
      different match counts, and that ranking on the *raw* total instead (a deliberately-misconfigured
      second case in the same test) visibly produces the unfair ordering design.md's risk section
      names, so the difference is asserted, not just described.

## 9. Explicitly deferred (tracked here, not built in this proposal)

- [ ] 9.1 (Follow-up proposal) Continuous-metric balanced partitioning across zones/groups (as opposed
      to the discrete separation/distribution constraints `runDraw` already handles, which section 3
      wires up).
- [ ] 9.2 (Follow-up proposal) UEFA-style "discard results against the extra team(s)" exclusion rule
      for cross-group comparison — uneven groups themselves, and per-game-average comparison across
      them, are already supported by this proposal (see design.md); only that one specific exclusion
      convention is deferred.
- [ ] 9.3 (Follow-up proposal) Zone, Group, and promotion-plan web UI screens.
