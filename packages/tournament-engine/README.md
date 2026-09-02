# @copalibre/tournament-engine

Deterministic fixture generation, standings, advancement, and qualification across all supported formats:

- **Duel formats**: `single-elimination`, `double-elimination`, `round-robin` (single-leg & home/away), `league`, `bracket-groups` (GSL 4-player dual tournament), `gauntlet` (stepladder ascending bracket), `swiss` (Dutch pairing system), and `custom-bracket` (declarative DAG).
- **Placement formats**: `free-for-all`, `heats`, `ffa-bracket` (multi-round elimination bracket), `ffa-bracket-groups`, and `ffa-league` (multi-division FFA league).
- **Standings & Tiebreakers**: multi-scope evaluation (`overall`, `head-to-head`, `match-losses`), Strength-of-Schedule (`buchholz`, `median-buchholz`, `sonneborn-berger`), progressive scoring, and forfeit tracking.

## Why this is its own package (decision, 0007)

`0007`'s proposal left the location open: `packages/domain` or a dedicated package. It is dedicated,
because standings computation must delegate tiebreak resolution to `@copalibre/rules`, and `rules`
already depends on `domain` — putting standings in `domain` would create a dependency cycle.

Splitting fixtures into `domain` and standings elsewhere was rejected: they are one capability
(`tournament-fixture-engine`) and share the fixture-graph types.

The package stays pure — no database access, no HTTP. Fixture generation takes entrants + seeds +
format and returns a graph; `packages/persistence` persists it afterwards. That is what makes
"repeated generation is identical" trivial to assert without Postgres.
