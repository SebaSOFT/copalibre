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

The generated token set SHALL include the palette roles and the Barlow Condensed / Barlow /
JetBrains Mono typography stack. A typeface the token set names SHALL also be delivered by it,
through the same stylesheet that declares the families, so a surface cannot obtain one without the
other. Every heading element SHALL resolve to the display family without a component asking for it.

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

#### Scenario: The palette roles

- **WHEN** the token set is generated
- **THEN** it includes the ink and text scale, cyan live/active, amber upcoming/attention, green
  positive-result and red destructive/disputed/loss tokens, and a reserved team-accent slot outside
  core chrome

#### Scenario: Naming is not delivering

- **WHEN** a family is named in a font stack
- **THEN** the face is also loaded, because naming it only declares intent

#### Scenario: Why headings resolve on their own

- **WHEN** a heading renders in the body face
- **THEN** the identity has silently not been applied, which is what the rule prevents

### Requirement: State badges pair color with text
Any generated badge/status component token SHALL require a text label alongside its color, and
SHALL NOT define a color-only state representation.

#### Scenario: Badge component requires a label prop
- **WHEN** the badge component token/contract is used without a text label
- **THEN** the build fails or the component renders a visible validation error, never a color-only badge

### Requirement: Badge state tones are defined tokens

The token set SHALL define a generated token and CSS custom property for each named badge tone the
product writes, resolving consistently wherever its class is used, independent of any page-local
stylesheet, and following the color-plus-label pairing "State badges pair color with text" requires.
The `live` and `final` styles SHALL keep their appearance as declared tokens. Pages SHALL NOT define
an overriding badge tone in a page-local stylesheet.

#### Scenario: A badge tone renders identically on every surface that uses it
- **WHEN** a component applies the `live`, `final`, `upcoming`, `stage`, `muted`, or `positive` badge
  tone on any page
- **THEN** it resolves to the same generated token's color and typography treatment as every other
  surface using that same tone

#### Scenario: Existing badge tones keep their appearance
- **WHEN** `live` and `final` use the declared token-backed rules
- **THEN** their color, background and border treatments match the previous generated rules

#### Scenario: An undefined tone is not silently accepted
- **WHEN** a component requests a badge tone outside the defined set
- **THEN** the build fails or falls back to the default badge treatment, never to an unstyled or
  browser-default appearance

#### Scenario: The tones

- **WHEN** the badge tokens are generated
- **THEN** they cover `live`, `final`, `upcoming`, `stage`, `muted` and `positive`

### Requirement: Chamfered-corner motif with progressive enhancement

The token set SHALL define one shared chamfer size and a smaller control size, applied only through
`corner-shape` and `border-radius`, per corner, never through `clip-path` or polygon masks. The
motif SHALL be a family whose default is the diagonal pair, with each single corner of that pair and
the control-sized variant available, and SHALL degrade from shorthand to longhands to square corners
on a fully usable component. Small square controls and badges SHALL follow their stated exceptions.

#### Scenario: Unsupported browser falls back gracefully
- **WHEN** a browser without `corner-shape` support renders a chamfered component
- **THEN** the component renders with square corners and remains fully usable without visual clipping defects

#### Scenario: A browser with only the per-corner longhands still gets the motif
- **WHEN** a browser supports the per-corner corner-shape longhands but not the shorthand
- **THEN** the chamfered corners still bevel, rather than falling back to square

#### Scenario: A composition cuts only the corner it needs
- **WHEN** a composition applies a single-corner variant
- **THEN** that corner bevels at the shared size and every other corner stays square

#### Scenario: Both rendering paths cut the same shape
- **WHEN** the chamfer motif is rendered through the supported path
- **THEN** the cut corners match the specified chamfer size identically, with no `clip-path` divergence

#### Scenario: A badge cuts its left corners only
- **WHEN** a badge is rendered on any surface
- **THEN** both of its left corners are cut at the shared chamfer size and both right corners are square,
  with no `clip-path` involved

#### Scenario: A focus ring survives the chamfer
- **WHEN** a component draws its focus indicator or ambient glow as a shadow outside its own box
- **THEN** it is not clipped to the chamfer, and the indicator stays visible on every browser

#### Scenario: The default and its parts

- **WHEN** a composition takes the default chamfer
- **THEN** top-right and bottom-left are cut and top-left and bottom-right stay square; a
  composition may instead cut a single corner of that pair, or use the control-sized variant

#### Scenario: Progressive enhancement

- **WHEN** a browser renders a chamfered component
- **THEN** it receives the shorthand when supported, the per-corner longhands when only those are,
  and square corners otherwise

#### Scenario: Small square controls cut all four

- **WHEN** a checkbox or radio renders
- **THEN** all four corners are cut, because an asymmetric cut at that size reads as a rendering
  fault

#### Scenario: A badge cuts one vertical pair

- **WHEN** a badge renders
- **THEN** both left corners are cut at the shared size and both right corners stay square: the
  diagonal pair would read as a skewed box and four cuts as a pill

#### Scenario: The badge divergence is recorded

- **WHEN** a reviewer compares badges with the reference project, which paints them square
- **THEN** the divergence is documented where the calibration is, so it is not read as drift

#### Scenario: Partial chamfers use zero radii

- **WHEN** a component chamfers only some corners
- **THEN** the others are left at a zero radius

#### Scenario: Outside rings are never clipped

- **WHEN** a component draws a focus ring or ambient glow outside its box, such as a `box-shadow`
  ring or `--cl-glow-cyan`
- **THEN** it is not clipped to the chamfer, because `clip-path` is prohibited for chamfer geometry

### Requirement: A component's styling is reachable wherever the component renders

Styling a component depends on SHALL live where every surface rendering that component can load it,
in the shared token stylesheet or a stylesheet a surface imports, and SHALL NOT live inside a single
page or layout's own `<style>` block, scoped or global. Base element treatments SHALL live in the
shared stylesheet.

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

#### Scenario: What a layout's own block is for

- **WHEN** a layout styles something
- **THEN** its block holds document chrome, presentation modes and the backdrop; styling a class its
  own file does not render makes that styling unreachable to every other surface

#### Scenario: Why the failure is quiet

- **WHEN** a component is styled inside one layout
- **THEN** the page that owns the rule always looks right, and every other page renders the
  component wrong

#### Scenario: Base treatments belong to every surface

- **WHEN** link colour or heading family is styled
- **THEN** it lives in the shared stylesheet, not in whichever layout needed it first

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
generated breakpoint, the marketing-surface and Control-web component sets, and one populated
example of each Control-web template.

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

#### Scenario: The components rendered

- **WHEN** the style guide renders
- **THEN** it shows the card, badge, button variants, alert and stat tile; the text input, select,
  textarea, checkbox, label, form field, `DataEntityCard`, `DataTable` and `Modal`; and
  `ListScreenTemplate` and `FormScreenTemplate`, so every tier is verifiable from one page

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

`packages/design-tokens` SHALL define component token contracts for form controls and for the
dialog/overlay, following the pattern `BadgeSpec`, `ButtonVariant` and `CARD_STATES` establish, so
no Control-web atom or organism hand-picks a color, spacing, or shadow value outside them.

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

#### Scenario: The controls covered

- **WHEN** the contracts are defined
- **THEN** they cover text input, select, textarea, checkbox, radio, file selection, and the
  dialog/overlay

#### Scenario: What each contract resolves

- **WHEN** a contract is read
- **THEN** a form control resolves background, text, border and focus ring per state (default,
  focus, error, disabled), and the dialog/overlay resolves backdrop, surface and elevation

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

### Requirement: A container resolves its own surface level, without a call-site decision

A card or section SHALL resolve its surface level from what it is, with no call-site decision:
content containers SHALL alternate against the level beneath, and chrome SHALL lift to the chrome
level at any depth. Levels SHALL be their own, visibly different semantic roles, and lifted chrome
and a selected container SHALL NOT resolve alike; selection SHALL keep its border and label or mark.
Every boundary SHALL carry the panel border cue. Broadcast content SHALL stop alternating after one
step.

#### Scenario: A screen composes a panel with no extra props
- **WHEN** a screen composes a card with a header and a body inside a section, passing no variant or
  modifier
- **THEN** the card alternates against the section, its header lifts to the chrome level, and each
  boundary carries a border

#### Scenario: The same card adapts to the band it sits on
- **WHEN** one card is composed on a dark band and an identical card on a lighter band
- **THEN** each resolves away from its own band, without either call site saying so

#### Scenario: Chrome and selection are not the same colour
- **WHEN** lifted chrome and a selected container are rendered side by side
- **THEN** their computed background colours differ visibly, even after resolving token aliases
- **AND** selection retains its border and explicit label or mark

#### Scenario: Broadcast content stops alternating after one step
- **WHEN** three content containers are nested beneath a broadcast base
- **THEN** the first takes the alternate content level and the second and third retain that level
- **AND** each boundary carries a border while chrome and selection retain their own treatments

#### Scenario: The broadcast cap does not affect other surfaces
- **WHEN** the same nested composition is rendered on operator or public surfaces
- **THEN** its content continues alternating against the enclosing content level

#### Scenario: Text stays legible at every level
- **WHEN** the generated surface levels are checked
- **THEN** the text and border tokens rendered on each level meet the AA gates the token package
  enforces

#### Scenario: A boundary is drawn, not merely tinted
- **WHEN** two levels sit directly against each other
- **THEN** a border cue marks the boundary, so the two are separable without relying on the fill
  difference alone

#### Scenario: What counts as chrome

- **WHEN** a panel header, footer, chip, tag, eyebrow or icon well renders
- **THEN** it lifts to the chrome level

#### Scenario: Why not `surface-raised`

- **WHEN** a level is assigned
- **THEN** it does not reuse `surface-raised`, which means a selected or active container, so a
  reader can tell chrome from selection

#### Scenario: Different names are not enough

- **WHEN** two levels use distinct token names
- **THEN** they must also resolve to visibly different colours

#### Scenario: How levels are reviewed

- **WHEN** levels are reviewed
- **THEN** the review uses the differentiation examples in `../copalibre-app` and actual selected
  components on dark and light bands

#### Scenario: The broadcast exception

- **WHEN** content containers nest on the broadcast base
- **THEN** the first takes the alternate content level and deeper ones keep it; chrome keeps its
  role, selected containers their state background, and operator and public content alternate
  normally

### Requirement: Radio and file-selection component token contracts
`packages/design-tokens` SHALL define component token contracts for the radio control and the
file-selection control — resolved background, text, border, and focus-ring values per interaction state
(default, focus, error, disabled), and for file selection additionally its drag-active and
selection-present states — following the pattern the existing form-control contracts establish, so
neither atom picks a colour, spacing, or shadow value outside the contract.

#### Scenario: A file-selection control in its drag-active state resolves to contract tokens
- **WHEN** the file-selection component token contract's drag-active state is inspected
- **THEN** its background and border values resolve to documented semantic tokens, not independently
  chosen values

#### Scenario: A rejected file resolves to the same destructive colour as every other error
- **WHEN** the file-selection contract's error state is inspected
- **THEN** its border and focus-ring values resolve to the same destructive semantic token used by the
  other form-control error states

### Requirement: Design documentation is verified against the token source

Committed documentation restating token values SHALL be verified automatically against the token
source for the colour, typography, radius and spacing sets, in the token package's existing suite,
and SHALL fail on any divergence in either direction. A count of commits since the document was last
edited SHALL NOT be treated as evidence either way; only a value comparison decides.

#### Scenario: A token value changes and the documentation is not regenerated

- **WHEN** a colour, typography, radius or spacing value changes in the token source and the committed design documentation still carries the previous value
- **THEN** the token package's test suite fails, naming the token and both values

#### Scenario: A token is added to the source only

- **WHEN** a new token is added to the source and the committed design documentation does not carry it
- **THEN** the verification fails, naming the missing token

#### Scenario: A token is removed from the source but left in the documentation

- **WHEN** a token is removed from the source and the committed design documentation still lists it
- **THEN** the verification fails, naming the token that no longer exists

#### Scenario: Regenerated documentation passes

- **WHEN** the design documentation is regenerated from the current token source with no manual edit to its token values
- **THEN** the verification passes with no exception recorded

#### Scenario: What a divergence is

- **WHEN** the documentation is compared
- **THEN** a value that differs, a token only in the source, or a token only in the documentation
  each fail

#### Scenario: Why documentation drifts

- **WHEN** a value is corrected in the source
- **THEN** the generated CSS and Tailwind output follow it while a hand-maintained document keeps
  the old one, so a restated fact needs automated evidence

#### Scenario: Divergence fails the pull request

- **WHEN** documentation diverges
- **THEN** the pull request fails rather than the next reader finding out

### Requirement: Design documentation names its normative source

Committed design documentation that overlaps a specification SHALL name that specification as
normative for the overlapping subject, and SHALL name the token source it was derived from.

The documentation exists to be read by contributors and by code-generating agents, which makes an
unmarked overlap actively harmful: two documents describing the same palette, motif or breakpoint set
with equal apparent authority leave a reader no way to tell which one binds when they disagree.

#### Scenario: A reader resolves a disagreement

- **WHEN** committed design documentation and a specification describe the same visual subject and disagree
- **THEN** the documentation itself identifies the specification as normative, so the specification decides

### Requirement: Mechanical design checks run during editing

The project SHALL run its mechanical design checks while interface code is edited, not only at
review, with their configuration in a tracked file. A suppression SHALL carry a written reason, and
one identified only by rule id SHALL NOT be accepted. A suppression for one developer's machine
SHALL be recorded apart from the tracked project configuration.

#### Scenario: A suppression arrives without a reason

- **WHEN** a design-check suppression is added to the tracked project configuration with no written reason
- **THEN** it is rejected in review as an incomplete entry

#### Scenario: A suppression is reviewable in the change that introduces it

- **WHEN** a pull request adds or widens a design-check suppression
- **THEN** the suppression and its reason appear in that pull request's diff

#### Scenario: Why a reason is required

- **WHEN** a suppression has no recorded reason
- **THEN** it cannot be reviewed or re-evaluated when the excused code changes, and silently becomes
  permanent

### Requirement: Verified documentation changes with its source

Verified design token documentation SHALL be refreshed in the same pull request as token-source
changes so every proposed merge can pass the drift check. Full descriptive documentation and sidecar
regeneration SHALL follow integration; resulting documentation edits SHALL be carried on the next
change branch, without a direct push to the protected integration branch.

#### Scenario: A token-changing PR passes verification

- **WHEN** a change modifies a verified token
- **THEN** that PR includes matching verified documentation and passes the drift check before merge

#### Scenario: Sidecar refresh follows integration

- **WHEN** a token or component change merges
- **THEN** a full descriptive refresh uses integrated source, and its resulting edits are reviewed on the next change branch

#### Scenario: Concurrent changes update documentation

- **WHEN** concurrent changes modify the same verified token
- **THEN** conflicts are resolved against the integrated source and verification runs again before merge

### Requirement: Tournament Creation Wizard Step Precision
The multi-step tournament authoring wizard MUST use the design system's badge shape for active and completed step badges, meet the minimum interactive target for its primary progression action, explain blocked progression when required fields are invalid, and configure the Astro development server to forward `/disciplines` and `/tournament-profiles` to the API service.

#### Scenario: Step badge shape
- Given an operator is authoring a tournament in `/control/[organization]/tournaments/new`
- When the wizard renders step indicators
- Then active and completed step badges use the established badge shape with square right corners and a vertical chamfer on the left.

#### Scenario: Blocked wizard progression
- Given required tournament fields are invalid or incomplete
- When the operator reaches the primary progression action
- Then the action meets the 44px minimum target and its disabled state explains what must be completed.

#### Scenario: Development API proxy
- Given the web application is running with Astro's development server
- When the wizard requests disciplines or tournament profiles
- Then the development server forwards those paths to the API service.

### Requirement: Profile Image Crop Modal Framing
The image crop dialog MUST encapsulate the active cropping viewport in the owned `.cl-image-frame` primitive, avoiding raw inline layout styles, using its 4:5 opaque chrome frame, and maintaining the suspended modal drop-shadow on the dialog.

#### Scenario: Image crop container styling
- Given an operator initiates an emblem or avatar upload
- When `ImageCropModal` opens
- Then the crop viewport uses the `.cl-image-frame` treatment with a 4:5 aspect ratio and opaque chrome fill, while the enclosing dialog retains its suspended drop-shadow.

### Requirement: Public Tournament Numeric Tabular Alignment
All public server-rendered tournament standings and match result tables MUST enforce tabular numerals to prevent layout shifting across variable screen widths. Nested match-summary cards MUST alternate opaque `panel` and `base` surface bands so adjacent content remains visually distinct.

#### Scenario: Numeric column tabular layout
- Given a visitor views a public tournament overview page
- When viewing standings points, goals, or score summaries
- Then every numeric cell renders with `font-variant-numeric: tabular-nums`.

#### Scenario: Alternating match-summary bands
- Given a visitor views nested match-summary cards on a public tournament page
- When adjacent cards render over the page surface
- Then their opaque backgrounds alternate between `panel` and `base` bands.

### Requirement: TV Broadcast Scorebug Indicator Contrast
The TV broadcast scorebug MUST place visible possession and timed-penalty markers in opaque `ink-950` backing wells, with textual meaning and foreground contrast of at least 4.5:1. TV bracket matchup cards MUST use the established control chamfer treatment with a square fallback.

#### Scenario: Visible indicator over arbitrary broadcast background
- **WHEN** an active penalty or recorded possession marker is displayed over a kiosk, video overlay, or chroma background
- **THEN** its foreground meets 4.5:1 contrast against the opaque well and its meaning remains available without color

#### Scenario: TV bracket matchup card
- **WHEN** an elimination matchup is shown in the full-frame TV bracket section
- **THEN** the card has the control chamfer treatment, including its square fallback where corner shaping is unsupported
