# design-system/operational-surface-parity Specification

## Purpose
Make CopaLibre's operational, public, broadcast and informational surfaces deliver the visual language the `copalibre-app` reference project renders, with reusable presentation, truthful data and reviewable production rendering.

## Requirements

### Requirement: Reference-calibrated component presentation

Operational compositions SHALL use generated semantic and component roles calibrated to the reference project for color, surface depth, typography, numeric alignment, borders, chamfers and density. Calibration SHALL include the primary action fill, secondary hover fill and outline, lifted chrome and inset content wells. It SHALL verify actual font loading and role assignment, and record any deliberate accessibility adaptation with measured contrast evidence. Reference visual colors SHALL enter components through the shared token contract, never raw per-story or per-page overrides.

The primary-action role SHALL be calibrated on its own. The declared brand primitive backing live state and the focus ring SHALL NOT move with it, so calibrating a call to action does not re-tint every live badge and focus ring on three surfaces.

#### Scenario: Reference action and surface comparison

- **WHEN** a reviewer opens the reference button and standings compositions
- **THEN** the primary CTA uses the calibrated reference treatment, the secondary has distinct default and hover outlines, and the table has visually distinct band, well, header and row surfaces
- **AND** the review records role-to-value mappings and any contrast-driven deviation

#### Scenario: Calibrating the action leaves live state alone

- **WHEN** the primary-action role is calibrated to the reference
- **THEN** the live-state and focus-ring roles still resolve to the declared brand primitive, unchanged

#### Scenario: Typeface delivery and fallback

- **WHEN** a reference composition renders with fonts available and then with font delivery blocked
- **THEN** the available case uses the intended condensed display, body and mono faces for their roles, and the fallback case retains readable complete labels, scores and actions

### Requirement: Surface depth alternates for content and lifts for chrome

Surface level SHALL follow two rules taken from the reference project, not from a container's nesting
depth alone.

A content container — a section, a card shell, an inset block holding what is being read — SHALL
alternate against the level it sits on, so a card on a dark band goes lighter and the same card on a
light band goes darker. Alternation SHALL continue for as long as content nests: an inset inside a card
returns to the parent band's level.

Chrome — a panel header, a footer, a chip, a tag, an eyebrow, an icon well — SHALL lift to the chrome
level regardless of what it sits on, so a header reads as a header at any depth.

Every boundary between two levels SHALL carry the border cue the semantic token contract already
requires of a panel, so two adjacent levels are separable without relying on the fill difference alone.

Alternating rows within a table SHALL be declared as their own opaque roles rather than as a
translucent fill over whatever sits behind them, so their contrast is verifiable from the token values.

Each level SHALL meet the contrast gates the token package already enforces for the text and border
tokens rendered on it.

#### Scenario: The same card alternates against different bands

- **WHEN** one card renders on a dark section band and an identical card renders on a lighter band
- **THEN** the first resolves lighter than its band and the second resolves darker than its band

#### Scenario: Chrome lifts at any depth

- **WHEN** a panel header renders inside a card that has itself alternated
- **THEN** it resolves to the chrome level rather than continuing the alternation

#### Scenario: Content nests by alternating

- **WHEN** an inset block renders inside a card that alternated away from its band
- **THEN** the inset returns to the band's level, so each boundary stays visible

#### Scenario: Rows are opaque roles

- **WHEN** a table's alternating rows are inspected
- **THEN** each resolves to a declared opaque token whose contrast is verifiable, not to a translucent
  fill over an assumed background

#### Scenario: Text stays legible at every level

- **WHEN** the generated surface levels are checked
- **THEN** the text and border tokens rendered on each level meet the AA gates the token package enforces

### Requirement: Server-rendered components are reviewable through their real renderer

The workbench SHALL provide a preview seam that renders a server-rendered component through its production implementation, with the selected locale and viewport, rather than a separately maintained imitation. It SHALL report an unavailable preview clearly when its local server is absent.

A preview SHALL NOT be reachable outside development: it SHALL answer as an unknown path in a production deployment, SHALL NOT appear in the sitemap, and SHALL accept only an allowlisted component identifier and a supported locale — never markup, so the seam cannot become a rendering hole in the one surface whose purpose is showing what actually renders.

Fixture data used for review SHALL be deterministic and coherent: fixture snapshots identified consistently, tied standings agreeing with their supporting data, and each discipline retaining its own labels, statistics, clock and event vocabulary. Interface labels SHALL follow the eight-language toolbar.

#### Scenario: Static-renderer component preview

- **WHEN** a public header or table story represents a server-rendered component
- **THEN** the preview uses that production renderer with the selected locale and viewport, reports an unavailable preview clearly when its local server is absent, and does not claim parity from a separately maintained imitation

#### Scenario: A preview is unreachable in production

- **WHEN** a preview path is requested from a production deployment
- **THEN** it answers as an unknown path, and no preview path appears in the sitemap

#### Scenario: A preview renders only what it allowlists

- **WHEN** a preview is requested for an identifier the route does not allowlist, or with markup in place of a component id
- **THEN** it answers as an unknown path rather than rendering the input

#### Scenario: Coherent and discipline-driven examples

- **WHEN** the live, standings, audit and bracket fixtures render alongside a basketball or supported multi-segment example
- **THEN** fixture snapshots are identified consistently, tied standings agree with their supporting data, and each discipline retains its own labels, statistics, clock and event vocabulary
