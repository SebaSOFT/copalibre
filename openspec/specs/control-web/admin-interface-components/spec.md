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
textarea, checkbox/switch, radio group, file selection, label, badge, button, and card (with compound
subparts: header, title, description, content, footer) — each consuming `packages/design-tokens` values
(color, spacing, radius, typography) rather than a hardcoded value, following the shadcn/ui-style,
Radix-Primitives-backed pattern the existing `badge`/`button`/`card` atoms already establish.

#### Scenario: An atom renders using token values, not hardcoded styles
- **WHEN** the text-input atom is inspected
- **THEN** its color, spacing, and radius values resolve to `packages/design-tokens` tokens, with no
  hardcoded hex color, pixel spacing, or font value in the component source

#### Scenario: Every interactive atom meets the documented touch-target minimum
- **WHEN** any interactive atom (input, select, textarea, checkbox, radio, file selection, button) is
  rendered
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

The component library SHALL provide a `Modal`/`Dialog` organism built on Radix Dialog:
focus-trapped, dismissible by Escape and backdrop, consuming the library's tokens. Any route
presenting a dialog, drawer or overlay SHALL use it, with a `role="dialog"` that SHALL NOT be
`aria-hidden` or hidden from the accessibility tree while open. Tab order SHALL cycle within the
dialog while open and restore focus to the trigger on close.

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

#### Scenario: No hand-built dialogs

- **WHEN** a screen needs a dialog
- **THEN** it uses the organism rather than its own `role="dialog"` markup

### Requirement: Toast is the standing mechanism for operation-result feedback

The existing `ToastProvider`/`useToast()` SHALL be the library's standing mechanism for reporting
the result of an action across a screen, and a screen SHALL NOT define its own inline alert or
banner for that role. A field-level validation error SHALL use the form-field molecule's error state
instead. Neither SHALL duplicate the other for the same event.

#### Scenario: A submitted action's result is reported via toast, not an inline banner
- **WHEN** a screen completes an API-backed action (e.g. inviting a user, saving a setting)
- **THEN** its success or failure is reported via `useToast()`, and the screen does not also render its
  own inline `role="alert"` element for that same result

#### Scenario: A field-specific validation error uses the form-field molecule, not a toast
- **WHEN** a single form field fails client-side or server-side validation tied to that field
- **THEN** the error is shown via the form-field molecule's error state, not a toast, so the user sees
  it next to the field they need to correct

#### Scenario: Which is which

- **WHEN** a screen reports something
- **THEN** the result of a submitted or completed operation (success, error, info) is a toast, and
  an error tied to one input the user is correcting is the field's error state; both may appear on
  one screen for their distinct cases

### Requirement: Templates compose organisms into a screen's layout

The component library SHALL provide two distinct tiers, layouts and templates. A layout SHALL place
its slots into a screen's structure without business logic, interface text or data fetching. A
template SHALL compose organisms and molecules into one complete screen, hold that screen's rules
and interaction state, and format its text, and SHALL NOT fetch data or read application state. A
template SHALL be named for its screen with the template suffix.

#### Scenario: Two listing screens share layout via the same template
- **WHEN** a role-assignment listing screen and an installed-module listing screen are both built on
  `ListScreenLayout`, the renamed layout tier this requirement now names separately
- **THEN** both share the same header/toolbar/listing/pagination arrangement and inter-section spacing,
  differing only in the organism content each supplies

#### Scenario: A template receives no data of its own
- **WHEN** `ListScreenLayout` or `FormScreenLayout` is inspected
- **THEN** it performs no data fetching, formats no interface message, and reads no application state
  directly; every value it renders arrives as a slot from the template that uses it

#### Scenario: A template holds its screen's rules and none of its data access
- **WHEN** a screen template is inspected
- **THEN** it composes organisms, holds the screen's interaction state and validation, formats its
  interface text, and contains no call to the API client and no realtime subscription

#### Scenario: Why two tiers

- **WHEN** the former "templates" tier is reviewed
- **THEN** it contained no organisms and held no screen logic, only slot arrangement, which is what
  a layout is

#### Scenario: The layouts

- **WHEN** a screen shape is needed
- **THEN** `ListScreenLayout` (header, toolbar, listing area, pagination slot), `FormScreenLayout`
  (header, grouped field sections, sticky footer action bar), `AuthScreenLayout` and
  `MatchConsoleLayout` exist, and more are added as new shapes require

#### Scenario: Where a template gets its data

- **WHEN** a template renders
- **THEN** it receives data and application state from its page

### Requirement: No data-fetching or application-state access below the organism tier

Atoms, molecules, organisms, layouts, and templates SHALL NOT call the API client, subscribe to a
realtime stream, issue a network request, or read application or session state; they SHALL receive
data and callbacks via props, and only a page MAY hold data state or access data. A type-only import
of an API response shape SHALL NOT be a violation. The automated composition check SHALL enforce
this rule.

#### Scenario: A molecule receives its data via props, not a fetch of its own
- **WHEN** the `DataEntityCard` molecule is inspected
- **THEN** it contains no call to the control application's API client and no direct read of session/
  application state — all displayed data arrives as props

#### Scenario: A template typed by an API response passes the check
- **WHEN** a screen template imports an API response type with a type-only import and renders values
  passed to it as props
- **THEN** the composition check reports no violation

#### Scenario: A template contains no business logic
- **WHEN** `FormScreenLayout` — the layout tier to which this change moves the content-agnostic half of
  the former templates tier — is inspected
- **THEN** it contains no validation logic, no API call, and no state beyond what is needed to lay out
  the sections it is given

#### Scenario: A route that both fetches and composes is reported
- **WHEN** one component both calls the API client and composes the screen's organisms
- **THEN** the composition check fails, requiring the screen to be split into a page that fetches and
  a template that composes

#### Scenario: Local UI state is allowed

- **WHEN** a modal tracks open or closed, a table its client-side sort, or a wizard its step
- **THEN** that local state is not application state and stays at the tier owning the interaction

#### Scenario: Why a type import is fine

- **WHEN** a template names the response shape it is given
- **THEN** that is the contract working, not a bypass

### Requirement: A component never sets its own external margin

No atom, molecule, organism, layout, or template SHALL apply its own external margin or absolute
positioning to place itself relative to a sibling. Spacing between siblings SHALL come from the
layout or a layout primitive the template composes. The library SHALL provide layout primitives
taking spacing and alignment as token-scale steps, and no component outside their directory SHALL
declare an inline layout style.

#### Scenario: A component reused in two different spacing contexts renders identically
- **WHEN** the same molecule is placed inside `ListScreenLayout` and, separately, inside
  `FormScreenLayout`
- **THEN** the molecule's own rendered output contains no external margin value, and the spacing around
  it differs only because each layout applies its own inter-section spacing

#### Scenario: An inline layout style is reported
- **WHEN** a screen declares an inline style setting a display mode and a gap in place of composing a
  layout primitive
- **THEN** the composition check fails and names the primitive that replaces it

#### Scenario: The primitives

- **WHEN** a template arranges siblings
- **THEN** it composes a vertical stack, a horizontal row, a grid or a padded box

#### Scenario: Why inline layout is a bypass

- **WHEN** a component writes an inline arrangement
- **THEN** a primitive was available, so the inline style bypasses it rather than being the only
  option

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

A new Control-web screen SHALL start from an existing layout when its shape matches, split into a
page supplying data and a template composing it, and compose from the owned library without one-off
inline styles. No component outside the library SHALL hand-write a design-system class an owned
component applies, detected on any element. Governed elements SHALL cover all the library replaces:
raw use SHALL be a violation, and an element without a replacement SHALL NOT be governed.

#### Scenario: A new form screen uses FormScreenTemplate and the form-field molecule
- **WHEN** a new screen renders a labeled multi-field form with validation
- **THEN** it composes `FormScreenLayout` and the `Field` owner, rather than defining its own
  section layout, spacing, label/input/error markup, and styles

#### Scenario: A new listing screen uses ListScreenTemplate and the DataTable organism
- **WHEN** a new screen renders a tabular list of records
- **THEN** it composes `ListScreenLayout` and the `DataTable` organism, rather than a hand-rolled
  layout and CSS grid table

#### Scenario: The design system's own class names are owned too
- **WHEN** a component outside the owned library writes a class an owned component already applies —
  a `<div>` carrying the card class, a `<span>` carrying the badge class, an element carrying the
  button or data-table class
- **THEN** the ownership check reports it, because composing an owned component's markup by hand
  bypasses that component exactly as a raw element does

#### Scenario: Every element with an owned replacement is governed
- **WHEN** the library provides a component that replaces a raw element — including a select control,
  and including the form, label and grouping elements once their owners ship
- **THEN** a raw use of that element is reported, and existing uses are recorded per file in the
  backlog rather than silently permitted

#### Scenario: A backlogged file cannot grow new violations silently
- **WHEN** a file recorded in the known backlog gains another hand-written owned class
- **THEN** the check reports the addition, and the check continues to fail outright for any file not on
  that list

#### Scenario: A backlogged file that improves does not leave room to regress
- **WHEN** a file recorded in the known backlog has fewer hand-written owned classes than its recorded
  count
- **THEN** the check reports that the recorded count must be lowered, so the reclaimed room cannot be
  refilled silently

#### Scenario: A new screen composes rather than reimplements
- **WHEN** a new listing screen is added
- **THEN** it composes an existing layout, its page performs the data access, its template composes the
  organisms, and it introduces no inline style object duplicating a library pattern

#### Scenario: What a screen composes

- **WHEN** a new screen renders form controls, tabular data, cards, modals or operation feedback
- **THEN** each comes from the owned library

#### Scenario: The backlog

- **WHEN** files already contain hand-written owned classes when the rule is introduced
- **THEN** they may be listed in an explicit, dated backlog naming files, not patterns, whose counts
  may only decrease, and anything new still fails

#### Scenario: Form structure is governed

- **WHEN** the library owns the form element, its labels and grouping elements
- **THEN** raw uses of them are violations

#### Scenario: A gap closes by adding the owner

- **WHEN** an element has an owned replacement but is ungoverned
- **THEN** the gap is closed by adding the owner, not by exempting the surface

### Requirement: Template migration for remaining Control-web screens

Every Control-web screen of the admin atomic design system SHALL use `ListScreenTemplate` or
`FormScreenTemplate` when its shape matches, the 11 identified remaining screens SHALL be migrated
and SHALL NOT hand-roll layouts, tables, cards, or alerts, and `MatchConsoleRoute.tsx` SHALL consume
its own template. Migrated screens SHALL assert their template-derived DOM shape in their
`*.test.tsx` suites.

#### Scenario: Group A list screen loads data
- **WHEN** `PromotionPlanRoute` loads data
- **THEN** the rendered DOM uses `ListScreenTemplate` order/spacing, no inline `React.CSSProperties` grid, and the `DataTable` organism provides the listing

#### Scenario: Match console opens a new extended match header
- **WHEN** `MatchConsoleRoute.tsx` renders a new match header
- **THEN** the template composes the header organism with template-defined spacing; the route only passes match and event payload

#### Scenario: Migration test asserts template contract
- **WHEN** a migrated screen's test runs
- **THEN** the test asserts the template host element and its configured organisms, not inline grid styles

#### Scenario: The console builds nothing itself

- **WHEN** the match console renders
- **THEN** its template, not the route, constructs category rows and extended-match headers

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

The owned Button atom SHALL provide primary, secondary and destructive treatments resolved from
tokens, each with distinct default, hover, active, focus-visible and disabled states. Every variant
SHALL use the display typeface in bold uppercase with wide tracking and the asymmetric beveled
control chamfer. Primary buttons SHALL glow cyan (`--cl-glow-cyan`) on hover and active. No
Control-web screen SHALL render an ad hoc button style.

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

#### Scenario: Primary button renders uppercase condensed type, asymmetric chamfer, and ambient glow
- **WHEN** a primary Button is rendered
- **THEN** it renders in `Barlow Condensed` bold uppercase, features beveled Top-Right and Bottom-Left corners via `corner-shape: bevel`, and emits an ambient cyan glow on hover

#### Scenario: Secondary and destructive buttons share the asymmetric chamfer geometry
- **WHEN** a secondary or destructive Button is rendered
- **THEN** it renders in `Barlow Condensed` uppercase with the same Top-Right and Bottom-Left beveled corners as the primary button

#### Scenario: The treatments

- **WHEN** a button renders
- **THEN** primary is a cyan fill with dark ink text from `surface`/`state-live`; secondary a raised
  neutral fill with a muted border and light text from `surface-raised`/`border-muted`; destructive
  a red fill or red outline with a destructive verb label from `state-destructive`

#### Scenario: The type and geometry

- **WHEN** a button renders
- **THEN** it uses `Barlow Condensed` at 700, uppercase, `var(--cl-tracking-wider)`, and
  `corner-shape: bevel; border-radius: 0 var(--cl-radius-chamfer-control) 0
  var(--cl-radius-chamfer-control)`, cutting top-right and bottom-left

### Requirement: DropdownMenu organism for a grouped set of actions

The component library SHALL provide a token-styled `DropdownMenu` organism for related actions
behind one trigger, so no screen hand-builds menu markup or a row of buttons for a grouped set. It
SHALL expose its trigger and items as a menu, SHALL open and close by keyboard and pointer, SHALL
move focus with the arrow keys, SHALL close on Escape, and SHALL return focus to its trigger on
close.

#### Scenario: A screen groups related actions instead of listing them
- **WHEN** a screen presents several related actions on one entity — its export formats, for example
- **THEN** it composes the `DropdownMenu` organism rather than rendering one control per action or
  defining its own menu markup

#### Scenario: The menu is operable by keyboard alone
- **WHEN** an operator focuses a `DropdownMenu` trigger and presses Enter or Space
- **THEN** the menu opens, the arrow keys move focus among its items, Enter activates the focused item,
  and Escape closes the menu and returns focus to the trigger

#### Scenario: Choosing an item runs that action and closes the menu
- **WHEN** an operator activates one of a `DropdownMenu`'s items
- **THEN** that item's action runs and the menu closes, leaving focus on the trigger

#### Scenario: The menu is announced as a menu
- **WHEN** an open `DropdownMenu` is inspected in the accessibility tree
- **THEN** its trigger and its items carry menu semantics, and the trigger reports whether the menu is
  open

### Requirement: Every component is reviewable in isolation

The repository SHALL provide a component workbench rendering any React component of the operator,
public and broadcast surfaces on its own, without the application or seeded data, grouped by
surface, with every owned component present in the states a reviewer must judge. An operator screen
SHALL be renderable in its worth-judging states through its existing injection seam. A screen that
cannot render without invented data SHALL be recorded as such, not given a fabricated fixture.

#### Scenario: A reviewer opens a component without running the app
- **WHEN** a reviewer starts the workbench
- **THEN** every owned library component is listed and renders on its own, with no API, database, or
  seeded tournament required

#### Scenario: Components are grouped by the surface they belong to
- **WHEN** a reviewer browses the workbench
- **THEN** the operator, public and broadcast components appear under their own surface groups, and the
  owned library appears under its atomic tiers

#### Scenario: A state that is hard to reach in the app is one click away
- **WHEN** a reviewer wants to see a tabular view with no rows, an overlay while it is open, or a
  screen in its error state
- **THEN** each is a listed entry in the workbench, rather than a state reached by driving the running
  application into it

#### Scenario: An operator screen is reviewable mid-operation
- **WHEN** a reviewer wants a screen in a state that only occurs part-way through an operation — a
  console during a match, an import between preview and commit, a builder holding a conflict
- **THEN** that state is a listed entry, rather than one reached by seeding a tournament and driving
  the application into it

#### Scenario: A screen that cannot render honestly is named rather than faked
- **WHEN** a screen cannot be rendered without data that only a real tournament produces
- **THEN** it is recorded with the reason instead of being given invented data

#### Scenario: Which states

- **WHEN** a component or screen is shown
- **THEN** a component shows its empty, error and disabled states where it has them; a screen shows
  loaded, empty, error, and its mid-operation state where it has one

#### Scenario: Why no fabricated fixtures

- **WHEN** a story would need invented data
- **THEN** a story that looks correct and is not gets reviewed as though it were

### Requirement: A component's prop combinations are shown together, not sampled
Every owned library component SHALL be presented both with its full set of props individually
adjustable and as a rendering of its variant axes side by side, so a difference between two states is
visible in one view rather than by switching between entries. A component with named variants, tones,
accents or validity states SHALL show all of them together.

#### Scenario: A reviewer compares two variants of the same component
- **WHEN** a component declares more than one variant, tone, accent or validity state
- **THEN** the workbench renders all of them in one view, labelled, alongside each other

#### Scenario: A reviewer explores a prop the variant view does not cover
- **WHEN** a reviewer wants a combination the side-by-side view does not enumerate
- **THEN** every prop the component accepts is adjustable in the workbench without editing code

### Requirement: Any component is viewable in any supported interface language
The workbench SHALL offer a selection of every supported interface language and SHALL re-render the
displayed component under that language's message catalogue, using the same catalogues the application
loads rather than a copy maintained for the workbench. Text a component receives as a prop SHALL be
sourced from the message catalogue, so that changing the language changes what is rendered and the
effect of a language's word lengths on the component's layout is visible.

#### Scenario: A reviewer checks a component in a language whose words run long
- **WHEN** a reviewer selects a language whose translations are substantially longer than English
- **THEN** the component re-renders with that language's real strings, and any truncation, wrapping or
  overflow the longer text causes is visible in the workbench

#### Scenario: The workbench and the application cannot disagree about a translation
- **WHEN** a message catalogue is added or changed
- **THEN** the workbench reflects it without a second catalogue being updated, because it reads the
  application's own

#### Scenario: A component holding untranslated text shows it
- **WHEN** a component renders text that never entered a message catalogue
- **THEN** that text stays in its original language under every selection, making the gap visible
  rather than hiding it behind a story's own literal

### Requirement: Any component is viewable at the widths the product declares
The workbench SHALL offer a selection of viewport widths taken from the widths the codebase itself
declares — its layout breakpoints and the narrowest reference width its responsive rules are written
against — and SHALL re-render the displayed component at the selected width. The selection SHALL
include the narrowest reference width, not only conventional device sizes, because that is the width
the product's own responsive rules are written against.

#### Scenario: A reviewer checks a component at the narrowest supported width
- **WHEN** a reviewer selects the narrowest declared reference width
- **THEN** the component renders at that width, and any horizontal overflow is visible without
  building or navigating the application

#### Scenario: Language and width are checked together
- **WHEN** a reviewer selects both a long-word language and the narrowest width
- **THEN** the component renders under both at once, which is the combination its layout is most
  likely to fail

### Requirement: Inline alert component

The component library SHALL provide an `Alert` atom for an in-flow message, distinct from the toast,
declaring its tone and live-region politeness as properties, and accepting rich content. It SHALL
render a dismiss control only when the caller supplies a way to dismiss, with an accessible name,
and dismissing SHALL remove it from the live region. No screen SHALL hand-write alert markup or its
class names.

#### Scenario: Tone and politeness are declared, not improvised
- **WHEN** a screen shows a failure and, elsewhere, a saved-successfully confirmation
- **THEN** each composes `Alert` with its own tone and politeness, rather than both carrying the same
  class with the announcement contract decided ad hoc at each call site

#### Scenario: A dismissable alert renders a named control
- **WHEN** a caller supplies a dismiss handler
- **THEN** the alert renders a dismiss control with an accessible name, and invoking it removes the
  alert from the live region

#### Scenario: An alert with no dismiss handler has no dismiss control
- **WHEN** a caller supplies no dismiss handler
- **THEN** the alert renders no dismiss control, so a message a screen owns cannot be closed into a
  state the screen did not plan for

#### Scenario: An alert carries more than a line of text
- **WHEN** a screen reports several validation problems at once
- **THEN** they render as a list inside the alert, rather than the alert's class being applied to a
  list element to get the same result

#### Scenario: The tones

- **WHEN** an alert is declared
- **THEN** its tone is informational, success, warning or destructive

### Requirement: The library owns the patterns its screens repeat
The component library SHALL provide a listing, a page section, a stat tile, a tag, a disclosure, and a
segmented control, each at the atomic tier its composition warrants, so a screen composes them instead
of rebuilding them. A screen SHALL NOT hand-write the markup or class names these components own.

#### Scenario: A screen lists records without rebuilding a list
- **WHEN** a screen renders a sequence of records that is not tabular
- **THEN** it composes the listing component, rather than an unordered list with its own reset styles

#### Scenario: A labelled section composes the page-section component
- **WHEN** a screen groups content under a heading with an accessible label
- **THEN** it composes the page-section component, rather than a section element with its own heading
  and spacing

#### Scenario: One segmented control serves both surfaces
- **WHEN** an operator screen offers a filter or view switch, and a public page offers its own
- **THEN** both compose the same segmented-control component, rather than one hand-built tab list per
  surface

#### Scenario: A figure reuses the stat tile's numeral treatment
- **WHEN** a component outside a stat tile needs the display-font tabular numeral — a match score, a
  count on a card
- **THEN** it composes the owned value component, rather than borrowing the stat tile's own class

### Requirement: CalloutBanner Component for Operations and Marketing Actions
The component library SHALL provide a `CalloutBanner` molecule presenting a full-height solid electric cyan left vertical rail, rich description text, and a right-aligned chamfered action button with an external or navigation arrow glyph.

#### Scenario: Callout banner renders full-height cyan accent rail and action button
- **WHEN** `CalloutBanner` is rendered
- **THEN** it displays an uninterrupted electric cyan vertical rail along its left border and places its action button aligned to the right margin

### Requirement: Tactical LanguageSelector Pill
The component library SHALL provide a `LanguageSelector` atom rendering the interface language options inside an asymmetric beveled chamfered pill, displaying a `文A` translation icon, active language code in uppercase monospace font, and a dropdown chevron indicator.

#### Scenario: Language selector renders chamfered pill geometry
- **WHEN** `LanguageSelector` is rendered
- **THEN** it displays as a high-contrast dark panel pill with Top-Right and Bottom-Left beveled corners, translation glyph, and active locale abbreviation

### Requirement: Control composition cannot bypass the token contract
Every Control-web atom, molecule, organism, template, and composing screen SHALL consume declared
CopaLibre tokens for colour, typography, spacing, borders, and motion. A reusable presentation pattern
SHALL live in the owned Control component tiers rather than being recreated as ungoverned screen CSS.

#### Scenario: A Control screen needs a reusable status treatment
- **WHEN** more than one Control screen needs the same status presentation
- **THEN** the treatment is provided by an owned component that resolves only declared tokens

### Requirement: A native form control in a surface file is a violation, not an exemption

The ownership check SHALL report a native `<input type="checkbox">`, `<input type="radio">`, `<input
type="file">` or `<select>` in any surface file as a violation. No control type SHALL be skipped for
lacking an owned replacement; the check SHALL fail until the atom exists. The debt registers and
allowlists for these controls SHALL be empty, with their entries deleted rather than left at zero.

#### Scenario: A raw checkbox is added to a screen
- **WHEN** a native checkbox input is added to any surface file
- **THEN** the ownership check fails, naming the file and the owned atom to compose instead

#### Scenario: A control type with no owned atom fails rather than being skipped
- **WHEN** a control type is used that the owned library has no atom for
- **THEN** the check reports it, rather than exempting it on the grounds that no replacement exists

#### Scenario: No allowance remains for the converted control types
- **WHEN** the ownership check's registers and allowlists are inspected
- **THEN** they contain no entry for checkbox, radio, file or select controls

#### Scenario: Why delete rather than zero

- **WHEN** a register entry reaches zero
- **THEN** it is deleted, so a reader cannot mistake it for permission

### Requirement: Owned file-selection atom

The component library SHALL provide a token-styled file-selection atom every file-accepting screen
composes, with the other form atoms' touch-target minimum and no hardcoded colour, spacing or
radius. Drag-and-drop SHALL only enhance the keyboard and pointer path: a file SHALL be selectable
by keyboard alone, and the drop target SHALL NOT be the only way to reach the control.

#### Scenario: A file is selected without a pointer
- **WHEN** an operator reaches the file-selection control by keyboard and activates it
- **THEN** the file chooser opens and the selection completes without a pointer being used

#### Scenario: The constraints are readable before a file is chosen
- **WHEN** the control is rendered
- **THEN** the accepted file types and the size limit are visible as text, before any selection is
  attempted

#### Scenario: A rejected file explains itself
- **WHEN** a selected file is rejected for its type or size
- **THEN** the control enters its error state and the reason is announced through the message linked to
  the control

#### Scenario: The chosen file is visible after selection
- **WHEN** a file has been selected
- **THEN** its name — or the count, when several were selected — is displayed, with a way to clear or
  replace the selection

#### Scenario: What the atom covers

- **WHEN** a screen accepts a file
- **THEN** the atom has an accessible name and keyboard-operable trigger, a visible focus indicator,
  the accepted types and size limit as readable text before selection, the selected filename or
  count afterwards, a way to clear or replace the selection, and an error message linked to the
  control

### Requirement: Owned radio-group atom
The component library SHALL provide a radio-group atom for a single choice among a small set of visible
options, with a group-level accessible name, arrow-key movement within the group, one tab stop for the
group, a visible focus indicator on the focused option, and a selected state that carries a non-colour
cue in addition to its colour.

#### Scenario: A group is one tab stop
- **WHEN** an operator tabs into a radio group
- **THEN** focus lands on the selected option, or the first when none is selected, and the arrow keys
  move between options without leaving the group

#### Scenario: The selected option is not identified by colour alone
- **WHEN** an option is selected
- **THEN** its selected state is conveyed by a mark or shape in addition to colour

### Requirement: Select atom opens its own styled popover, not the native picker

The `<Select>` atom SHALL render its options in the styled Radix popover (`.cl-select__content`),
and no invisible native `<select>` SHALL intercept a click meant for it. The native `<select>` SHALL
stay in the DOM, off-screen and inert to the pointer, carrying the accessible name and keyboard
semantics. The popover SHALL share the Modal surface (`.cl-dialog-surface`) with the control
chamfer, and its trigger chevron SHALL rotate 180 degrees while open.

#### Scenario: A mouse click opens the styled popover, not the native picker
- **WHEN** an operator clicks the visible `<Select>` trigger
- **THEN** `.cl-select__content` opens over the page
- **AND** the browser's native OS `<select>` picker does NOT open

#### Scenario: An option shows a badge, and the active one shows it in the trigger
- **WHEN** a `<Select>` option carries a `badge` (such as a language code in `LanguageSwitcher`)
- **THEN** the popover row renders the badge trailing its label
- **AND** the trigger renders the active option's badge beside its value

#### Scenario: The popover's geometry and type

- **WHEN** the popover opens
- **THEN** it has top-right and bottom-left bevels (`.cl-chamfer--control`), `padding-block:
  var(--cl-space-1)`, a minimum width of 10rem never narrower than the trigger, and
  `var(--cl-font-mono)` text, as does the trigger

#### Scenario: Option badges

- **WHEN** an option carries a `badge` string
- **THEN** it trails the label in 10px uppercase muted monospace, and beside the active value in the
  trigger

#### Scenario: The highlighted option

- **WHEN** an option is keyboard-highlighted
- **THEN** it shows a 2px leading `--cl-state-live` border, a `--cl-surface-raised` background and
  bold `--cl-state-live` text

### Requirement: A composed container is visually distinct without a call-site decision

A card or section composed inside another SHALL render at a distinguishable surface level without
the composing screen applying a variant, modifier or prop, content alternating against its band and
chrome lifting at any depth. A screen SHALL NOT be able to produce an indistinguishable container by
omitting an attribute, or hand-apply a surface class. Broadcast content SHALL alternate only once,
deeper containers keeping that level with boundary borders.

#### Scenario: A screen composes a panel with no extra props
- **WHEN** a screen composes a card with a header and a body inside a section, passing no variant or
  modifier
- **THEN** the card alternates against the section and its header lifts to the chrome level, each
  distinguishable from what surrounds it

#### Scenario: A screen cannot hand-write the level it wants
- **WHEN** a screen applies a surface class directly to achieve nesting contrast
- **THEN** the ownership check reports it, as it already does for hand-written owned classes

#### Scenario: Chrome and selection on broadcast

- **WHEN** broadcast content nests
- **THEN** chrome and selection keep their own distinct treatments

### Requirement: A component without a story fails the build

Every owned library component, and every React screen and route component of the operator, public
and broadcast surfaces, SHALL have a story, and CI SHALL fail when one does not. Both sets SHALL be
derived recursively from the filesystem. A module rendering no interface SHALL be excluded by a
stated rule. A screen needing real tournament data SHALL be recorded with its reason, the only way
to pass without a story. Astro pages SHALL NOT be reported until an Astro story seam exists.

#### Scenario: A new library component ships without a story
- **WHEN** a component is added to the owned library with no accompanying story
- **THEN** the ownership check fails in CI, naming the component that has none

#### Scenario: The check passes when every component is covered
- **WHEN** every owned library component and every React surface screen has a story, or an exemption
  recorded under a stated rule
- **THEN** the check passes

#### Scenario: A new screen ships without a story
- **WHEN** a React screen or route component is added with no accompanying story
- **THEN** the check fails, naming that screen — rather than passing because it was never registered

#### Scenario: A screen loses the story it had
- **WHEN** a screen that had a story no longer has one
- **THEN** the check fails, naming that screen

#### Scenario: A component that renders no interface is exempt by rule
- **WHEN** a router, provider, composition root, or test-support module has no story
- **THEN** the check passes, because it matches a stated exclusion category rather than because it was
  left off a list

#### Scenario: A screen that cannot render honestly is named rather than faked
- **WHEN** a screen cannot be rendered without data that only a real tournament produces
- **THEN** it is recorded with the reason instead of being given invented data

#### Scenario: A nested public or broadcast screen has no story
- **WHEN** a React screen is added inside a nested public or broadcast directory without a sibling story
- **THEN** the check fails and names its relative path without requiring a coverage-register edit

#### Scenario: A library component is nested inside a tier
- **WHEN** an owned React component is added inside a nested library-tier directory without a story
- **THEN** the check fails and names that component

#### Scenario: An excluded router shares a filename with a screen elsewhere
- **WHEN** a screen without a story has the same filename as an explicitly excluded router at another path
- **THEN** the screen still fails coverage and the router's exemption remains scoped to its own path

#### Scenario: Coverage reaches every directory

- **WHEN** a component is added in a nested directory on any of the three surfaces
- **THEN** the check covers it, not only Control directories, without the check being edited

#### Scenario: What is exempt by rule

- **WHEN** a module is a router, a provider, a composition root or a test-support helper
- **THEN** the stated rule excludes it, so an exclusion is a declared category rather than an
  omission

#### Scenario: Exclusions use paths

- **WHEN** an explicit module exclusion is declared
- **THEN** it is a path relative to `apps/web/src`, and a matching filename alone exempts nothing

### Requirement: TV stories support selectable preview backgrounds

TV stories SHALL offer a shared, keyboard-operable background selector, alongside the language and
viewport controls, with neutral, green chroma and bundled sport-scene samples that need no remote
image. The backdrop SHALL be preview-only: transparent regions reveal it and opaque panels keep
their styling. A sport scene SHALL NOT change the discipline, data, rules or layout mode, and green
chroma SHALL NOT replace a semantic state colour or add production chroma configuration.

#### Scenario: An overlay is reviewed on green chroma
- **WHEN** a reviewer opens the green-chroma TV example
- **THEN** green chroma is visible through the overlay's transparent regions and its panels retain
  their production colours and borders

#### Scenario: A reviewer switches sport samples
- **WHEN** a reviewer uses the background selector to switch between bright and dark sport scenes
- **THEN** the backdrop changes while the same discipline, match state and TV layout remain rendered
- **AND** language and viewport controls remain usable

#### Scenario: An opaque TV panel is previewed
- **WHEN** a sport backdrop is selected for an opaque kiosk or panel presentation
- **THEN** its real opaque surfaces remain intact rather than becoming transparent to expose the image

#### Scenario: Discoverable contexts

- **WHEN** a reviewer browses the TV stories
- **THEN** named chroma and sport-background stories show those contexts, with bright and dark
  sporting environments among the samples

### Requirement: Owned atom for a multi-language display-string field
The component library SHALL provide an owned single-line-input and an owned multi-line-textarea
atom for editing one display string across the platform's supported languages, each showing one
field at a time for whichever language is currently selected via a shared language-tab control,
rather than one always-visible field per language.

#### Scenario: A language already holding text is marked distinctly from one that is empty
- **WHEN** the localized-input atom renders its language tabs
- **THEN** every tab whose language currently has non-empty text carries a visible fill
  indicator that no empty-language tab carries

#### Scenario: Each language tab shows an abbreviation, not the full language name
- **WHEN** the localized-input atom renders its language tabs
- **THEN** each tab's visible label is a short code (e.g. the language's ISO 639-1 code), not
  the language's full written name

#### Scenario: Selecting a language tab swaps the field to that language's own text
- **WHEN** an operator selects a different language tab
- **THEN** the text field displays that language's own current value, and further edits apply
  to that language only

#### Scenario: The atom carries no language list or i18n logic of its own
- **WHEN** either atom is inspected
- **THEN** it receives its set of languages, which are filled, and which is active entirely
  through props, with no supported-language list, translation lookup, or i18n string embedded
  in the atom itself

#### Scenario: Every supported language fits without wrapping the tab strip onto a second row
- **WHEN** all eight of the platform's supported languages are passed to the language-tab
  control
- **THEN** the tabs render on a single row, shrinking to their content rather than wrapping
