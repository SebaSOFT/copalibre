# organization-dashboard Specification

## Purpose
Gives authenticated organizers a single overview of their organization's tournament activity and a
recent-activity audit trail, as the control application's landing screen.

## Requirements

### Requirement: Dashboard summarizes tournament status counts
The organization dashboard SHALL display counts of active tournaments, pending registrations, and
matches scheduled for the current day.

#### Scenario: Stats reflect current organization state
- **WHEN** an authenticated organizer with two active tournaments and five pending registrations opens the dashboard
- **THEN** the displayed stats show 2 active tournaments and 5 pending registrations

### Requirement: Tournament cards are grouped by lifecycle state
The dashboard SHALL render each tournament as a card indicating whether it is live, upcoming, or a
draft, with a distinct visual treatment per state.

#### Scenario: Draft tournament is visually distinguished
- **WHEN** a tournament has not yet been published
- **THEN** its card renders with the draft visual treatment (muted styling) and a resume-editing action, distinct from live and upcoming cards

### Requirement: Recent activity feed shows audited operational events
The dashboard SHALL show a chronological feed of recent operational events (e.g. match started,
registration approved, tournament updated) for the organization, sourced from the audit log.

#### Scenario: Audit event appears in the feed
- **WHEN** an operator approves a registration
- **THEN** a corresponding entry appears in the organization's recent-activity feed with an actor, timestamp, and event type

### Requirement: Dashboard is scoped to the authenticated organizer's organization
The dashboard SHALL only display tournaments and activity belonging to organizations the
authenticated user has a role in.

#### Scenario: Cross-organization data is not visible
- **WHEN** a user with a role only in organization A views the dashboard
- **THEN** no tournament or activity data belonging to organization B is present in the response

### Requirement: The dashboard lists the organization's real tournaments

The control panel dashboard SHALL list the tournaments actually belonging to the signed-in organizer's
organization, read from current backend state. It SHALL NOT render sample or fabricated tournaments
under any condition, including when the organization has none.

#### Scenario: An organizer sees their own tournaments
- **WHEN** an authorized organizer opens the dashboard
- **THEN** the tournament list shows their organization's tournaments

#### Scenario: An organization with no tournaments shows an empty state
- **WHEN** an organization has no tournaments
- **THEN** the dashboard states that there are none, rather than showing sample data
