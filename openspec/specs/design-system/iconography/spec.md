# design-system/iconography Specification

## Purpose
Defines shared icon usage, rendering, sizing and accessibility requirements so interface icons remain consistent across CopaLibre surfaces.

## Requirements

### Requirement: Icons come from one registry with one rendering contract

Every interface icon SHALL render through the `Icon` atom of its rendering technology, using a semantic
key from one registry. The registry resolves to Lucide first, Tabler for glyphs Lucide lacks, and a
custom 24-unit SVG last. Icons SHALL render at 16, 20 or 24 px, with stroke width 1.5, in
`currentColor`.

#### Scenario: A call site asks for a glyph by meaning

- **WHEN** a component needs a venue icon
- **THEN** it renders `Icon` with the key `venue`, and no component outside the registry imports an
  icon package directly

#### Scenario: An off-scale size is refused

- **WHEN** a component requests an 18px icon
- **THEN** type checking or the ownership lint fails

### Requirement: Tabler glyphs are optically matched to Lucide

A Tabler glyph SHALL render scaled to 110% about its centre inside the same box as a Lucide glyph of
the same size, so the two sets read at the same optical size.

#### Scenario: Mixed toolbar

- **WHEN** a toolbar shows a Lucide clock and a Tabler football at 20px
- **THEN** the Tabler glyph carries the scale class, and both glyphs' outer strokes reach the same
  distance from the box edge, within 0.5 units

### Requirement: Icons are accessible and never the only cue

A decorative icon SHALL be hidden from assistive technology. A standalone meaningful icon SHALL carry
an accessible label. A state SHALL never be conveyed by an icon's colour alone.

#### Scenario: Icon-only button

- **WHEN** an icon-only retry button renders without an accessible label
- **THEN** the component throws in development, and the unit test fails

### Requirement: State shapes and disclosure carets are registry icons

The shape that accompanies a result or match state (live, upcoming, final, disputed, winner, loser, to be
decided, cancelled), the completion figure's state mark, and the caret of a disclosure control SHALL render as
icons from the icon registry, under its rendering contract, not as text characters. Each state SHALL keep a
shape of its own, its word and its colour, so the state is never conveyed by colour alone.

#### Scenario: A final match on the public matches page

- **WHEN** a final match renders with its state badge
- **THEN** the badge shows the final state's registry icon, hidden from assistive technology, beside the word
  for the state

#### Scenario: Every state has a distinct shape

- **WHEN** the state shapes are rendered side by side
- **THEN** no two states share an icon, and each icon resolves through the registry

#### Scenario: The header's language and theme controls

- **WHEN** the public header renders its language or theme control
- **THEN** the caret beside the current value is a registry icon, not a text character

#### Scenario: A state shape inside text

- **WHEN** a component used to join the state mark and the state word into one string
- **THEN** it renders the icon and the word as separate nodes, and the visible text reads as the word alone
