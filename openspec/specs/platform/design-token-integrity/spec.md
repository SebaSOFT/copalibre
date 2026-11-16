# platform/design-token-integrity Specification

## Purpose
Ensures every CopaLibre frontend surface resolves its styling from one complete, testable token contract.

## Requirements

### Requirement: First-party token references are closed
Every first-party CSS, Astro, and TSX `var(--cl-*)` reference SHALL resolve to a custom property
declared by the generated CopaLibre stylesheet. A reference that cannot resolve SHALL fail local
validation and CI before it can ship.

#### Scenario: An undeclared token is introduced
- **WHEN** first-party source references a `--cl-*` property absent from the generated stylesheet
- **THEN** validation fails and identifies the source location and undeclared property name

#### Scenario: A generated component references a missing token
- **WHEN** generated CSS contains a `var(--cl-*)` reference not declared by its own generated output
- **THEN** token-package validation fails before the artifact is accepted

### Requirement: Raw-colour exceptions are explicit and narrow
First-party interface source SHALL use semantic or component tokens for colour. A raw colour is
permitted only for a documented image-derived overlay, a broadcast chroma-key value, or an equivalent
rendering value that cannot be represented as a reusable token; validation SHALL reject every other
raw UI colour.

#### Scenario: A component introduces an arbitrary colour
- **WHEN** a first-party UI component adds a raw colour outside an approved exception
- **THEN** validation fails and directs the author to use a token or document an allowed exception

#### Scenario: A broadcast chroma key is supplied
- **WHEN** a TV overlay receives a chroma-key rendering value
- **THEN** it renders as the supplied key without treating that externally selected value as a semantic
  state or brand token

### Requirement: A detector exception is a recorded decision

Every entry in the design detector's `ignoreValues` SHALL name its rule, carry a date and a reason that says who decided and on what evidence, and SHALL NOT turn a rule off under a wildcard without naming the files it covers. A build-time check SHALL fail, naming each entry, when one does not.

#### Scenario: An exception with no reason

- **WHEN** an entry is added to `.impeccable/config.json` with no reason, or a reason too short to name a decision
- **THEN** the check fails and names the entry

#### Scenario: A wildcard with no files

- **WHEN** an entry silences a rule for every value and lists no files
- **THEN** the check fails, because that silences the rule everywhere

### Requirement: A left state rail is paired with its label

A left rail in the state colour SHALL be 4px, as `DESIGN.md` prescribes, and SHALL appear only where the same element carries a written label for the state it shows.

#### Scenario: The live match row

- **WHEN** a match-day row shows a live match
- **THEN** its rail is 4px in the live colour and the row carries the live state badge

#### Scenario: A featured tournament card

- **WHEN** a tournament card is featured
- **THEN** its border is the same 1px as every card, and the featured state is said by its badge, not by a thicker edge
