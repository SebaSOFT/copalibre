## Why

The current code uses `lineup` for a match-specific player selection while also using `roster` for
that selection and, ambiguously, for a team's player memberships. That makes match authority,
registration review, and eligibility facts harder to reason about. The tournament-engine decision
record distinguishes operational match facts from configuration and names player selection as an
operational concern; this change gives that concern one canonical English term: `roster`.

This follows `../chaos-vault/30-processes/decisions/2026-07-27-copalibre-tournament-engine-mvp-and-result-authority.md`, which places player selection among auditable live-match operations, and
`../chaos-vault/20-knowledge-domains/copalibre-platform-architecture.md`, which requires API,
persistence, and worker contracts to remain explicit and consistent.

## What Changes

- **BREAKING** Rename the match-selection capability from `match.select-lineup` to
  `match.select-roster` and regenerate published OpenAPI/client contracts.
- **BREAKING** Rename the match-selection domain vocabulary and persistence table from `lineup` /
  `match_lineups` to `roster` / `match_rosters`, with a reversible database migration that preserves
  recorded selections.
- Use `Roster` exclusively for the players selected to play one entrant in one match.
- Rename every use of `roster` that means a person's membership in a team or the team-wide eligible
  player set to `team membership` or `eligible player pool` respectively.
- Preserve current authorization, validation, audit, and statistics behavior; this is a terminology
  migration, not a change to sport rules or match outcomes.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `live-match-operations`: roster selection replaces lineup selection as the canonical
  match-scoped operation and capability.
- `live-match-console`: operator state and attribution describe match rosters, not lineups.
- `registration-review`: team memberships and eligible player pools are not called rosters.
- `roles-permissions`: participant ownership refers to team memberships, while roster authority is
  match-scoped.
- `rules-engine`: eligibility facts use `roster` only for the match selection.
- `declared-tagging`: a tagged person is evaluated when named in a roster.
- `statistic-collectors`: appearance collection derives from the recorded roster.

## Impact

- Affected domain exports, match authority capability values, API controller/projection wording,
  Kysely schema and migrations, worker/statistics terminology, OpenAPI artifact and generated
  contracts.
- Existing deployments receive a reversible PostgreSQL/SQLite-compatible table rename migration;
  no roster data is lost or reinterpreted.
- Unit, migration integration, API integration, and live-console browser tests require updates.
