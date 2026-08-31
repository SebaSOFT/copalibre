# result-correction-authority Specification

## Purpose
Guarantees that once the engine calculates a result, it can only ever change through an audited,
previewed, reason-carrying correction — never a silent overwrite — so every published outcome
remains trustworthy and traceable.

## Requirements

### Requirement: No direct overwrite of a calculated outcome
The system SHALL NOT provide any endpoint or operation that directly overwrites a game/set, match,
ranking, or advancement outcome once calculated.

#### Scenario: Direct score edit attempt is rejected
- **WHEN** a client attempts to modify a finalized match's score through any path other than the correction workflow
- **THEN** the request is rejected

### Requirement: A correction requires actor, reason, and full state transition
Every correction SHALL record the acting user, a timestamp, an explicit reason, the prior state, and
the replacement state. The replacement state SHALL name exactly the same set of entrants as the prior
state — no entrant duplicated, none dropped — since a correction changes what happened to the match's
existing sides, not which sides existed.

#### Scenario: Correction without a reason is rejected
- **WHEN** a correction request omits a reason
- **THEN** the request is rejected before any state changes

#### Scenario: Correction preserves the prior fact
- **WHEN** a correction is committed
- **THEN** the original fact and its prior calculation trace remain retrievable, not deleted or overwritten in place

#### Scenario: A replacement that duplicates or drops an entrant is rejected
- **WHEN** a correction's replacement state names an entrant more than once, or omits an entrant the
  prior state had
- **THEN** the request is rejected before any state changes, naming the mismatch, rather than committed
  with one entrant counted twice and another silently absent

### Requirement: Corrections preview downstream impact before commit
Before a correction commits, the system SHALL show which standings and future fixtures would change
as a result.

#### Scenario: Correction preview matches actual post-commit effect
- **WHEN** a correction's downstream-impact preview is requested and then the same correction is committed
- **THEN** the standings and fixture changes that actually occur match what the preview showed

### Requirement: Corrections do not auto-propagate into an already-started downstream stage
A correction that would alter a fixture whose downstream stage has already started SHALL be blocked
from automatic propagation, pending explicit authorized resolution.

#### Scenario: Correction affecting a started downstream stage is blocked from auto-propagating
- **WHEN** a correction to an earlier-stage result would change the composition of a later stage that has already started
- **THEN** the correction commits the corrected fact but does not automatically alter the started downstream stage, and surfaces the conflict for authorized resolution

### Requirement: Correction audit trail is queryable
Every correction SHALL be retrievable as part of the match's or tournament's audit history, showing
the full chain of prior states.

#### Scenario: Multiple corrections preserve full history
- **WHEN** a result is corrected more than once
- **THEN** every prior state in the chain remains individually retrievable, in order

### Requirement: Correcting a match of a series previews its effect on the series
A correction to a match belonging to a series SHALL preview, before commit, whether the correction
changes the series result, whether it changes the point at which the series became decided, and which
matches would consequently stop or start being required. Correcting one match SHALL NOT silently
un-anull or anull another.

#### Scenario: A correction that reverses a decided series is previewed in full
- **WHEN** an operator proposes correcting the third match of a best-of-five that stands at three-nil
- **THEN** the preview states the series result before and after, that the series would no longer be
  decided, and that matches four and five would return from not-required to scheduled

#### Scenario: A correction that leaves the series result intact says so
- **WHEN** an operator proposes correcting the score of a match in a series whose result the correction
  does not change
- **THEN** the preview states that the series result and its decision point are unaffected, and that no
  match changes its required state

#### Scenario: Reinstating an anulled match restores it explicitly
- **WHEN** a committed correction makes a previously anulled match necessary again
- **THEN** the match returns to a playable state as an audited fact naming the correction that caused
  it, and it carries no schedule until one is assigned, because the slot it held was released

#### Scenario: A series correction does not auto-propagate into a started downstream stage
- **WHEN** a correction would change which entrant won a series whose winner already appears in a
  started downstream stage
- **THEN** propagation is blocked pending an authorized resolution, exactly as it is for a single-match
  result
