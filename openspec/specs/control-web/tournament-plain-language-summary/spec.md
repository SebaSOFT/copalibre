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

### Requirement: Effective rule values and file controls render in localized plain language
Every effective ruleset field value in the tournament summary SHALL render in human-readable plain language rather than serialized JSON syntax, literal `null`, or raw booleans. File upload controls SHALL render prompt copy, format constraints, and file counts in the active language.

#### Scenario: Rule value formatting avoids raw JSON
- **WHEN** a ruleset field contains a compound object value (such as segment duration or overtime configuration)
- **THEN** the summary renders the value as a readable descriptive sentence rather than raw serialized JSON

#### Scenario: Null and boolean values are localized
- **WHEN** a ruleset field has a boolean or null value
- **THEN** the summary renders localized affirmative/negative terms or a missing-value dash, never raw code tokens like `"null"` or `"false"`

#### Scenario: File uploader strings match the operator's locale
- **WHEN** an operator views a file upload area (such as the tournament emblem picker)
- **THEN** the drag-and-drop prompts, constraint explanations, and button actions render in the active language
