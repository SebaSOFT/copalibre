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
automated visual smoke-testing.

#### Scenario: Style guide renders all core components
- **WHEN** the style-guide route is loaded
- **THEN** it renders at least one instance of every card, badge, button variant, alert, and stat-tile component defined by the token package

