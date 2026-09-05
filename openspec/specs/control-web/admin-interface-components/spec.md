# control-web/admin-interface-components Specification

## Purpose
Gives every Control-web screen — any view showing data, a form, or entity information, not only
"admin" screens — one owned, reusable Atomic Design system spanning atoms, molecules, organisms, and
templates, built on `packages/design-tokens`, so a screen's visual and layout decisions live in the
reused piece rather than being re-decided at each screen that instantiates one, and a developer or AI
agent building a new screen starts from existing parts instead of a blank inline-style object.

## Requirements

### Requirement: Owned atom layer for form controls and entity display
The component library SHALL provide an owned atom for each of: single-line text input, select,
textarea, checkbox/switch, label, badge, button, and card (with compound subparts: header, title,
description, content, footer) — each consuming `packages/design-tokens` values (color, spacing, radius,
typography) rather than a hardcoded value, following the shadcn/ui-style, Radix-Primitives-backed
pattern the existing `badge`/`button`/`card` atoms already establish.

#### Scenario: An atom renders using token values, not hardcoded styles
- **WHEN** the text-input atom is inspected
- **THEN** its color, spacing, and radius values resolve to `packages/design-tokens` tokens, with no
  hardcoded hex color, pixel spacing, or font value in the component source

#### Scenario: Every interactive atom meets the documented touch-target minimum
- **WHEN** any interactive atom (input, select, textarea, checkbox, button) is rendered
- **THEN** its minimum height/width meets the token package's documented touch-target size

### Requirement: Labeled form-field molecule with consistent error state
The component library SHALL provide a form-field molecule composing the label atom, one control atom,
optional help text, and an error state, so every Control-web form renders validation errors the same
way rather than each screen inventing its own error presentation.

#### Scenario: A field in an error state renders label, control, and message consistently
- **WHEN** a form-field molecule is given an error message
- **THEN** it renders the associated label, the control atom in its error visual state, and the error
  message, using the same layout and token values regardless of which screen renders it

#### Scenario: A field with no error renders no error affordance
- **WHEN** a form-field molecule has no error
- **THEN** no error styling or error text is rendered, and the control's accessible description does not
  reference a nonexistent error

### Requirement: Data-entity-card molecule
The component library SHALL provide a `DataEntityCard` molecule (composing the card atom, badge atom,
and a metadata/actions layout) for displaying one entity's summary — an organization, an installed
module, a participant, or a similar record — consistently across screens.

#### Scenario: Two different entity kinds render with the same structural layout
- **WHEN** a `DataEntityCard` displays an organization and, elsewhere, a `DataEntityCard` displays an
  installed module
- **THEN** both share the same title/metadata/actions layout and spacing, differing only in the content
  supplied, not the structure

### Requirement: Responsive DataTable organism for every tabular view
The component library SHALL provide one `DataTable` organism that every Control-web screen presenting
tabular data — administrative listings and tournament/standings-style data views alike — uses instead
of a hand-rolled table layout; below the 768 px breakpoint it SHALL present a horizontal-scroll
affordance rather than causing the page itself to overflow horizontally. `DataTable` SHALL accept
columns and rows as props and SHALL NOT itself perform data fetching.

#### Scenario: A wide table stays scrollable at 375 px width
- **WHEN** a `DataTable` with more columns than fit a 375 px viewport is rendered at that width
- **THEN** the table itself scrolls horizontally within a visible affordance, and the surrounding page
  does not overflow horizontally

#### Scenario: A narrow table is usable without horizontal scroll
- **WHEN** a `DataTable` with few columns is rendered at 375 px width
- **THEN** every column remains visible without requiring horizontal scroll

#### Scenario: The same organism serves an admin listing and a tournament data view
- **WHEN** an admin role-assignment listing and a tournament standings view each render a `DataTable`
- **THEN** both compose the same organism component, differing only in the columns/rows supplied

### Requirement: Modal/Dialog organism
The component library SHALL provide a `Modal`/`Dialog` organism (built on Radix Dialog) providing a focus-trapped, Escape-dismissible, backdrop-dismissible overlay consuming the component library's tokens, so no screen hand-builds its own `role="dialog"` markup. Any route that presents a dialog, drawer, or overlay SHALL use this organism with a visible, non-hidden `role="dialog"` declaration; `role="dialog"` SHALL NOT be set `aria-hidden` or hidden behind a CSS class that removes structural visibility from the accessibility tree while the dialog is open. Tab order SHALL cycle within the dialog while open and restore focus to the trigger control on close.

#### Scenario: Opening a modal traps keyboard focus inside it
- **WHEN** a `Modal` is opened
- **THEN** Tab/Shift+Tab cycles focus only among the modal's own focusable elements until it closes

#### Scenario: Escape and backdrop click both close the modal
- **WHEN** an open `Modal` receives an Escape key press, or its backdrop is clicked
- **THEN** the modal closes and focus returns to the element that opened it

#### Scenario: A hand-built dialog is replaced by the Modal organism
- **WHEN** a screen needs a confirmation, invite, or detail overlay
- **THEN** it composes the `Modal` organism rather than defining its own `role="dialog"` markup and styles

#### Scenario: Match console opens a confirmation dialog
- **WHEN** `MatchConsoleRoute.tsx` opens its confirmation dialog
- **THEN** the dialog is announced in the accessibility tree, focus is trapped, Escape closes it, background scroll is locked, and focus returns to the action button that opened it

#### Scenario: An open dialog stays in the accessibility tree
- **WHEN** a `Modal` is open and the accessibility tree is inspected
- **THEN** the `role="dialog"` element is present and not hidden behind `aria-hidden` or a visibility-removing CSS class

### Requirement: Toast is the standing mechanism for operation-result feedback
The already-existing `ToastProvider`/`useToast()` mechanism SHALL be the component library's
organism-tier standing mechanism for reporting the result of an action (success, error, info) across an
entire screen; a screen SHALL NOT define its own inline alert/banner element duplicating that role. A
field-level validation error — tied to one specific input the user is actively correcting — SHALL use
the form-field molecule's error state instead of a toast; a toast SHALL be used for the result of a
submitted or completed operation. Both mechanisms MAY be relevant on the same screen, applied to their
distinct cases, but neither SHALL duplicate the other for the same event.

#### Scenario: A submitted action's result is reported via toast, not an inline banner
- **WHEN** a screen completes an API-backed action (e.g. inviting a user, saving a setting)
- **THEN** its success or failure is reported via `useToast()`, and the screen does not also render its
  own inline `role="alert"` element for that same result

#### Scenario: A field-specific validation error uses the form-field molecule, not a toast
- **WHEN** a single form field fails client-side or server-side validation tied to that field
- **THEN** the error is shown via the form-field molecule's error state, not a toast, so the user sees
  it next to the field they need to correct

### Requirement: Templates compose organisms into a screen's layout
The component library SHALL provide a templates tier: content-agnostic layout components that place
organisms and molecules into a screen's structure (section order, inter-section spacing) without
containing business logic or fetching data. This change ships `ListScreenTemplate` (header, toolbar,
tabular/card listing area, pagination slot) and `FormScreenTemplate` (header, grouped form-field
sections, sticky footer action bar); further templates are added as new screen shapes require them.

#### Scenario: Two listing screens share layout via the same template
- **WHEN** a role-assignment listing screen and an installed-module listing screen are both built on
  `ListScreenTemplate`
- **THEN** both share the same header/toolbar/listing/pagination arrangement and inter-section spacing,
  differing only in the organism content each supplies

#### Scenario: A template receives no data of its own
- **WHEN** `ListScreenTemplate` or `FormScreenTemplate` is inspected
- **THEN** it performs no data fetching and reads no application state directly; every value it renders
  arrives as a prop from the page/route component that uses it

### Requirement: No data-fetching or application-state access below the organism tier
Atoms, molecules, and templates SHALL NOT call the API client, subscribe to an SSE stream, or read
application/session state directly; they SHALL receive all data and callbacks via props. Only a
page/route component, or an organism's own strictly local UI state (e.g. a `Modal`'s open/closed state,
a `DataTable`'s client-side sort), MAY hold state or perform data access.

#### Scenario: A molecule receives its data via props, not a fetch of its own
- **WHEN** the `DataEntityCard` molecule is inspected
- **THEN** it contains no call to the control application's API client and no direct read of session/
  application state — all displayed data arrives as props

#### Scenario: A template contains no business logic
- **WHEN** `FormScreenTemplate` is inspected
- **THEN** it contains no validation logic, no API call, and no state beyond what is needed to lay out
  the sections it is given

### Requirement: A component never sets its own external margin
No atom, molecule, organism, or template SHALL apply its own external margin or absolute positioning to
place itself relative to a sibling section; the spacing between sibling sections on a screen SHALL be
applied by the template (or, for a screen with no matching template, by the page/route component's own
layout container) — never hardcoded inside the reused component itself.

#### Scenario: A component reused in two different spacing contexts renders identically
- **WHEN** the same molecule is placed inside `ListScreenTemplate` and, separately, inside
  `FormScreenTemplate`
- **THEN** the molecule's own rendered output contains no external margin value, and the spacing around
  it differs only because each template applies its own inter-section spacing

### Requirement: Distinct Control-web data-density visual mode, same token source
The component library's atoms, molecules, organisms, and templates SHALL render in a denser, less
ornamented composition than the public marketing surfaces — smaller spacing-scale steps, minimal
decorative motion, function-first layout — while resolving every color, typography, and motion value
from the exact same `packages/design-tokens` source the marketing surfaces use. No component SHALL
define or consume a color, font, or motion value absent from that shared token source.

#### Scenario: Control-web and marketing surfaces share the same color tokens
- **WHEN** a color value used by a Control-web atom is compared against `packages/design-tokens`'
  generated output
- **THEN** the value matches a token already defined for the shared marketing surfaces, with no
  Control-web-only color fork

#### Scenario: Control-web composition is measurably denser than marketing composition
- **WHEN** a template's default vertical spacing between stacked sections is compared against the
  marketing surfaces' default spacing between equivalent stacked content blocks
- **THEN** the Control-web spacing step is smaller, per the documented data-density composition rule

### Requirement: New screens start from a template and compose from the owned library
A Control-web screen added after this capability exists SHALL start from an existing template when its
shape matches (list, form, detail) and SHALL compose its form controls, tabular data, cards, modals, and
operation feedback from the component library's atoms, molecules, and organisms; it SHALL NOT define a
new one-off inline style object (e.g. a `React.CSSProperties` literal) duplicating a pattern the library
already provides.

#### Scenario: A new form screen uses FormScreenTemplate and the form-field molecule
- **WHEN** a new screen renders a labeled multi-field form with validation
- **THEN** it composes `FormScreenTemplate` and the form-field molecule, rather than defining its own
  section layout, spacing, label/input/error markup, and styles

#### Scenario: A new listing screen uses ListScreenTemplate and the DataTable organism
- **WHEN** a new screen renders a tabular list of records
- **THEN** it composes `ListScreenTemplate` and the `DataTable` organism, rather than a hand-rolled
  layout and CSS grid table

### Requirement: Template migration for remaining Control-web screens
Every Control-web screen that shipped in 0141-admin-atomic-design-system SHALL use `ListScreenTemplate` or `FormScreenTemplate` when their shape matches. The 11 remaining screens identified in 0141-admin-atomic-design-system SHALL be migrated onto the atomic tier system and SHALL NOT hand-roll layouts, tables, cards, or alerts after this change is complete. `MatchConsoleRoute.tsx` SHALL introduce its own template and SHALL consume it rather than constructing category rows or extended-match headers directly. Migrated screens SHALL assert their template-derived DOM shape in their updated `*.test.tsx` suites.

#### Scenario: Group A list screen loads data
- **WHEN** `PromotionPlanRoute` loads data
- **THEN** the rendered DOM uses `ListScreenTemplate` order/spacing, no inline `React.CSSProperties` grid, and the `DataTable` organism provides the listing

#### Scenario: Match console opens a new extended match header
- **WHEN** `MatchConsoleRoute.tsx` renders a new match header
- **THEN** the template composes the header organism with template-defined spacing; the route only passes match and event payload

#### Scenario: Migration test asserts template contract
- **WHEN** a migrated screen's test runs
- **THEN** the test asserts the template host element and its configured organisms, not inline grid styles

### Requirement: New atomic design templates
The owned component layer SHALL provide templates beyond `ListScreenTemplate` and `FormScreenTemplate` when a recurring route shape exists. Any new template introduced for an owner-configured screen SHALL define only layout and spacing; content and handlers remain provided by the page/route.

#### Scenario: A match-console template composes the console layout
- **WHEN** `MatchConsoleTemplate` is inspected
- **THEN** it defines only the console's section order, extended-match header placement, and inter-section spacing, receiving match and event payload via props from `MatchConsoleRoute`

#### Scenario: Template reorders only
- **WHEN** a page/route reorders or renames the sections it passes to a template
- **THEN** the template renders them in the given order without mutating the content it receives

#### Scenario: Style-guide route exposes the new template
- **WHEN** the style-guide route lists template examples
- **THEN** every template in the owned layer surfaces a rendered example

### Requirement: The Modal organism's close control has an accessible name
The `Modal`/`Dialog` organism's close control SHALL carry an accessible name (e.g. `aria-label`) usable
by assistive technology, in addition to its visible glyph, so an icon-only control is never announced
without a name.

#### Scenario: The close control has an accessible name
- **WHEN** an open `Modal`'s close control is inspected in the accessibility tree
- **THEN** it exposes a non-empty accessible name describing its action (e.g. "Close")

### Requirement: Dark theme form control integration
All form inputs within administrative screens SHALL utilize design token classes and adhere to the dark surface palette.

#### Scenario: Rendering inputs in admin forms
- **WHEN** an operator views form controls (checkboxes, date inputs, file upload buttons, number spinners) across Clubs, Venues, and Officials
- **THEN** the elements SHALL render using design tokens without native browser white backgrounds

### Requirement: Button atom implements the accepted CTA treatments
The owned Button atom SHALL provide primary (cyan fill, dark text), secondary (raised neutral fill
with a muted border), and destructive (red fill or outlined red, with a destructive verb label) visual
treatments resolved from `surface`/`state-live`, `surface-raised`/`border-muted`, and
`state-destructive` tokens respectively, each rendering distinct default, hover, active, focus-visible,
and disabled states, and each carrying the chamfered control geometry. No Control-web screen SHALL
render an ad hoc button style outside this atom.

#### Scenario: Primary and secondary buttons are visually distinct
- **WHEN** a primary and a secondary Button are rendered side by side
- **THEN** the primary renders the `state-live` fill with dark text and the secondary renders the
  raised neutral fill with a muted border, matching the supplied reference's pairing, and each meets
  the documented contrast contract

#### Scenario: Every button carries the chamfered control geometry
- **WHEN** any Button variant is rendered
- **THEN** it carries the chamfered control geometry, not square or rounded corners

#### Scenario: Hover, active, and disabled are visually distinct from default
- **WHEN** a Button is hovered, activated, or disabled
- **THEN** each of those states renders differently from the button's default state

#### Scenario: A destructive button never uses a non-destructive treatment
- **WHEN** a Button is rendered with `variant="destructive"`
- **THEN** it renders the `state-destructive` token and a destructive verb label, never the primary or
  secondary fill

#### Scenario: A loading button communicates state without an ambiguous spinner
- **WHEN** a Button is rendered in its loading state
- **THEN** it does not imply indeterminate progress with no textual cue: it renders a textual
  "Loading" label rather than a bare spinner
