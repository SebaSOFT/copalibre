## 1. Shared result-state component

- [ ] 1.1 Build `ResultLegend`/state-badge component that always pairs color with icon and/or text label
- [ ] 1.2 Route every winner/loser/live/upcoming/disputed indicator on both screens through this component

## 2. B2 Live Competition Dashboard

- [ ] 2.1 Build `live.astro` page shell (public nav, shared score ticker)
- [ ] 2.2 Build `LiveMatchHero` React island (clock, score, team panels with streak/elimination-risk label)
- [ ] 2.3 Build `SeriesStateBar` component (5-segment chamfered series progress)
- [ ] 2.4 Build "Up Next" queue card and `TopPerformers` stat-leaders table
- [ ] 2.5 Confirm no discipline-specific widgets (e.g. FPS minimap) are present on the shared template

## 3. B3 public Bracket/Stage view

- [ ] 3.1 Build `stages/[stage].astro` page shell
- [ ] 3.2 Build `BracketView` against a generic round/match list data shape (not a tree — must support double elimination)
- [ ] 3.3 Build `MatchNode` with live/TBD/completed visual states, dashed pending state for unresolved rounds
- [ ] 3.4 Wire winner/loser rows through the shared `ResultLegend` component from section 1

## 4. SSE integration

- [ ] 4.1 Consume the shared reconnect/backoff/cursor client library from `0010-realtime-sse-contract` in both screens
- [ ] 4.2 Apply incoming `match.updated`/`standings.updated` events to update rendered state without a full reload
- [ ] 4.3 Implement graceful degradation: both screens render last-known server-rendered state if SSE is unavailable

## 5. Unit tests

- [ ] 5.1 `ResultLegend` unit tests: every state renders both a color class and a non-color cue (icon/text)
- [ ] 5.2 `BracketView` unit tests: renders correctly from a non-tree (double-elimination-shaped) match list
- [ ] 5.3 `SeriesStateBar` unit tests: renders correct won/current/upcoming segment states from series data

## 6. Integration tests

- [ ] 6.1 Integration test: simulated SSE `match.updated` event updates the rendered score without reload (component-level, mocked event source)
- [ ] 6.2 Integration test: dashboard renders last-known state when SSE connection fails to establish

## 7. E2E tests (Playwright)

- [ ] 7.1 E2E: live dashboard reflects a score change pushed via a test SSE event
- [ ] 7.2 E2E: bracket page's win/loss legend is checked programmatically for non-color-only cues (assert icon/text presence, not just color)
- [ ] 7.3 E2E: Grand Final node renders as pending/TBD before semifinals resolve

## 8. CI wiring

- [ ] 8.1 Add unit/integration test steps for this phase's components to the existing `unit-tests` job in `.github/workflows/ci.yml`
- [ ] 8.2 Add this phase's Playwright specs to the existing `e2e-tests` job in `.github/workflows/ci.yml`
