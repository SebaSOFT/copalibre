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

A component outside the owned library SHALL NOT hand-write a design-system class that an owned
component already applies, because composing an owned component's markup by hand bypasses that
component exactly as using a raw element does. The automated check enforcing this SHALL detect such a
class regardless of the element carrying it. Files that already contain such classes when the rule is
introduced MAY be recorded in an explicit, dated backlog list so the check still fails for anything
new; each entry SHALL name a file rather than exempting a pattern, and a recorded count SHALL only be
allowed to decrease.

The set of governed elements SHALL cover every element the owned library replaces. Where the library
provides a control for an element, a raw use of that element SHALL be a violation, and an element for
which the library provides no replacement SHALL NOT be governed. An element that has an owned
replacement and is nonetheless ungoverned is a gap in the rule, not a permitted use.

#### Scenario: A new form screen uses FormScreenTemplate and the form-field molecule
- **WHEN** a new screen renders a labeled multi-field form with validation
- **THEN** it composes `FormScreenTemplate` and the form-field molecule, rather than defining its own
  section layout, spacing, label/input/error markup, and styles

#### Scenario: A new listing screen uses ListScreenTemplate and the DataTable organism
- **WHEN** a new screen renders a tabular list of records
- **THEN** it composes `ListScreenTemplate` and the `DataTable` organism, rather than a hand-rolled
  layout and CSS grid table

#### Scenario: The design system's own class names are owned too
- **WHEN** a component outside the owned library writes a class an owned component already applies —
  a `<div>` carrying the card class, a `<span>` carrying the badge class, an element carrying the
  button or data-table class
- **THEN** the ownership check reports it, because composing an owned component's markup by hand
  bypasses that component exactly as a raw element does

#### Scenario: Every element with an owned replacement is governed
- **WHEN** the library provides a component that replaces a raw element — including a select control
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

### Requirement: DropdownMenu organism for a grouped set of actions
The component library SHALL provide a `DropdownMenu` organism for presenting a set of related actions
behind one trigger, consuming the component library's own tokens, so no screen hand-builds menu markup
or substitutes a row of buttons for a grouped set. The organism SHALL expose its trigger and its items
to assistive technology as a menu, SHALL open and close by keyboard as well as pointer, SHALL move
focus through its items with the arrow keys, SHALL close on Escape, and SHALL return focus to its
trigger on close.

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
The repository SHALL provide a component workbench that renders any React component of the operator,
public and broadcast surfaces on its own, without running the application or seeding data, and SHALL
group what it renders by the surface the component belongs to. Every owned library component SHALL be
present in it, showing the states a reviewer has to judge — including its empty, error, and disabled
states where it has them — so a state that is hard to reach in the running application is not thereby
hard to review.

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

### Requirement: An owned component without a story fails the build
Every component in the owned library SHALL have at least one story, and CI SHALL fail when one does
not, so the workbench cannot silently fall behind the library it exists to show. The set of components
checked SHALL be derived from the library directory rather than from a maintained list, so a component
added later is covered without the check being edited.

#### Scenario: A new library component ships without a story
- **WHEN** a component is added to the owned library with no accompanying story
- **THEN** the ownership check fails in CI, naming the component that has none

#### Scenario: The check passes when every component is covered
- **WHEN** every owned library component has at least one story
- **THEN** the check passes

### Requirement: Inline alert component
The component library SHALL provide an `Alert` atom for a message that sits in the flow of a screen,
distinct from the toast mechanism that reports the result of an action. It SHALL declare its tone —
informational, success, warning, or destructive — and the live-region politeness with which assistive
technology announces it, as properties rather than leaving either to each call site. It SHALL accept
rich content, not a single string. It SHALL render a dismiss control when, and only when, the caller
supplies a way to dismiss it; that control SHALL carry an accessible name, and dismissing SHALL remove
the alert from the live region. No screen SHALL hand-write alert markup or its class names.

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
