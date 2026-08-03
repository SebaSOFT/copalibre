## 1. Standings API consumption

- [x] 1.1 Generate/consume the standings-projection API client type from `packages/contracts`
      (the OpenAPI artifact and `packages/contracts` are regenerated from the new controllers; the
      control client mirrors those shapes rather than importing them, keeping the browser bundle
      free of the contracts package)
- [x] 1.2 Fetch standings projection and render the base table (rank/participant/matches/W-D-L/points)
- [x] 1.3 Fetch per-row explanation trace on expand (lazy, not eagerly for every row)

## 2. A5 Standings screen

- [x] 2.1 Build the Top-5 points-distribution animated bar chart (CSS-only, no charting library)
- [x] 2.2 Build expandable leaderboard rows with the Tiebreaker Resolution Trace panel
- [x] 2.3 Render the non-color-redundant tiebreak indicator (icon + text label)
- [x] 2.4 Apply `0019-design-tokens-broadcast-command-precision` chamfer/accent-bar/badge components
      (chamfer, card and badge; the accent bar has no place on either screen's layout)

## 3. A6 Bracket/Seeding Builder screen

- [x] 3.1 Build the seed-assignment list with per-seed lock/unlock toggle
- [x] 3.2 Implement "Randomize Unlocked" respecting locked seeds
- [x] 3.3 Build the bracket canvas (zoom, snap-to-grid, undo/redo) rendering engine-generated fixture structure
- [x] 3.4 Render BO3/BO5 match-format badges and TBD/pending placeholder states
- [x] 3.5 Render both winners and losers brackets correctly for double-elimination structures
- [x] 3.6 Wire seed-configuration publish to the mutation-classification API (block with explanatory message on `blocked_after_results`)

## 4. Unit tests

- [x] 4.1 Unit test the bar-chart value-to-width calculation
- [x] 4.2 Unit test the "Randomize Unlocked" seed-shuffling logic in isolation (locked seeds never move)
- [x] 4.3 Unit test bracket-canvas connector-positioning logic against known small brackets (4, 8 participants)

## 5. Integration tests

- [x] 5.1 Integration test: standings API returns a `projectionVersion` the UI can key off
- [x] 5.2 Integration test: seed-configuration publish is rejected with the correct error when `blocked_after_results`

## 6. Contract test (trace equality)

- [x] 6.1 Fix a deterministic tournament fixture with a known multi-way tie
- [x] 6.2 Assert `packages/rules` explanation-trace output for that fixture
- [x] 6.3 Assert A5's rendered trace text is byte-for-byte identical to 6.2's output
- [x] 6.4 Run this contract test in CI whenever `packages/rules` or this capability's rendering code changes

## 7. E2E tests

- [x] 7.1 Playwright: expand a tied standings row and verify the trace panel renders
- [x] 7.2 Playwright: lock two seeds, randomize, verify locked seeds unchanged
- [x] 7.3 Playwright: render a double-elimination bracket and verify both winners/losers brackets are visible with correct TBD placeholders
- [x] 7.4 Playwright: attempt a reseed after results exist and verify the block message appears

## 8. CI wiring

- [x] 8.1 Add a `0024-standings-bracket-builder-control` job group to `.github/workflows/ci.yml`'s existing `unit-tests` job (extend test glob), a new `contract-tests` job running task 6's trace-equality test, and extend the `e2e-tests` job's spec glob to include this capability's Playwright specs

## Deferred

- Drag-to-reorder within the seed list: `swapSeeds` is implemented and tested, but no drag
  affordance is wired. Lock/unlock plus constrained randomize covers the spec's requirement; the
  drag handle in the mockup is an ergonomic addition, not a capability.
- Seed publication currently returns its classification without persisting a new order or
  regenerating fixtures — the rebuild path belongs to the stage-configuration work, and shipping a
  half-applied reseed would leave a bracket disagreeing with its own seeds.
- Entrant display names on both screens fall back to the entrant id: the standings and seeding
  responses identify entrants by id, and the name lookup arrives with the participant read model.
