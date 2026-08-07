# stage-qualification Specification

## Purpose
Connects one stage's completed standings to the next stage's entrant list and seed order, under the
operator's chosen allocation mode, with the same explainability the standings themselves carry —
TMS-012.

## Requirements
### Requirement: Entrants carry operator-supplied tournament-scoped attributes
An operator SHALL be able to attach numeric and categorical attributes to an entrant when loading it
into a tournament, and those attributes SHALL be scoped to that tournament.

#### Scenario: A ranking is supplied while loading teams
- **WHEN** an operator loads entrants and supplies a numeric `ranking` for each
- **THEN** the ranking is stored against those entrants for this tournament and is available to
  seeding without affecting the same entrants in any other tournament

#### Scenario: Categorical attributes are stored without interpretation
- **WHEN** an operator supplies `region=san-juan` for several entrants
- **THEN** the value is stored verbatim and the system attaches no meaning to it beyond matching

### Requirement: A stage is filled by one of three allocation modes
A stage SHALL declare whether its entrants and seed order come from automatic qualification, manual
placement, or a weighted entrant attribute.

#### Scenario: Automatic allocation from the qualification cut
- **WHEN** a stage declares automatic allocation and the prior stage completes
- **THEN** the qualified entrants fill the stage in cut order

#### Scenario: Weighted allocation ignores qualification order
- **WHEN** a stage declares allocation weighted by the `ranking` attribute
- **THEN** seed order follows the ranking values, not the order entrants emerged from the prior stage

#### Scenario: Manual allocation overrides and is audited
- **WHEN** an operator manually places an entrant into a seed position
- **THEN** the placement is applied and recorded in the audit trail with the acting operator

### Requirement: Qualification is evaluated by the tiebreak comparator pipeline
A qualification cut SHALL be declared as a comparator sequence evaluated against stage standings, and
SHALL produce the same class of explanation trace the standings produce.

#### Scenario: A multi-criteria cut resolves and explains itself
- **WHEN** a cut declares most frags, then fewest deaths, and sixteen entrants must be selected
- **THEN** exactly sixteen qualify and the trace names each comparator and the values it compared

#### Scenario: A participant who missed the cut can be told why
- **WHEN** an entrant finishes immediately below the cut line
- **THEN** the trace shows which comparator separated it from the last qualifying entrant

#### Scenario: A ratio criterion handles a zero denominator explicitly
- **WHEN** a cut ranks by K/D ratio and an entrant recorded zero deaths
- **THEN** the declared zero-denominator behaviour is applied and named in the trace, rather than
  producing an infinite or undefined value

### Requirement: A tie at the cut line is never silently broken
When the comparator sequence is exhausted and entrants remain tied across the cut line, the cut SHALL
report as unresolved rather than selecting arbitrarily.

#### Scenario: An unresolved cut blocks automatic progression
- **WHEN** two entrants remain tied for the final qualifying position after every comparator
- **THEN** the cut is reported unresolved, the next stage is not populated, and the operator is
  offered a declared resolution or an audited override

### Requirement: Qualification reads stage standings, not individual match results
A qualification cut SHALL be computed from aggregated stage standings.

#### Scenario: Aggregate performance decides, not position within one match
- **WHEN** entrants compete in separate heats of differing strength and qualification is declared on
  aggregate performance
- **THEN** entrants qualify on their aggregated standings values regardless of their position within
  their own heat

### Requirement: Stage completion gates next-stage generation
The next stage's fixtures SHALL NOT be generated until the prior stage is marked complete and its
qualification output is resolved.

#### Scenario: Next stage blocked on incomplete prior stage
- **WHEN** an operator attempts to generate the next stage's fixtures while the prior stage still has
  unresolved matches
- **THEN** the system rejects the request and identifies which matches remain unresolved

### Requirement: Advancement preview without commitment
An operator SHALL be able to preview which entrants would currently qualify from an in-progress stage
without generating or committing the next stage's fixtures.

#### Scenario: Preview does not mutate state
- **WHEN** an operator requests a qualification preview mid-stage
- **THEN** the preview reflects current standings and no next-stage fixture or seed assignment is
  created as a result
