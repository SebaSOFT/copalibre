# declared-tagging Specification

## Purpose
Lets a discipline or a tournament declare labels that any granularity on either hierarchy can carry —
suspended, captain, under review, fee outstanding — applied and lifted as recorded facts, and
informational by construction: a tag states what is true and never decides what follows.
## Requirements
### Requirement: A tag is declared, and a level either may carry it or may not
A discipline or a tournament SHALL be able to declare a tag, naming the granularities of the competition and
actor hierarchies that may carry it, without a core release.

#### Scenario: A tournament invents a label its discipline never named
- **WHEN** a tournament declares a tag the bound discipline does not define
- **THEN** the tag is available in that tournament, and the discipline module is untouched

#### Scenario: A tag applied to a level it does not declare is refused
- **WHEN** a tag declared for persons is applied to a club
- **THEN** the application is refused, naming the granularities the tag declares

### Requirement: Applying and lifting a tag are recorded facts
A tag SHALL be applied and lifted by recording facts carrying the actor, the reason and the instant,
and whether it currently applies SHALL be derived from those facts rather than stored as a flag.

#### Scenario: What was true last April is still answerable
- **WHEN** a tag that was applied and later lifted is inspected
- **THEN** both facts remain readable, with who did each and why, and the tag reads as not applying now

#### Scenario: A tag that expires at a level stops applying without anybody clearing it
- **WHEN** a tag declares that it lasts until a competition level ends, and that level ends
- **THEN** it stops applying, with no stored flag having been updated

#### Scenario: The four paths that move a number move a tag
- **WHEN** a tag is applied by a rule, by an event definition, by a script action, or by an operator
- **THEN** it is recorded the same way in each case, and an operator's application carries an audit
  row like any other manual change

#### Scenario: A script declares a tag rather than writing one
- **WHEN** a script attached at a hook applies a tag
- **THEN** it produces a declared effect with a stable identity, and re-evaluating the same facts
  applies the tag once

### Requirement: A tag states what is true and enforces nothing
Carrying a tag SHALL NOT by itself block, refuse or alter any operation; a competition that wants an
effect SHALL read the tag where that decision already lives.

#### Scenario: A suspended player is not blocked by the tag itself
- **WHEN** a person carrying a suspension tag is named in a lineup
- **THEN** the tag does not refuse the lineup; whether the lineup is refused is the competition's
  configured decision

#### Scenario: Two competitions read the same tag differently
- **WHEN** one tournament treats a tag as disqualifying and another does not
- **THEN** both are expressible without changing the tag, because the consequence lives with each
  competition rather than with the label

