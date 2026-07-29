## 1. Standings API consumption

- [ ] 1.1 Generate/consume the standings-projection API client type from `packages/contracts`
- [ ] 1.2 Fetch standings projection and render the base table (rank/participant/matches/W-D-L/points)
- [ ] 1.3 Fetch per-row explanation trace on expand (lazy, not eagerly for every row)

## 2. A5 Standings screen

- [ ] 2.1 Build the Top-5 points-distribution animated bar chart (CSS-only, no charting library)
- [ ] 2.2 Build expandable leaderboard rows with the Tiebreaker Resolution Trace panel
- [ ] 2.3 Render the non-color-redundant tiebreak indicator (icon + text label)
- [ ] 2.4 Apply `0011-design-tokens-broadcast-command-precision` chamfer/accent-bar/badge components

## 3. A6 Bracket/Seeding Builder screen

- [ ] 3.1 Build the seed-assignment list with per-seed lock/unlock toggle
- [ ] 3.2 Implement "Randomize Unlocked" respecting locked seeds
- [ ] 3.3 Build the bracket canvas (zoom, snap-to-grid, undo/redo) rendering engine-generated fixture structure
- [ ] 3.4 Render BO3/BO5 match-format badges and TBD/pending placeholder states
- [ ] 3.5 Render both winners and losers brackets correctly for double-elimination structures
- [ ] 3.6 Wire seed-configuration publish to the mutation-classification API (block with explanatory message on `blocked_after_results`)

## 4. Unit tests

- [ ] 4.1 Unit test the bar-chart value-to-width calculation
- [ ] 4.2 Unit test the "Randomize Unlocked" seed-shuffling logic in isolation (locked seeds never move)
- [ ] 4.3 Unit test bracket-canvas connector-positioning logic against known small brackets (4, 8 participants)

## 5. Integration tests

- [ ] 5.1 Integration test: standings API returns a `projectionVersion` the UI can key off
- [ ] 5.2 Integration test: seed-configuration publish is rejected with the correct error when `blocked_after_results`

## 6. Contract test (trace equality)

- [ ] 6.1 Fix a deterministic tournament fixture with a known multi-way tie
- [ ] 6.2 Assert `packages/rules` explanation-trace output for that fixture
- [ ] 6.3 Assert A5's rendered trace text is byte-for-byte identical to 6.2's output
- [ ] 6.4 Run this contract test in CI whenever `packages/rules` or this capability's rendering code changes

## 7. E2E tests

- [ ] 7.1 Playwright: expand a tied standings row and verify the trace panel renders
- [ ] 7.2 Playwright: lock two seeds, randomize, verify locked seeds unchanged
- [ ] 7.3 Playwright: render a double-elimination bracket and verify both winners/losers brackets are visible with correct TBD placeholders
- [ ] 7.4 Playwright: attempt a reseed after results exist and verify the block message appears

## 8. CI wiring

- [ ] 8.1 Add a `0016-standings-bracket-builder-control` job group to `.github/workflows/ci.yml`'s existing `unit-tests` job (extend test glob), a new `contract-tests` job running task 6's trace-equality test, and extend the `e2e-tests` job's spec glob to include this capability's Playwright specs
