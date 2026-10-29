# platform/performance-budget Specification

## Purpose

Sets measurable performance expectations for public tournament pages on slow mobile networks and
defines when those budgets block release review.

## Requirements

### Requirement: Public pages meet a performance budget on slow mobile networks

On slow 4G for mid-range phones, public overview, matches and match pages SHALL meet LCP at most
2.5 s, CLS at most 0.1, INP at most 200 ms, JavaScript at most 150 KB and total transfer at most
1 MB. Lighthouse CI SHALL use the median of three runs per page and 5% timing tolerance. A
Lighthouse User Flow SHALL measure INP; TBT SHALL be diagnostic only.

#### Scenario: Median performance measurement

- **WHEN** Lighthouse audits a supported public page
- **THEN** it compares the median of three runs, applies 5% tolerance to timing budgets, and measures INP with a synthetic interaction

### Requirement: Expensive performance gate runs only for release review

When a public web build is in scope, Lighthouse CI SHALL run on pull requests targeting `main` and
manual workflow dispatches, and SHALL fail those runs for budget breaches. Routine pull requests
targeting `develop` SHALL skip Lighthouse but SHALL run the budget configuration test. The gate SHALL
reuse Chromium installed by the primary Playwright E2E shard.

#### Scenario: Routine development pull request

- **WHEN** a routine pull request targets `develop` and runs a public web build
- **THEN** CI skips Lighthouse and runs the budget configuration test

#### Scenario: Release candidate budget breach

- **WHEN** a pull request targeting `main` or a manual workflow dispatch runs the public web build and exceeds a public page budget
- **THEN** the Lighthouse CI step fails and names the page and the budget

#### Scenario: Slow public navigation

- **WHEN** a release review's synthetic mobile navigation interaction exceeds 210 ms at the median
- **THEN** the INP check fails and names the page and measured value
