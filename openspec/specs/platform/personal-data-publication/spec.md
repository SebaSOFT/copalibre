# personal-data-publication Specification

## Purpose

Defines which participant details appear on public tournament surfaces and how youth-protection
settings and personal opt-outs affect profiles, links, and results.

## Requirements

### Requirement: Public pages respect tournament youth protection and personal opt-out

When a tournament is marked as including minors and youth profiles are not enabled, public surfaces
SHALL show that tournament's players by display name only, with no photo, nationality or player-page
link, and that tournament SHALL NOT feed public career pages. A person marked hidden from public pages
SHALL appear publicly as a translated "hidden at their request" label with no link, photo or career.
Results SHALL remain unchanged.

#### Scenario: Youth tournament without public profiles

- **WHEN** a spectator opens a youth tournament's standings
- **THEN** player names appear without links or photos, and a direct request to a player page returns
  404

#### Scenario: Adult opts out

- **WHEN** an organizer marks a person hidden from public pages
- **THEN** every public page replaces that person's identity with the hidden label, and their
  team's results are unchanged

#### Scenario: Setting changes are audited

- **WHEN** an organizer enables youth profiles for a tournament
- **THEN** an audit record names the actor, the tournament and the change
