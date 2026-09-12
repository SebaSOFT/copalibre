# atomic-composition-contract Specification

## Purpose

Defines the five-tier atomic-composition contract (atom, molecule, organism, template, page, plus the layout category) that every rendered file across the application must satisfy, and the automated checks that enforce tier membership, dependency direction, and the styling/logic/data/i18n flow rules without relying on review alone.

## Requirements

### Requirement: Every rendered file belongs to exactly one declared tier

Every file under the application's rendering roots SHALL belong to exactly one declared tier — atom,
molecule, organism, template, page, or layout — or to a declared non-tier category: a router, a
context provider or composition root, a test or story module, a fixture, or a registry. A file
belonging to no tier and no declared category SHALL be a violation.

The tier of a file SHALL be decided by its directory, not by a list a person maintains, so that a
newly added component is governed without the rule being edited.

#### Scenario: A component in no tier directory is reported

- **WHEN** a rendering component is added outside every tier directory and outside the declared
  non-tier categories
- **THEN** the composition check fails, naming the file and the tiers it could belong to

#### Scenario: A broadcast surface is governed by the same tiers as the others

- **WHEN** the broadcast overlay's components are checked
- **THEN** they are held to the same tier membership rule as the operator and public surfaces, with
  no surface-specific exemption

### Requirement: Dependencies point downward through the tiers

A file SHALL import only from its own tier or a tier below it, in the order atom, molecule, organism,
template, page. A library tier SHALL NOT import a screen-specific component. An atom MAY compose
another atom.

A cross-surface import SHALL be permitted only from a tier directory declared shared; an import that
reaches from one surface's library into another's SHALL be a violation.

#### Scenario: An organism importing a template is reported

- **WHEN** a component in an organism directory imports from a template directory
- **THEN** the composition check fails, naming both files and the direction violated

#### Scenario: A public component importing an operator atom is reported

- **WHEN** a component under the public library imports an atom from the operator library
- **THEN** the composition check fails, because neither library is declared shared to the other

### Requirement: Layout is composed from primitives, never written inline

The library SHALL provide layout primitives that arrange their children — a vertical stack, a
horizontal row, a grid, and a padded box — accepting spacing, alignment and column counts as steps on
the token scale rather than as lengths.

No file outside the layout-primitive directory SHALL declare an inline style carrying a layout
property — display, gap, flex or grid placement, alignment, justification, margin, padding, or
explicit width and height. A component that needs an arrangement SHALL compose a primitive.

#### Scenario: Inline flex layout is reported

- **WHEN** any component declares an inline style setting `display: flex` and a gap
- **THEN** the composition check fails and names the layout primitive that replaces it

#### Scenario: A primitive spaces its children from the token scale

- **WHEN** a layout primitive is given a spacing step
- **THEN** the rendered spacing resolves to a value from the shared token source, and the primitive
  accepts no raw length

### Requirement: Style values resolve to the shared token source

No component SHALL declare a colour, length, or motion value literally where the shared token source
defines one. A style value SHALL resolve through a token reference.

A component's own stylesheet — the scoped `<style>` block of a server-rendered component — is where
that component's design language is defined and SHALL NOT be reported by this rule; the rule governs
values written at the point of use.

#### Scenario: A raw pixel margin is reported

- **WHEN** a component declares an inline style with a literal pixel or hexadecimal value that is not
  a token reference
- **THEN** the composition check fails and names the file and value

### Requirement: Data access belongs to the page tier alone

No atom, molecule, organism, template, or layout SHALL call the API client, open a realtime
subscription, issue a network request, or read session or application state directly. Each SHALL
receive all data and callbacks as props.

A type-only import of an API response shape SHALL NOT be a violation: a template naming the data it
is given is the contract working, not a bypass of it.

#### Scenario: A template fetching its own data is reported

- **WHEN** a template calls the API client
- **THEN** the composition check fails, naming the page that should supply the data

#### Scenario: A template typed by an API response passes

- **WHEN** a template imports an API response type with a type-only import and renders values passed
  to it as props
- **THEN** the composition check reports no violation

### Requirement: Interface text is formatted at the organism tier and above

No atom or molecule SHALL format an interface message; each SHALL receive rendered text as a prop.
Message formatting SHALL occur at the organism tier or above, where the surface supplying the
catalogue is known.

#### Scenario: An atom formatting a message is reported

- **WHEN** an atom or molecule calls the internationalization runtime to format a label
- **THEN** the composition check fails, naming the consumer that should pass the rendered string

#### Scenario: Moving formatting upward does not change what renders

- **WHEN** a component whose formatting moved to its consumer is rendered in each supported language
- **THEN** the same text appears in each language as before the move

### Requirement: A library component has a consumer or a recorded reason

Every component in a library tier SHALL have at least one production consumer, or an entry in the
reference index stating why it has none. A component with neither SHALL be a violation.

A story is not a consumer: a component that renders only in the workbench has not shipped, and the
index exists so that fact is visible rather than implied.

#### Scenario: An unconsumed component without a reason is reported

- **WHEN** a library component has no production consumer and no reference-index entry
- **THEN** the composition check fails, naming the component and the three ways to resolve it —
  adopt, delete, or record with a reason

#### Scenario: A recorded exemption names why

- **WHEN** a component is exempt because it serves the development preview seam
- **THEN** its reference-index entry states that, and the check passes on that entry alone

### Requirement: Every element the library owns is governed on every surface

The set of governed raw elements SHALL cover every element the library provides an owner for,
including form structure — the form element, its labels, and its grouping elements — and the parts of
a table outside the table owner. An element for which no owner exists SHALL NOT be governed, and an
element that has an owner and is nonetheless ungoverned SHALL be a gap in the rule rather than a
permitted use.

Where a surface's rendering technology has no owner for an element, that gap SHALL be closed by
adding the owner rather than by exempting the surface.

#### Scenario: A raw label is reported once the field owner exists

- **WHEN** a screen renders a raw label element after the field owner ships
- **THEN** the composition check fails and names the field owner

#### Scenario: A server-rendered table composes the server-rendered owner

- **WHEN** a server-rendered surface renders tabular data
- **THEN** it composes the server-renderable table owner, and a raw table element on that surface is
  reported

### Requirement: A component's name states its tier and its role

A library file's name SHALL follow the casing rule declared for its tier directory. A file carrying a
tier suffix SHALL reside in that tier's directory. No two components SHALL share a base name.

A name SHALL describe what the component is rather than a shape it resembles, so that a reader can
predict a component's tier from its name.

#### Scenario: A tier suffix outside its directory is reported

- **WHEN** a file named for one tier resides in another tier's directory
- **THEN** the composition check fails, naming both

#### Scenario: Two components sharing a base name are reported

- **WHEN** two components in different surfaces share a base name with no relation between them
- **THEN** the composition check fails and requires one of them to be renamed

### Requirement: At most one atom owns a given governed raw element

Within a surface's atom tier, at most one atom SHALL render a given governed raw element — the
input, select, textarea, button, table, or dialog the library provides an owner for. A second atom
rendering the same governed element SHALL be a violation, reported the same way a raw use outside the
atom tier is reported.

The directory rule that exempts an atom tier from the raw-element check exists so the file defining a
primitive may use the element it governs; it does not by itself limit that tier to one definition per
element. A second atom reimplementing a governed element from its raw form — rather than composing
the atom that already owns it — bypasses the library from inside the directory meant to prevent that,
and is invisible to a check that only looks for raw elements outside owned directories.

#### Scenario: A second atom reimplementing a governed element is reported

- **WHEN** an atom tier contains two atoms that each render a raw `<select>` from scratch, with no
  relation between them
- **THEN** the composition check fails, naming both and requiring the second to compose the first
  rather than duplicate its element

#### Scenario: A specialized control composes its governed atom instead of duplicating it

- **WHEN** a component needs a governed control with an added visual — a leading icon, a fixed set of
  options — it extends the owning atom with a prop for that addition and composes it, rather than
  writing a second implementation of the element
- **THEN** the composition check reports no violation, because one atom still owns the element and
  the specialization is a caller passing it a prop

### Requirement: The contract is enforced automatically with a ratcheting register

The composition rules SHALL be enforced by an automated check that runs in continuous integration,
resolving the application's imports into a graph and deciding each rule structurally rather than by
matching lines. Every report SHALL name a file and a line.

Violations present when a rule is introduced MAY be recorded in a register keyed by path with a
count. A new violation in a recorded file SHALL fail; a violation in an unrecorded file SHALL fail;
and a count that has improved SHALL fail until the recorded number is lowered, so debt cannot grow
back silently. An entry SHALL be deleted when its count reaches zero.

The register for composition violations SHALL be separate from the register for component-ownership
violations, so that a lowered count in one cannot conceal a regression in the other.

#### Scenario: A recorded file gaining a violation fails

- **WHEN** a file recorded with two violations gains a third
- **THEN** the check fails, reporting only the violation beyond the recorded count

#### Scenario: An improvement that is not recorded fails

- **WHEN** a recorded file's violations drop below its recorded count
- **THEN** the check fails, asking for the number to be lowered or the entry deleted at zero

#### Scenario: The check decides structurally, not by line

- **WHEN** a component is written so that its elements and imports span multiple lines
- **THEN** the check still reports its violations, because the rules are decided over the resolved
  graph rather than over individual lines

### Requirement: Interface text reaches a surface through the catalogues, never as a literal

No rendered component SHALL contain interface text as a literal. Every string a person reads SHALL
resolve through a message descriptor, and every descriptor SHALL state its default in the source
language the catalogues are authored from.

A descriptor SHALL resolve in every supported catalogue. A descriptor present in the source
catalogue and absent from another SHALL be a violation rather than a silent fallback, because a
fallback renders the source language to a reader who selected a different one.

Transient states — loading, empty, and error text — SHALL be held to this rule identically. These are
the strings most often written as literals and least often reviewed, and they are what a reader sees
at the moment a surface is least able to explain itself.

#### Scenario: A literal string in a rendered component is reported

- **WHEN** a component renders a text node that does not resolve through a message descriptor
- **THEN** the composition check fails, naming the file, the line and the text

#### Scenario: A loading state is translated like any other text

- **WHEN** a screen renders its loading or empty state under a selected language
- **THEN** that text appears in the selected language, not in the source language

#### Scenario: A descriptor missing from a catalogue is reported

- **WHEN** a message descriptor resolves in the source catalogue and is absent from another supported
  catalogue
- **THEN** the check fails, naming the descriptor and the catalogue missing it

### Requirement: A presentation labels a value from the record, never from a fixed string

A component rendering a record's changed, measured, or configured values SHALL take each value's
label from the record itself. A component SHALL NOT name a field with a fixed string that happens to
match one kind of record.

A change record SHALL render one row per changed field, each naming that field, so a reader can tell
what was altered without knowing the shape of the payload.

#### Scenario: A non-score correction names its own fields

- **WHEN** an audit entry records a change to fields other than a score — a rescheduled start time and
  a changed venue, say
- **THEN** each changed field is named as itself, and no row is labelled with a field the record does
  not contain

#### Scenario: A discipline's own vocabulary appears

- **WHEN** a presentation renders values for a discipline that names its fields differently
- **THEN** the labels come from that discipline's configuration rather than from a built-in default

### Requirement: Ornament obeys the design system's stated bans and resolves to named tokens

A component SHALL NOT apply an ornamental glow, a resting shadow, or a second accent colour where the
design system bans them. A visual treatment SHALL resolve to a named semantic token rather than
reaching a colour primitive or writing a literal value at the point of use.

A recurring decorative treatment — an accent rail along a component's edge, for instance — SHALL be a
named class in the generated stylesheet rather than an inline declaration repeated per component, so
that the system can be changed in one place and so a scanner can see it.

A deliberate exception SHALL be recorded with its reason, and SHALL NOT be achieved by writing the
value somewhere the check does not look.

#### Scenario: A glow used as a resting indicator is reported

- **WHEN** a component applies a glow to indicate a resting state rather than a transient one
- **THEN** the check fails, naming the token that carries the state without ornament

#### Scenario: An accent rail is a named class

- **WHEN** several components render an accent border along one edge
- **THEN** each composes the same named class, and no component declares that border inline

### Requirement: Content reflows or scrolls at the declared narrow floor, never disappears

At the narrowest width the design system declares, every value a surface renders SHALL remain
reachable. Content MAY reflow, wrap, or scroll within its own bounded and labelled region; it SHALL
NOT be clipped out of view with no indication that anything is missing, and the page body SHALL NOT
scroll sideways to reveal it.

A component with a fixed width SHALL be verified against the ancestors that clip it, since a fixed
width inside a clipping ancestor is what turns a reflow problem into a disappearance.

#### Scenario: A public result stays readable at the narrow floor

- **WHEN** the public live-match scorecard renders at the declared narrow floor
- **THEN** both entrants and both scores remain visible, reflowed or scrollable within their own
  region, with no value clipped away silently

#### Scenario: A wide table scrolls inside its own box

- **WHEN** a table is wider than the narrow floor allows
- **THEN** the table scrolls inside its own labelled region and the page body does not move sideways

### Requirement: A debt register entry names a file that exists

Every entry in a ratcheting register SHALL name a path present in the repository. An entry whose path
does not resolve SHALL fail the check.

An entry that no longer matches any file records debt that can never be paid down and hides whether
the violation moved or was fixed. Verifying the path is what keeps a register a ledger rather than a
list of names nobody can retire.

#### Scenario: A register entry whose file moved is reported

- **WHEN** a file recorded in a register is renamed or moved and its entry is not updated
- **THEN** the check fails, naming the entry and the missing path, so the entry is repointed or
  deleted rather than left unreachable

#### Scenario: Every register entry is reachable

- **WHEN** the registers are validated
- **THEN** every entry resolves to a file, and every recorded count is one the check can still observe

### Requirement: A page is exempt from visual review because it holds no presentation

A page SHALL NOT require a story or a preview of its own. A page that satisfies this contract holds
no presentation to review: its markup is the template it composes, and reviewing the template
reviews the page.

This exemption SHALL be conditional on the contract holding, not granted by file type. A page
carrying presentation — its own markup beyond composing a template and a layout, its own stylesheet,
or its own arrangement of organisms — SHALL be reported by the composition check, because such a page
is neither reviewable nor exempt. The exemption and the rule that earns it are the same rule.

Every component in a library tier SHALL be reviewable through the renderer that ships it. A component
whose rendering technology the workbench cannot host SHALL be reviewable through a preview seam that
renders the production component through the production renderer; re-creating its markup in another
technology SHALL NOT satisfy this, because an imitation only agrees with itself.

#### Scenario: A thin page needs no story

- **WHEN** a page supplies data to a template and composes a layout, and holds no markup of its own
- **THEN** no story or preview is required for it, and the coverage check does not report it

#### Scenario: A page holding its own presentation is reported

- **WHEN** a page renders its own sections, stylesheet, or arrangement rather than composing a
  template
- **THEN** the composition check reports it, naming the presentation that belongs in a template —
  rather than requesting a story for the page

#### Scenario: A server-rendered component is reviewable through its own renderer

- **WHEN** a component in a library tier is server-rendered and cannot be hosted by the workbench
- **THEN** it is reachable through the preview seam, rendered by the renderer that ships it, and a
  library component with neither a story nor a preview entry is reported
