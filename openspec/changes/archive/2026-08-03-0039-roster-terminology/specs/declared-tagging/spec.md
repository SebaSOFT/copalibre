## MODIFIED Requirements

### Requirement: A tag states what is true and enforces nothing
Carrying a tag SHALL NOT by itself block, refuse or alter any operation; a competition that wants an
effect SHALL read the tag where that decision already lives.

#### Scenario: A suspended player is not blocked by the tag itself
- **WHEN** a person carrying a suspension tag is named in a roster
- **THEN** the tag does not refuse the roster; whether the roster is refused is the competition's
  configured decision

#### Scenario: Two competitions read the same tag differently
- **WHEN** one tournament treats a tag as disqualifying and another does not
- **THEN** both are expressible without changing the tag, because the consequence lives with each
  competition rather than with the label
