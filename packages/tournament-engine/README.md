# @copalibre/tournament-engine

Deterministic fixture generation, standings, and advancement for the six MVP formats.

## Why this is its own package (decision, 0007)

`0007`'s proposal left the location open: `packages/domain` or a dedicated package. It is dedicated,
because standings computation must delegate tiebreak resolution to `@copalibre/rules`, and `rules`
already depends on `domain` — putting standings in `domain` would create a dependency cycle.

Splitting fixtures into `domain` and standings elsewhere was rejected: they are one capability
(`tournament-fixture-engine`) and share the fixture-graph types.

The package stays pure — no database access, no HTTP. Fixture generation takes entrants + seeds +
format and returns a graph; `packages/persistence` persists it afterwards. That is what makes
"repeated generation is identical" trivial to assert without Postgres.
