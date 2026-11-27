# destructive-actions Specification

## Purpose

Defines how reversible and irreversible operator actions protect tournament data, explain their
consequences, and provide a recovery window when a removal can be undone.

## Requirements

### Requirement: Destructive actions follow severity

A reversible removal SHALL act immediately and offer Undo for 10 seconds. An irreversible action
SHALL open a dialog stating the loss in numbers computed by a dry run, with a confirm button named
by the action's verb. An irreversible delete of a named stage, schedule or tournament SHALL also
require typing that name.

#### Scenario: Delete a schedule

- **WHEN** an organizer chooses "Delete schedule" on a schedule with 4,333 slots and 36 assigned
  matches
- **THEN** a dialog states "Deletes 4,333 slots and unassigns 36 matches", and the confirm button
  reads "Delete schedule", enabled only after typing the schedule name

#### Scenario: Remove an unused venue

- **WHEN** an organizer removes a venue with no assignments
- **THEN** it disappears at once, and a toast offers Undo for 10 seconds
