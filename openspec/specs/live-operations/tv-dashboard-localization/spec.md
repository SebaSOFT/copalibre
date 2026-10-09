# live-operations/tv-dashboard-localization Specification

## Purpose
Ensures every match-state word the TV dashboard renders (live, final, scheduled, disputed, won, lost,
to-be-determined, cancelled) reflects the kiosk's configured language rather than a fixed default.

## Requirements

### Requirement: TV dashboard result-state vocabulary is localized
Every match-state label the TV dashboard renders — including its top-level status badge and any
per-match result-state word — SHALL be sourced from the active language's message catalogue, the same
way its other pre-formatted vocabulary (`dashboardLabels`, `labels`) already is, never from a fixed
default independent of the configured language.

#### Scenario: Non-Spanish kiosk shows translated result-state words
- **WHEN** a TV kiosk route is configured for a language other than Spanish
- **THEN** every match-state word it renders — live, final, scheduled, disputed, won, lost, to-be-
  determined, cancelled — appears in that configured language, not in Spanish

#### Scenario: Status badge matches the configured language
- **WHEN** a TV kiosk route's top-level status badge renders for any match/tournament state
- **THEN** its label is sourced from the same localized vocabulary as every other label on the screen

### Requirement: The launcher's own labels follow the language selection immediately
Choosing a language in the TV display launcher SHALL change every label of the launcher to that language without reloading the page, SHALL keep the other selections, and SHALL carry the language into the launch link.

#### Scenario: Switching to Spanish updates the form
- **WHEN** the viewer selects Spanish in the launcher
- **THEN** the field labels and button text appear in Spanish immediately and the other selections are unchanged
