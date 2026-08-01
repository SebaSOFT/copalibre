# scripting-hook-surface Specification

## Purpose
Gives declarative rules somewhere to run: a named, core-owned set of moments in a competition's life
at which a script may be attached, and a contract for what attaching one means — including the
guarantee that an effect a script declares survives replay without duplicating itself.
## Requirements
### Requirement: Hook points are a core-owned taxonomy
The system SHALL publish the hook points a script may attach to as one taxonomy shared by every
evaluation, and a module SHALL NOT introduce a hook point of its own.

#### Scenario: A script attaches to a published hook
- **WHEN** a module attaches a script to a hook the taxonomy publishes
- **THEN** the attachment validates, and the script is evaluated when that hook is reached

#### Scenario: An unknown hook is refused with the alternatives named
- **WHEN** a module attaches a script to a hook point the taxonomy does not publish
- **THEN** validation fails naming the unknown hook and listing the published ones

#### Scenario: A hook no phase evaluates yet is declared but not silently ignored
- **WHEN** a script attaches to a published hook that no implemented evaluation reaches
- **THEN** the attachment is reported as inert rather than accepted as if it would run

### Requirement: The taxonomy covers the competition lifecycle
The taxonomy SHALL name the moments at which competition state changes: a match starting, pausing,
resuming and finishing; a segment starting, pausing and finishing; a decisive score change; a
discipline event recorded against a side; a stage starting and finishing; and a configured alert
being raised.

#### Scenario: A rule runs when a period ends
- **WHEN** a discipline attaches a script to the segment-finished hook
- **THEN** the script is evaluated as that segment closes, with the segment and its side scores
  available in the context

#### Scenario: A rule runs when a card is recorded
- **WHEN** a script is attached to the event-recorded hook
- **THEN** it is evaluated for each recorded discipline event, with the event's code, side and
  payload available in the context

#### Scenario: A score hook fires on every change, and the rule decides what mattered
- **WHEN** a score changes without changing which side leads
- **THEN** the hook still fires, and the context states the previous and current score and whether the
  lead changed, so a rule that only cares about a lead change can say so itself

#### Scenario: Each side and its score are readable, so a rule is one comparison
- **WHEN** a rule attached to the score hook asks whether the home side leads
- **THEN** each side's entrant and score are available in the context, and the comparison is expressible
  without the rule deriving either from the event that caused the change

#### Scenario: Home advantage is a property of a side, not of the match
- **WHEN** the sides of a match are read at any hook that publishes them
- **THEN** each side states whether it is at home, so a venue decision can read it per side rather
  than inferring it from a match-level pairing

#### Scenario: A duel-shaped rule is inert where home advantage does not apply
- **WHEN** a rule comparing the home and away scores is evaluated on neutral ground or at a
  placement match
- **THEN** the home and away values are absent rather than invented, and the rule can test for that
  absence instead of comparing two missing values

#### Scenario: A paused match states why it paused
- **WHEN** a match or segment is paused
- **THEN** the context carries the kind of pause and its reason, so a rule concerned with only one kind
  filters on a fact rather than requiring a hook of its own

#### Scenario: The draw and seed hooks keep working unchanged
- **WHEN** a draw constraint declared before this change is evaluated
- **THEN** it behaves identically, its hook now being one entry in the shared taxonomy

### Requirement: The context carries the competition environment
The context a hook publishes SHALL include the discipline, tournament, stage and organization the
evaluation belongs to, and the instant the evaluation is about, so a rule decides on current and
relevant data without reaching outside it.

#### Scenario: The context is data, and only data
- **WHEN** a context is handed to an element for evaluation
- **THEN** it is a serializable object carrying no functions, so it survives cloning, storage in the
  evaluation record and replay from that record without loss

#### Scenario: A redrawn value is a value, not a generator
- **WHEN** an element receives a freshly drawn identifier or random number
- **THEN** it receives it as a plain value in its own snapshot of the context, rather than a function
  the element would have to call

#### Scenario: Every instant in the context is an epoch
- **WHEN** any instant is published in the context
- **THEN** it is epoch milliseconds, carrying no zone and no formatting, so a rule reads the same
  value wherever it runs

#### Scenario: A rule reads the competition it belongs to
- **WHEN** a script attached at any hook reads the discipline, tournament, stage or organization
- **THEN** the values are present in the context at stable paths, without the script fetching them

#### Scenario: Independent draws within one evaluation
- **WHEN** two conditions in one evaluation each read the random value
- **THEN** each receives its own draw, so two coin flips are independent rather than identical

#### Scenario: A replay reproduces every draw from the recorded seed
- **WHEN** an evaluation is replayed
- **THEN** each element receives the value it received originally, reproduced from the seed stored
  with the evaluation, and the declared effects are identical

#### Scenario: The evaluation instant does not drift between elements
- **WHEN** several conditions in one evaluation read the current instant
- **THEN** all of them see the same instant, because the evaluation is about one moment rather than
  about however long it took to run

#### Scenario: No function reaches a clock, an identifier generator or a random source
- **WHEN** a script needs the current time, an identifier or a random draw
- **THEN** it reads the sampled value from the context, because no function provides one

#### Scenario: A sampled identifier never becomes an effect's identity
- **WHEN** a declared effect is produced during an evaluation that sampled an identifier
- **THEN** the effect's identity is derived from its cause, so two replicas evaluating the same event
  produce one identity and the alert is delivered once

### Requirement: An action declares an effect, it never performs one
An action that produces a side effect SHALL record it as a declared effect carrying a stable
identity derived from what caused it, and SHALL NOT deliver, send or start anything itself.

#### Scenario: Re-evaluating a match produces no duplicate notification
- **WHEN** a match's events are re-evaluated after a reconnect, a refresh or a recalculation
- **THEN** each declared notification carries the identity it carried before, and delivery
  deduplicates it rather than raising a second alert

#### Scenario: Replaying a match does not restart a running clock
- **WHEN** a script that starts a timer is evaluated again during a replay
- **THEN** the declared timer keeps its original start instant and duration, and the remaining time
  derives from those rather than beginning afresh

#### Scenario: A stopped timer stays stopped under replay
- **WHEN** a timer was stopped and the events leading to it are replayed
- **THEN** the timer resolves as stopped, at the instant it originally stopped

### Requirement: Script semantics are stated, not inferred
The system SHALL define what a script with no rules, a rule with no conditions and a rule with no
actions do, and SHALL behave that way at every hook.

#### Scenario: An empty script passes
- **WHEN** a script with no rules is evaluated at a hook whose polarity is permissive
- **THEN** it passes, having forbidden nothing

#### Scenario: A guard is the deliberate exception
- **WHEN** a script with no rules is evaluated as a guard
- **THEN** the guard denies, because a guard is default-deny and silence must never authorise

#### Scenario: A rule with no conditions always fires
- **WHEN** a rule declares no conditions
- **THEN** its actions execute every time the rule is reached

#### Scenario: A rule with no actions changes nothing
- **WHEN** a rule declares no actions
- **THEN** evaluation records that it fired and no state changes

