## MODIFIED Requirements

### Requirement: Eligibility and advancement guards
The engine SHALL evaluate eligibility (participant and roster facts) and advancement
(state-transition) guards as deterministic Neuron-JS decisions consuming a compiled `MatchRuleset`
and the `Event` log as inputs. A roster fact SHALL describe a match-specific player selection, not a
team membership.

#### Scenario: Ineligible participant is blocked
- **WHEN** an eligibility guard evaluates a participant who fails a configured eligibility condition
- **THEN** the guard returns a blocking result with an explanation trace naming the failed condition

#### Scenario: Advancement guard blocks progression on an unresolved prerequisite
- **WHEN** an advancement guard evaluates a stage whose prerequisite matches have no recorded result
- **THEN** the guard returns a blocking result rather than allowing progression
