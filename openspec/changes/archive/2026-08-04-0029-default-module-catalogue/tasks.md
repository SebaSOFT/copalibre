## 1. Profile schema

- [x] 1.1 Add `TOURNAMENT_PROFILE_SCHEMA` in `packages/domain/src/profiles/`, draft-07 like the
      descriptor schema, covering `stages[]`, `points`, `tiebreak[]` and `requires[]`
- [x] 1.2 Reuse the registered rule-script sub-schema for `winConditionOverride`
- [x] 1.3 Add `validateTournamentProfileDocument`, returning the offending member the way
      `validateDisciplineDescriptorDocument` does
- [x] 1.4 Export both from `@copalibre/domain`

## 2. Catalogue package

- [x] 2.1 Create the `packages/module-catalogue` workspace, depending only on `@copalibre/domain`
- [x] 2.2 Convert the 0009 football and tennis descriptors to `disciplines/*.json`, adding `alias`
      and dropping the baked `descriptorId`
- [x] 2.3 Author `profiles/liga-ida-vuelta.json` and `profiles/copa-eliminacion.json`, declaring
      tiebreak by capability and naming no discipline
- [x] 2.4 Author `profiles/grupos-y-playoff.json`, or record it as deferred to
      `0010-stage-qualification-and-seeding` if that phase has not landed
- [x] 2.5 Implement the loader: read the directory, validate every document, return typed modules or
      an aggregated error naming each failing document and member
- [x] 2.6 Export the shipped aliases as the reserved-name list, so `0034`'s module-repository
      pull-request validation reads it instead of maintaining a second copy
- [x] 2.7 Reduce `packages/domain/src/modules/` to the builders tests still need, and update the 0009
      tests that construct descriptors
- [x] 2.8 Author at least one shipped discipline against `0013`'s expression mode — a parameter whose
      `value` is `{{ … }}` with `options.expression: true` — so the catalogue documents the authoring
      style rather than leaving every module author to discover it (owner's call, 2026-07-31). Note
      that `state-number`/`state-string` no longer exist; a path read is written as an expression.

## 3. Persistence

- [x] 3.1 Add `alias` to `discipline_descriptors` and `tournament_profiles` with a unique
      `(alias, version)` constraint, as a migration
- [x] 3.2 Add repository lookups by `(alias, version)` for the idempotency check
- [x] 3.3 Assign the UUIDv7 identifier at install time; never read one from a catalogue document

## 4. Seed role

- [x] 4.1 Create `apps/seed` as its own entrypoint, separate from `apps/migrate`
- [x] 4.2 Validate the whole catalogue before the first write; abort naming the failing document
- [x] 4.3 Install through the existing repositories inside one `withTransaction`, producing the same
      audit record and outbox event an operator install produces
- [x] 4.4 Skip an already-installed `(alias, version)`, reporting it, and never overwrite
- [x] 4.5 Refuse the run when a reserved alias is already held by a module of different
      attribution, naming the alias and the holder, installing nothing and overwriting nothing

## 5. Unit tests

- [x] 5.1 Test that every shipped document validates against its schema — the drift guard
- [x] 5.2 Test that the profile schema rejects a stage without a format and a tiebreak entry without
      a capability
- [x] 5.3 Test that a shipped profile binds against two disciplines with different codes, each
      comparator resolving to that discipline's own code
- [x] 5.4 Test that the loader aggregates failures instead of stopping at the first
- [x] 5.5 Test that no shipped profile names a discipline or a discipline version
- [x] 5.6 Test that the reserved-name list covers every shipped alias and stays in step when a
      module is added to the catalogue

## 6. Integration tests

- [x] 6.1 Integration test seeding a fresh installation: every module installed, each with an audit
      record
- [x] 6.2 Integration test that seeding twice installs nothing the second time and assigns no second
      identifier
- [x] 6.3 Integration test that a newer catalogue version installs alongside its predecessor and a
      tournament compiled against the older one still resolves
- [x] 6.4 Integration test that an operator-edited module is not overwritten by a re-seed
- [x] 6.5 Integration test that one invalid document leaves the database untouched
- [x] 6.6 Integration test that a reserved alias held under different attribution aborts the run and
      leaves the installed module untouched
- [x] 6.7 Integration test that running migrations alone seeds nothing

## 7. CI wiring

- [x] 7.1 Add `yarn workspace @copalibre/module-catalogue test:coverage` to the `unit-tests` job in
      `.github/workflows/ci.yml`, at the existing coverage threshold, with a coverage artifact upload
      matching the other workspaces
- [x] 7.2 Add a `yarn workspace @copalibre/seed test:integration` step to the `integration-tests` job
      in `.github/workflows/ci.yml`, after the existing `@copalibre/migrate run start` step
