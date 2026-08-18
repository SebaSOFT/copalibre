# control-web/identity-visuals Specification

## Purpose
Gives an operator a country selector with flags wherever a country is chosen, shows a small flag next
to every person's name the console already displays, and shows a person's photo (or a placeholder) on
their profile — the visual half of recording nationality and portrait/emblem images.
## Requirements
### Requirement: A country selector shows a flag and a localized name per option

Wherever the console lets an operator choose a country, it SHALL render a searchable selector listing
every ISO 3166-1 alpha-2 country, each option showing its flag and its name localized to the console's
active language.

#### Scenario: Operator searches by localized name
- **WHEN** an operator types part of a country's name in the selector, in the console's active language
- **THEN** matching countries are shown, each with its flag

#### Scenario: Selector reflects the console's active language
- **WHEN** the console's active language changes
- **THEN** the selector's country names re-render in the new language without changing the underlying
  stored country code

### Requirement: A person's name is shown with their nationality flag

Everywhere the console renders a person's name to an operator, it SHALL render that person's
nationality flag immediately alongside it, when a nationality is set. A person with no nationality SHALL
render with no flag and no placeholder in its place.

#### Scenario: A registered person's name shows their flag
- **WHEN** the registration review list renders a person who has a nationality set
- **THEN** their flag renders next to their display name

#### Scenario: A roster member's name shows their flag
- **WHEN** the match console's jersey grid renders a roster member who has a nationality set
- **THEN** their flag renders next to their jersey name

#### Scenario: A person with no nationality shows no flag
- **WHEN** a person with no nationality set has their name rendered anywhere in the console
- **THEN** no flag and no flag-shaped placeholder renders next to their name

### Requirement: A person's profile shows their photo or a placeholder

The console SHALL provide a person-profile view showing the person's photo when one is set, or a
placeholder when it is not, alongside their display name and nationality flag.

#### Scenario: A person with a photo shows it on their profile
- **WHEN** an operator opens the profile of a person who has a photo set
- **THEN** the uploaded photo renders

#### Scenario: A person with no photo shows a placeholder on their profile
- **WHEN** an operator opens the profile of a person who has no photo set
- **THEN** a placeholder renders in its place, distinguishable from a real photo

### Requirement: A team's jersey grid header shows its club's emblem

The match console's jersey grid SHALL render each team's name and its club's emblem (or a placeholder,
when the entrant has a club with no emblem set) in its team header, in place of a raw entrant identifier.

#### Scenario: A team with a club emblem shows it in the jersey grid header
- **WHEN** the jersey grid renders a team panel for an entrant whose club has an emblem set
- **THEN** the team's name and its club's emblem render in that panel's header

#### Scenario: A team with no club, or a club with no emblem, shows a placeholder
- **WHEN** the jersey grid renders a team panel for an entrant with no club, or a club with no emblem set
- **THEN** the team's name renders with a placeholder emblem, not a broken image

