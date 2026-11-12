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
targeting `develop` SHALL skip Lighthouse but SHALL run the budget configuration test.

#### Scenario: Routine development pull request

- **WHEN** a routine pull request targets `develop` and runs a public web build
- **THEN** CI skips Lighthouse and runs the budget configuration test

#### Scenario: Release candidate budget breach

- **WHEN** a pull request targeting `main` or a manual workflow dispatch runs the public web build and exceeds a public page budget
- **THEN** the Lighthouse CI check fails and names the page and the budget

#### Scenario: Slow public navigation

- **WHEN** a release review's synthetic mobile navigation interaction exceeds 210 ms at the median
- **THEN** the INP check fails and names the page and measured value

### Requirement: The performance gate runs outside the release chain

The performance gate SHALL run in its own CI job, with its own Chromium, and SHALL NOT be a dependency of
the release image build or of the deployment verification that follows it, so a budget breach fails its
own check and never hides whether the deployment works. The job SHALL keep the Lighthouse reports of the run.

#### Scenario: A budget breach does not skip the deployment verification

- **WHEN** a release candidate run breaches a public page budget and its other checks pass
- **THEN** the release image build, the deployment e2e and the deploy smoke test still run and report their own results

### Requirement: Budgets are measured through the shipped serving path

Lighthouse SHALL measure the public build as an installation serves it: behind the shipped web role
configuration, with its compression, headers and routing, against a fixture API and a fixture event stream
under `/events`. A measured page SHALL answer 200. Every API route a measured page requests SHALL be either
answered by the fixture or declared absent in it with a stated reason; a request to a route that is neither
SHALL fail the gate rather than be measured.

#### Scenario: Compression reaches the measurement

- **WHEN** the shipped web role compresses a stylesheet
- **THEN** Lighthouse's transfer size for that stylesheet is the compressed size

#### Scenario: The live connection costs what it costs on an installation

- **WHEN** a measured page opens its event stream
- **THEN** the stream is answered by the fixture event stream, not by a fallback page

#### Scenario: A missing fixture route is caught before measuring

- **WHEN** a measured page requests an API route the fixture neither answers nor declares absent
- **THEN** the gate fails and names the route
