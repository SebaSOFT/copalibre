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

A typeface the token set names SHALL also be delivered by it: naming a family in a font stack is a
declaration of intent, not a guarantee that the face exists on the machine rendering it. The
stylesheet that declares the families SHALL be the same artifact that loads them, so a surface cannot
obtain one without the other. Every heading element SHALL resolve to the display family without a
component having to ask for it, since a heading rendered in the body face is the identity silently
not being applied.

#### Scenario: Core chrome never uses the reserved team-accent color
- **WHEN** any core UI component token (navigation, primary buttons, system badges) is inspected
- **THEN** none of them resolve to the reserved team-accent color value

#### Scenario: A named family is actually available to render
- **WHEN** a surface loads the generated stylesheet
- **THEN** each named family is available to the renderer, and two different families do not measure
  the same string identically — which is what a silent fallback to one system face looks like

#### Scenario: A heading uses the display face without being told to
- **WHEN** a page renders a bare heading element that no component class styles
- **THEN** it resolves to the display family, rather than inheriting the body face

### Requirement: State badges pair color with text
Any generated badge/status component token SHALL require a text label alongside its color, and
SHALL NOT define a color-only state representation.

#### Scenario: Badge component requires a label prop
- **WHEN** the badge component token/contract is used without a text label
- **THEN** the build fails or the component renders a visible validation error, never a color-only badge

### Requirement: Chamfered-corner motif with progressive enhancement
The token set SHALL define one shared chamfer size applied exclusively via the `corner-shape: bevel`
property and 4-value `border-radius`, without any `clip-path` fallback.

The chamfer SHALL cut one diagonal pair: the top-right and bottom-left corners (`border-radius: 0 var(--cl-chamfer-size) 0 var(--cl-chamfer-size)`),
leaving top-left and bottom-right square. Small square controls — a checkbox, a radio — are the exception
and SHALL cut all four, because an asymmetric cut at that size reads as a rendering fault rather than a shape.

Where a component chamfers only some of its corners, that SHALL be expressed by setting a zero radius
on the corners that stay square (`border-radius: 0`), never by authoring polygon masks.

A component whose focus indicator or ambient glow is drawn outside its own box — such as a `box-shadow`
ring or `--cl-glow-cyan` — SHALL NOT be clipped to its chamfer because `clip-path` is strictly prohibited
for chamfer geometry. External focus rings and ambient glows stay intact across all rendering contexts.

#### Scenario: Unsupported browser falls back gracefully
- **WHEN** a browser without `corner-shape` support renders a chamfered component
- **THEN** the component renders with square corners (via zero or ignored radius) and remains fully usable without visual clipping defects

#### Scenario: Both rendering paths cut the same shape
- **WHEN** the chamfer motif is rendered via `corner-shape: bevel` with 4-value `border-radius`
- **THEN** both diagonal corner cuts (top-right and bottom-left) match the specified `--cl-chamfer-size` dimensions identically, standardizing single-path beveling without clip-path divergence

#### Scenario: A focus ring survives the chamfer
- **WHEN** a component draws its focus indicator or ambient glow as a shadow outside its own box
- **THEN** it is not clipped to the chamfer, and the indicator stays visible on every browser

### Requirement: A component's styling is reachable wherever the component renders
Styling that a component depends on SHALL live where every surface rendering that component can load
it — the shared token stylesheet, or a stylesheet a surface imports — and SHALL NOT live inside a
single page or layout's own `<style>` block, scoped or global.

A layout's own block is for what belongs to the page: document chrome, presentation modes, the
backdrop. The moment it styles a class the layout's own file does not render, that styling has become
unreachable to every other surface, and the component is correct on one page and wrong everywhere
else. This fails quietly, because the page that owns the rule always looks right.

The same rule applies to base element treatments — link colour, heading family — which belong to every
surface and therefore to the shared stylesheet, not to whichever layout happened to need them first.

#### Scenario: A component's rules are loadable by a second surface
- **WHEN** a component is rendered on a surface other than the one it was written for
- **THEN** it carries its styling with it, because that styling is not private to another page

#### Scenario: A layout does not style what it does not render
- **WHEN** a layout's own style block declares a class that appears nowhere in that layout's markup
- **THEN** that declaration belongs in the shared stylesheet instead, where the components using it
  can reach it

#### Scenario: A base element treatment applies on every surface
- **WHEN** a surface renders a link or a heading
- **THEN** it receives the same treatment as every other surface, rather than depending on which
  layout wrapped it

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
generated breakpoint. The route SHALL render the marketing-surface component set (card, badge, button
variant, alert, stat-tile), the Control-web atom/molecule/organism set (text input, select, textarea,
checkbox, label, form-field, `DataEntityCard`, `DataTable`, `Modal`), and one populated example of each
Control-web template (`ListScreenTemplate`, `FormScreenTemplate`), so every tier stays verifiable from
the same page.

#### Scenario: Style guide renders all core components
- **WHEN** the style-guide route is loaded
- **THEN** it renders at least one instance of every card, badge, button variant, alert, and stat-tile
  component defined by the token package

#### Scenario: Style guide renders the font-size scale
- **WHEN** the style-guide route is loaded
- **THEN** it renders a labelled sample of every font-size scale step, so a reviewer can visually
  confirm the scale's steps are legible and distinguishable from one another

#### Scenario: Style guide renders the Control-web component set alongside the marketing set
- **WHEN** the style-guide route is loaded
- **THEN** it renders at least one instance of every Control-web atom (input, select, textarea,
  checkbox, label), the form-field molecule in both its normal and error states, the `DataEntityCard`
  molecule, the `DataTable` and `Modal` organisms, and one populated example of `ListScreenTemplate` and
  `FormScreenTemplate`, visibly distinguishable from the marketing-surface component set on the same
  page

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

### Requirement: Form-control and overlay component token contracts
`packages/design-tokens` SHALL define component token contracts for text input, select, textarea,
checkbox, and dialog/overlay (backdrop, surface, elevation) controls — resolved background, text,
border, and focus-ring values per interaction state (default, focus, error, disabled) for form controls,
and backdrop/surface/elevation values for the dialog/overlay contract — matching the pattern
`BadgeSpec`/`ButtonVariant`/`CARD_STATES` already establish for their respective components, so no
Control-web atom or organism hand-picks a color, spacing, or shadow value outside this contract.

#### Scenario: An error-state input resolves to the destructive semantic color
- **WHEN** the text-input component token contract's error state is inspected
- **THEN** its border and focus-ring values resolve to the same destructive semantic color token used
  elsewhere in the system (e.g. the destructive button variant), not an independently chosen red

#### Scenario: A disabled control's tokens are distinguishable from its default state
- **WHEN** the disabled-state tokens for any form-control contract are inspected
- **THEN** they differ from the default-state tokens in a way that communicates non-interactivity (e.g.
  reduced-contrast text/border), without relying on removing focus/hover behavior alone

#### Scenario: The dialog backdrop resolves to a documented overlay token
- **WHEN** the `Modal` organism's backdrop is inspected
- **THEN** its color/opacity value resolves to the dialog/overlay component token contract, not an
  independently chosen value

### Requirement: Control-web data-density composition tokens
`packages/design-tokens` SHALL define a documented, denser spacing-scale subset (or named density
level) for Control-web composition, generated from the same single spacing-scale source used by the
marketing surfaces, so the Control-web visual mode differs from the marketing visual mode in composition
only, never in the underlying token values.

#### Scenario: Control-web density tokens are a subset of the shared spacing scale
- **WHEN** the generated Control-web density spacing tokens are inspected
- **THEN** every value is drawn from the same spacing-scale source the marketing surfaces use, with no
  Control-web-only spacing value absent from that shared scale

### Requirement: Pagination and toolbar density tokens
- The token contract SHALL include spacing, density, and type tokens used by ListScreenTemplate pagination and table toolbar.

#### Scenario: Developer adds high-density table toolbar
- **WHEN** a developer needs a high-density table toolbar in the admin surface
- **THEN** the tokens expose the expected scale and spacing without adding a new ad-hoc scale.

### Requirement: Template rendering token contract
- The style-guide route SHALL expose one rendered example per template type so template behavior is auditable without booting the app.

#### Scenario: Designer audits template examples
- **WHEN** a designer opens the style-guide route templates page
- **THEN** every template surfaces a populated example rendered against the design tokens.

### Requirement: Match-console template tokens
- The token contract SHALL include spacing, chroma, and motion tokens needed to render the MatchConsoleRoute template.

#### Scenario: Match console header resizes on compact viewport
- **WHEN** the console header compresses
- **THEN** the spacing and motion tokens produce the expected compact density and keep chroma contract intact.

### Requirement: The token style guide is reachable from the component workbench
The generated style guide SHALL be reachable from the component workbench, so a reviewer comparing a
component against the tokens it consumes does not have to open a second surface. It SHALL remain
generated from the token source rather than restated by hand in the workbench, so the two can never
disagree about what a token looks like.

#### Scenario: A reviewer reaches the tokens from the workbench
- **WHEN** a reviewer opens the component workbench
- **THEN** the generated style guide is one of its entries, alongside the component groups

#### Scenario: A token change reaches the workbench without being retyped
- **WHEN** a token's value changes and the token package is rebuilt
- **THEN** the style guide shown in the workbench reflects the new value, because the workbench
  presents the generated artifact rather than a hand-maintained copy of it

### Requirement: Surface styling resolves through declared tokens
Generated primitives, semantic tokens, component contracts, and surface aliases SHALL form a complete
contract for Control, public, TV, and help/docs rendering. A surface may add a token only when its
meaning is documented and it is emitted by the generated stylesheet.

#### Scenario: A surface needs a hover border
- **WHEN** a shared or surface component renders a hover border
- **THEN** it resolves through a declared semantic or component token rather than an undeclared alias or
  raw colour fallback

#### Scenario: A token is changed
- **WHEN** a declared token's value or role changes
- **THEN** every generated output and first-party surface consuming that name remains resolvable

### Requirement: Motion declarations are explicit and reduced-motion-safe
First-party UI styling SHALL not use unrestricted `transition: all` or animate layout-affecting
properties for ordinary interaction feedback. Motion SHALL name the affected compositor-safe property
and preserve the generated reduced-motion behavior.

#### Scenario: An interactive surface adds a transition
- **WHEN** an interactive component adds visual feedback
- **THEN** it names only the supported property or properties and uses the shared motion contract
