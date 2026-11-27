# design-system/interaction-states Specification

## Purpose
Defines how web surfaces present loading, stale, failed and empty data states so viewers can tell an
empty result from unavailable data and understand when displayed data may be outdated.

## Requirements

### Requirement: A failed read is never rendered as empty

A data-reading control route SHALL distinguish a successful empty result from a failed read. On a
failure with prior data, it SHALL keep that data visible with a stale mark and its age, and SHALL
announce the failure in a toast with Retry. On a failure with no prior data, it SHALL keep the skeleton
and retry with backoff (2, 4, 8, 16, 30 s, then every 30 s).

#### Scenario: Network drops on the dashboard after a good load

- **WHEN** the dashboard has loaded tournaments and the next refresh fails
- **THEN** the tournaments stay visible with a "Stale" mark and their age, a toast says the refresh
  failed and offers Retry, and no "no tournaments" message appears

#### Scenario: First load fails

- **WHEN** the analytics route's first read fails
- **THEN** the skeleton stays, a toast offers Retry and names the next automatic attempt, and the
  route retries on the fixed schedule

### Requirement: Loading uses layout-shaped opaque skeletons

A route or island that is waiting for data SHALL render skeleton blocks in the chrome ink token, shaped
like the content they replace, with `aria-busy="true"` and visually hidden loading text. The skeleton
SHALL NOT animate, and content arriving SHALL NOT shift the layout.

#### Scenario: Standings arrive

- **WHEN** a standings table replaces its skeleton
- **THEN** the table occupies the skeleton's box with no change in page height above it

### Requirement: Empty states lead to an action

An empty result SHALL render an icon well, a heading, a one-sentence explanation and a primary action
that resolves the emptiness. When the viewer's role cannot act, the action SHALL be replaced by text
naming who can act.

#### Scenario: No tournaments for an admin

- **WHEN** an organization admin opens a dashboard with no tournaments
- **THEN** the empty state offers "Create tournament"

#### Scenario: No tournaments for a viewer

- **WHEN** a viewer opens the same dashboard
- **THEN** no action is offered, and the text says an organization admin can create tournaments
