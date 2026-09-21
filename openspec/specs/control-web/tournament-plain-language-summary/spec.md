# control-web/tournament-plain-language-summary Specification

## Purpose
Explains a tournament's own configuration — discipline, format, stages, registration settings, and
effective ruleset overrides — in plain language, so an organizer never has to read raw form fields
or a JSON override delta to understand what a tournament is actually configured to do.

## Requirements

### Requirement: A tournament summary explains the tournament's own configuration, not only its discipline's
The summary SHALL present the tournament's name, selected format, declared stages, registration
settings (public registration, check-in requirement and its closing time, capacity, region), and
every ruleset field's *effective* value — the discipline's default overlaid with the tournament's
overrides, applying each field's merge strategy — never the raw stored override delta.

#### Scenario: A merged-strategy field shows its full effective value
- **WHEN** the summary renders a field whose override permission is `merged` and the tournament has
  submitted an addition to it
- **THEN** the shown value is the discipline's inherited value combined with the addition, not the
  addition alone

#### Scenario: An untouched field shows the discipline's default
- **WHEN** the summary renders a field the tournament has not overridden
- **THEN** the shown value is the discipline's own default for that field

### Requirement: The summary is offered before creation and on both post-creation configuration screens
The tournament-creation wizard SHALL show the summary as its final step, before the operator
confirms creation. `TournamentSettingsPage` and `TournamentRulesetPage` SHALL each show the summary
alongside their existing editable content for an already-created tournament.

#### Scenario: The wizard's final step summarizes everything configured so far
- **WHEN** an operator reaches the wizard's last step, having completed every prior step
- **THEN** the summary reflects every choice made in the wizard so far, before the "Create" action is
  available

#### Scenario: An already-created tournament's summary reflects saved changes
- **WHEN** an operator saves a change on `TournamentSettingsPage` or `TournamentRulesetPage`
- **THEN** the summary on that screen updates to reflect the saved state, not the pre-save draft
