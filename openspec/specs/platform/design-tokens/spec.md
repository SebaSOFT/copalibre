# design-tokens Specification

## Purpose
Gives every CopaLibre rendering surface one consistent, generated implementation of the Broadcast
Command Precision visual identity, and structurally guarantees it never converges with
`sebasoft-app`'s unrelated cyberpunk-wireframe identity.

## Requirements

### Requirement: Single source-of-truth token definitions
`packages/design-tokens` SHALL define color, typography, spacing, radius, motion, and semantic state
tokens in one source, generating both CSS custom properties and Tailwind tokens from it, so no value
is hand-maintained in two places.

#### Scenario: A token value changes once, propagates everywhere
- **WHEN** a semantic state color (e.g. the "live" token) is changed in the source definition
- **THEN** both the generated CSS custom properties output and the generated Tailwind tokens output reflect the new value without a second manual edit

### Requirement: Semantic font-size scale
`packages/design-tokens` SHALL define a font-size scale as part of its single source-of-truth token
set (alongside color, typography-family, spacing, radius, and motion), generating both CSS custom
properties and Tailwind `fontSize` tokens from it, so no font-size value is hand-maintained in two
places or picked ad hoc by a component.

#### Scenario: A font-size step changes once, propagates everywhere
- **WHEN** a font-size scale step is changed in the source definition
- **THEN** both the generated CSS custom properties output and the generated Tailwind `fontSize` output
  reflect the new value without a second manual edit

#### Scenario: The scale has a documented, consistent ratio
- **WHEN** the font-size scale is inspected
- **THEN** each step's relationship to the next follows one documented ratio or named progression,
  rather than being a set of independently chosen values

### Requirement: Responsive breakpoint tokens
`packages/design-tokens` SHALL define responsive breakpoint tokens at 375, 768, 1024, and 1440 px —
the same four widths the visual-identity doctrine's Responsive and visual-review gates already require
as screenshot acceptance evidence — generating both CSS custom properties (for use in `@media` queries
or container queries) and Tailwind `screens` tokens from the same source.

#### Scenario: A breakpoint value changes once, propagates everywhere
- **WHEN** a breakpoint token value is changed in the source definition
- **THEN** both the generated CSS custom properties output and the generated Tailwind `screens` output
  reflect the new value without a second manual edit

#### Scenario: Breakpoint set matches the doctrine's acceptance-gate widths
- **WHEN** the generated breakpoint token set is inspected
- **THEN** it contains exactly the 375, 768, 1024, and 1440 px widths named in the visual-identity
  doctrine's screenshot acceptance gate, with no undocumented additional breakpoint

### Requirement: Broadcast Command Precision palette and typography
The generated token set SHALL include the ink/text scale, cyan live/active tokens, amber
upcoming/attention tokens, green positive-result tokens, red destructive/disputed/loss tokens, a
reserved (non-core-chrome) team-accent slot, and the Barlow Condensed / Barlow / JetBrains Mono
typography stack.

#### Scenario: Core chrome never uses the reserved team-accent color
- **WHEN** any core UI component token (navigation, primary buttons, system badges) is inspected
- **THEN** none of them resolve to the reserved team-accent color value

### Requirement: State badges pair color with text
Any generated badge/status component token SHALL require a text label alongside its color, and
SHALL NOT define a color-only state representation.

#### Scenario: Badge component requires a label prop
- **WHEN** the badge component token/contract is used without a text label
- **THEN** the build fails or the component renders a visible validation error, never a color-only badge

### Requirement: Chamfered-corner motif with progressive enhancement
The token set SHALL define one shared chamfer size applied via `clip-path` or the `corner-shape`
property, with a documented `@supports` fallback to square corners on unsupported browsers.

#### Scenario: Unsupported browser falls back gracefully
- **WHEN** a browser without `corner-shape`/`clip-path` chamfer support renders a chamfered component
- **THEN** the component renders with square corners and remains fully usable, not visually broken

### Requirement: Forbidden cyberpunk-wireframe token isolation
The generated token output SHALL NOT contain any value from the `sebasoft-app` cyberpunk-wireframe
forbidden list, including but not limited to `#f3e600`, `#C5003C`, CP2077-labeled token names,
DATA_BLOB labels, TRON grid patterns, or scanline effect definitions.

#### Scenario: CI blocks a forbidden-token regression
- **WHEN** a pull request adds a token value or name matching an entry on the forbidden list
- **THEN** the forbidden-token CI check fails and blocks the pull request

### Requirement: Reduced-motion compliance
All motion tokens SHALL collapse to negligible duration when `prefers-reduced-motion: reduce` is
active.

#### Scenario: Reduced motion disables animation
- **WHEN** a client has `prefers-reduced-motion: reduce` set
- **THEN** every component using a motion token renders with animation/transition duration effectively removed

### Requirement: Style-guide route for visual verification
The platform SHALL provide a route rendering every generated token and core component for manual and
automated visual smoke-testing, including a labelled sample of every font-size scale step at every
generated breakpoint.

#### Scenario: Style guide renders all core components
- **WHEN** the style-guide route is loaded
- **THEN** it renders at least one instance of every card, badge, button variant, alert, and stat-tile
  component defined by the token package

#### Scenario: Style guide renders the font-size scale
- **WHEN** the style-guide route is loaded
- **THEN** it renders a labelled sample of every font-size scale step, so a reviewer can visually
  confirm the scale's steps are legible and distinguishable from one another

### Requirement: Responsive layout compliance across every screen
Every Control route and every Public/TV page template SHALL render without horizontal overflow at
375 px width (except a table whose overflow has a visible scroll affordance), SHALL keep score, state,
primary action, and current-match content visible without decorative obstruction at every one of the
375/768/1024/1440 px reference widths, and SHALL remain usable at 200% browser zoom without clipped
labels or unreachable controls.

#### Scenario: No unintended horizontal overflow at the smallest reference width
- **WHEN** any Control or Public/TV screen is rendered at 375 px width
- **THEN** no horizontal scrollbar appears, unless the overflowing content is a table with a visible
  scroll affordance

#### Scenario: Critical content survives every reference width
- **WHEN** a live-match or standings-bearing screen is rendered at each of 375/768/1024/1440 px
- **THEN** score, state, primary action, and current match remain visible without being obscured by
  decorative elements

#### Scenario: 200% zoom stays usable
- **WHEN** a screen is viewed at 200% browser zoom
- **THEN** no form label is clipped and no interactive control becomes unreachable

### Requirement: Long content truncates without losing meaning
Any field displaying a long team, participant, tournament, venue, or sponsor name SHALL use
`min-width: 0` with an ellipsis or explicit wrapping rule, and SHALL make the full text available
(e.g. via a title attribute or accessible expansion) rather than silently cutting it with no recovery
path.

#### Scenario: A long name truncates visibly, not silently
- **WHEN** a team, participant, tournament, venue, or sponsor name exceeds its container's width
- **THEN** the display truncates with an ellipsis (or wraps, per the component's own rule) and the full
  text remains accessible, rather than overflowing its container or disappearing
