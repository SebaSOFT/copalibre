## Context

See `proposal.md` for the motivation. The current match-selection term is split between `lineup`
and `roster`; meanwhile registration and participant-self-service use `roster` for team
memberships. The tournament-engine decision record makes match player selection an operational fact,
so it needs one unambiguous term across the domain, API, persistence, worker, and control UI.

## Goals / Non-Goals

**Goals:** make `roster` the sole match-selection term; name memberships and player pools accurately;
preserve every existing match selection and authorization outcome.

**Non-Goals:** changing roster-size policy, accepting/rejecting different players, implementing roster
editing, or changing discipline descriptors and their `RosterConstraints` semantics.

## Decisions

**One canonical vocabulary, no runtime aliases.** `RosterSelection`, `RosterFinding`,
`CheckedRoster`, `validateRoster`, `match.select-roster`, and `match_rosters` replace their lineup
counterparts in one release. A compatibility alias would leave two active meanings and violate the
purpose of this migration. This is an intentional API breaking change, accompanied by an OpenAPI
major-version bump and regenerated client contracts.

**Membership and roster are separate layers.** `Player` remains the domain term for a person's team
membership. The set from which a roster can be selected is an `eligible player pool`. Registration
review and participant self-service use `team membership(s)`; they never use `roster` because they
are not match-scoped selections.

**Rename persisted selection data in place.** Migration `0004-roster-terminology` renames
`match_lineups` to `match_rosters`, preserving primary key and rows, and rewrites stored assignment
capabilities from `match.select-lineup` to `match.select-roster`. Its down migration reverses both
operations. It must run successfully under PostgreSQL and SQLite, the two supported persistence-test
dialects.

**Preserve match behavior, not old strings.** Validation still refuses a duplicate person in a
selection, reports configured size constraints and reports a person outside the eligible player pool.
The latter finding becomes `not-eligible`, because `off-roster` confuses the selected roster with the
pool from which it is selected.

## Risks / Trade-offs

- [Risk] A rolling deployment runs old code after the schema rename. → Migration is released through
  the documented controlled migration entrypoint before application rollout; deployment tooling
  already treats schema readiness as a release gate.
- [Risk] A stored capability is not rewritten and removes a delegate's authority. → Migration
  integration tests seed the legacy value, verify the replacement, then verify rollback restores it.
- [Risk] A documentation-only occurrence keeps the prior ambiguity. → CI-facing tests and a focused
  repository search verify no active implementation or accepted spec uses `lineup` or calls a
  membership a roster.

## Migration Plan

1. Apply migration `0004-roster-terminology` before serving the release.
2. Deploy API, worker, and web code that reads only `match_rosters` and `match.select-roster`.
3. Regenerate and publish OpenAPI v4 and generated contracts with renamed participant membership
   endpoints.
4. Roll back application code and migration together only through `migrateDownOneStep`; the down
   migration restores the legacy table and capability values.
