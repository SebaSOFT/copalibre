# standings-explainability Specification

## Purpose
Renders competition standings so every ranking and every tiebreak resolution is traceable to the
engine's own explanation trace, never a UI-only recomputation or approximation.
## Requirements
### Requirement: Standings table renders engine-sourced ranking
The system SHALL render a standings table (rank, participant, matches, win-draw-loss, points, and a
tiebreak indicator) populated from the published standings projection, not from a client-side
recalculation of raw match results.

#### Scenario: Standings reflect the latest published projection
- **WHEN** an operator opens a tournament's standings view
- **THEN** the rendered ranking matches the current `projectionVersion` returned by the standings API

### Requirement: Expandable tiebreaker resolution trace
Each standings row involved in a resolved tie SHALL expand to show a rule-by-rule tiebreaker
resolution trace, and that trace's text SHALL be sourced verbatim from the rules engine's
explanation-trace output for that ranking calculation.

#### Scenario: Trace matches engine output exactly
- **WHEN** an operator expands a tied row's tiebreaker trace
- **THEN** the rendered trace text is byte-for-byte identical to the `packages/rules` explanation
  trace returned for the same standings calculation on the same fixture

#### Scenario: Untied row has no trace to expand
- **WHEN** a row's ranking was not affected by any tiebreak comparator
- **THEN** the row shows no tiebreaker trace affordance

### Requirement: Non-color-redundant tiebreak indicator
The tiebreak indicator SHALL be distinguishable without relying on color alone (icon plus text
label), consistent with the accessibility rules in `copalibre-visual-identity.md`.

#### Scenario: Tiebreak indicator is legible without color
- **WHEN** the standings table is rendered in grayscale
- **THEN** every tiebreak indicator remains distinguishable via its icon and text label

