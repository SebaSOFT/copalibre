## MODIFIED Requirements

### Requirement: Match-scoped capability-based authorization
Only an active organization `admin` or `referee` identity SHALL reach match control, and every event
entry, clock control, roster selection, timer resolution, and match finalization action SHALL be
independently authorized for the specific match. An organization role SHALL NOT substitute for a
match capability grant. The console SHALL expose a roster as the selected eligible players for one
entrant in one match, never as a team-membership list.

#### Scenario: Referee with assigned event entry can record an event
- **WHEN** an active referee holds `match.record-event` for a match
- **THEN** the referee can record an event for that match without receiving a broader admin role

#### Scenario: Referee without finalize capability cannot finalize
- **WHEN** a referee has event-entry authorization for a match but not finalize authorization
- **THEN** the finalize action is unavailable or rejected for that user
