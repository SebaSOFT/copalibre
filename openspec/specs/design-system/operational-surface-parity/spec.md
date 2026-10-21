# design-system/operational-surface-parity Specification

## Purpose
Make CopaLibre's operational, public, broadcast and informational surfaces deliver the visual language the `copalibre-app` reference project renders, with reusable presentation, truthful data and reviewable production rendering.

## Requirements

### Requirement: Reference-calibrated component presentation

Operational compositions SHALL use generated semantic and component roles calibrated to the
reference project, verifying actual font loading and role assignment and recording any deliberate
accessibility adaptation with measured contrast evidence. Reference colors SHALL enter components
through the shared token contract, never per-story or per-page overrides. The primary-action role
SHALL be calibrated on its own; the brand primitive backing live state and the focus ring SHALL NOT
move with it.

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

#### Scenario: What is calibrated

- **WHEN** a composition is calibrated
- **THEN** its color, surface depth, typography, numeric alignment, borders, chamfers and density
  follow the reference, including the primary action fill, secondary hover fill and outline, lifted
  chrome and inset content wells

#### Scenario: Why the action stands alone

- **WHEN** the call to action is re-tinted
- **THEN** live badges and focus rings on all three surfaces keep their color

### Requirement: Surface depth alternates for content and lifts for chrome

Surface level SHALL follow two reference rules rather than nesting depth alone: a content container
SHALL alternate against the level it sits on for as long as content nests, and chrome SHALL lift to
the chrome level wherever it sits. Every level boundary SHALL carry the panel border cue.
Alternating table rows SHALL be declared as their own opaque roles. Each level SHALL meet the token
package's contrast gates for the text and border tokens rendered on it.

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

#### Scenario: What content and chrome are

- **WHEN** a surface is composed
- **THEN** sections, card shells and inset blocks holding what is read are content; panel headers,
  footers, chips, tags, eyebrows and icon wells are chrome

#### Scenario: Alternation by example

- **WHEN** a card sits on a dark band, and an inset sits inside a card
- **THEN** the card goes lighter, the same card on a light band goes darker, and the inset returns
  to the parent band's level

#### Scenario: Why rows are opaque

- **WHEN** table rows alternate
- **THEN** their contrast is verifiable from token values, which a translucent fill over the
  background would not be

### Requirement: Server-rendered components are reviewable through their real renderer

The workbench SHALL provide a preview seam rendering a server-rendered component through its
production implementation, with the selected locale and viewport, and SHALL report clearly when its
local server is absent. A preview SHALL NOT be reachable outside development. Review fixture data
SHALL be deterministic and coherent, and interface labels SHALL follow the eight-language toolbar.

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

#### Scenario: How a preview stays out of production

- **WHEN** a preview path is requested
- **THEN** in production it answers as an unknown path, it is absent from the sitemap, and it
  accepts only an allowlisted component identifier and a supported locale, never markup, so it
  cannot become a rendering hole

#### Scenario: What coherent fixtures mean

- **WHEN** review fixtures are used
- **THEN** snapshots are identified consistently, tied standings agree with their supporting data,
  and each discipline keeps its own labels, statistics, clock and event vocabulary

### Requirement: Standings panel exposes ranking evidence in the advertised hierarchy

The standings presentation SHALL render over the existing table owners rather than a new table, with
a panel header, rank and entrant cells, descriptor-driven statistical columns in tabular figures,
and a footer carrying the tiebreaker sequence. Ranking order and comparator outcomes SHALL come from
the projection that produced them, never inferred from score or achieved through presentation. Where
two entrants are level, the deciding comparator SHALL be identifiable in the panel.

#### Scenario: Tied leaders show what separated them

- **WHEN** a standings panel renders four entrants whose top two are level on points
- **THEN** the panel presents the comparator that decided the order, and its footer lists the tiebreaker sequence in the configured order

#### Scenario: Columns follow the discipline

- **WHEN** the panel renders for a discipline that declares different statistical columns
- **THEN** those columns are what appear, with no column borrowed from a discipline the descriptor did not declare

#### Scenario: Narrow widths keep the evidence reachable

- **WHEN** the panel renders at the declared narrow floor
- **THEN** rank, entrant and the deciding statistic remain readable, with any horizontal scroll confined to a labelled bounded region rather than the page body

### Requirement: Operational tags and outcome legends communicate purpose

Eyebrow and section labels SHALL be variants of the existing badge owner, each with a text label
beside any colour, dot or icon. A tag SHALL read as chrome: chrome level, a border, the mono face at
small size. A live tag MAY carry a status dot, inert under reduced motion. An outcome legend SHALL
pair each outcome with a distinct glyph and a written label, separable without colour.

#### Scenario: A legend is readable without colour

- **WHEN** an outcome legend renders advancing and eliminated entries
- **THEN** each carries a distinct glyph and a written label, and neither relies on its fill alone

#### Scenario: A long localized label wraps rather than truncates

- **WHEN** a section label renders a long translated string at the narrow floor
- **THEN** it wraps and stays complete rather than being clipped

#### Scenario: The reference glyphs

- **WHEN** advancement and elimination appear in a legend
- **THEN** advancement is a check in an accented box and elimination a cross in a neutral one, with
  no colour-vision assumption

### Requirement: Ticker has compact and broadcast presentations

The ticker SHALL be an owned component with a compact public mode and a broadcast mode, rendering
upcoming, live, final, empty and stale states, labelling an extra period only where the discipline
configures one, and offering a pause control where it scrolls. Under reduced motion it SHALL show a
static list, and stale data SHALL stay readable with the staleness stated. It SHALL occupy a fixed
height.

#### Scenario: Reduced motion stops the movement, not the information

- **WHEN** the ticker renders under a reduced-motion preference
- **THEN** it presents its entries as a static list with no scrolling, and every entry stays reachable

#### Scenario: Stale data says so

- **WHEN** the ticker's data is stale or its connection is lost
- **THEN** it states that condition rather than presenting an old score as current

#### Scenario: Overtime appears only where configured

- **WHEN** a match runs beyond regulation in a discipline that declares no overtime
- **THEN** no overtime label is rendered

#### Scenario: What an entry carries

- **WHEN** an entry renders
- **THEN** it has a state badge, both entrant names, the score in tabular figures, and the elapsed
  or scheduled time, separated visibly from the next entry

#### Scenario: Why a fixed height

- **WHEN** entries change
- **THEN** the content beneath the ticker does not move

### Requirement: Bracket stage composition preserves competition topology

The bracket stage SHALL compose the existing round, node and connector projections, including the
championship node. It SHALL preserve the topology the format declares and SHALL NOT introduce a
connection the projection did not produce. Where the graph renderer cannot represent a topology, or
the viewport is too narrow, a complete textual round-and-branch presentation SHALL carry the same
information.

#### Scenario: An eight-entrant single-elimination stage renders its rounds

- **WHEN** an eight-entrant stage renders
- **THEN** its quarters, semis and final are labelled, decided connectors are distinguishable from pending paths, and each node links to its match

#### Scenario: A wide bracket scrolls inside its own region

- **WHEN** the bracket is wider than the viewport
- **THEN** it scrolls horizontally inside its own bounded region rather than widening the page body, and its round labels stay associated with their columns

#### Scenario: A topology the graph cannot draw is still readable

- **WHEN** a stage's structure exceeds what the graph renderer represents, or the viewport is below the graph's floor
- **THEN** the complete round-and-branch presentation renders in its place, retaining seeds, sources and outcomes

#### Scenario: No synthetic advancement

- **WHEN** a node has no decided source
- **THEN** it renders as pending, and no winner is inferred from score or position

#### Scenario: What topology is preserved

- **WHEN** a stage renders
- **THEN** seed identities, match links, pending sources, byes, series, loser paths and reset finals
  appear where the format declares them

### Requirement: Public mobile header expands navigation in page flow

The public header SHALL keep brand, locale control and menu toggle in a stable row, and mobile
navigation SHALL expand in page flow, pushing the ticker and content down. The toggle SHALL carry an
accessible name, its expanded state and an icon per state. Hidden links SHALL NOT be focusable;
Escape SHALL close an enhanced menu and restore focus. Without JavaScript, navigation SHALL stay
accessible. The operator surface SHALL keep its modal drawer unchanged.

#### Scenario: Expanding pushes content down

- **WHEN** a visitor opens the mobile menu
- **THEN** the navigation appears in flow above the ticker and page content, displacing them rather than covering them

#### Scenario: Closed navigation is not reachable by keyboard

- **WHEN** the menu is closed
- **THEN** its links are not focusable, and the toggle reports its collapsed state

#### Scenario: Navigation survives without JavaScript

- **WHEN** the page renders with JavaScript unavailable
- **THEN** navigation remains reachable and its destinations are valid locale-aware links

#### Scenario: Destinations and the primary action

- **WHEN** the navigation is expanded
- **THEN** its destinations use the existing locale-aware links and the header's primary action is
  reachable inside it as well as in the header row

#### Scenario: No JavaScript

- **WHEN** scripting is unavailable
- **THEN** navigation works through a native disclosure or an already-expanded list

#### Scenario: Why the operator surface differs

- **WHEN** the operator drawer opens
- **THEN** its overlay, focus trap and return-focus behavior are unchanged, because the two surfaces
  serve different tasks

### Requirement: Informational compositions cover inverse cards, steps, metrics and releases

The library SHALL own an inverse informational card, a numbered step heading, a metric strip from
the stat tile, and an editorial release card from the card and callout owners, each adopted by an
existing surface and documented with its consumer. A metric SHALL show an actual value or an
explicit unavailable state; invented measurements, implied benchmarks and certification claims SHALL
NOT appear in production. No release-management subsystem SHALL be introduced.

#### Scenario: A metric with no value says so

- **WHEN** a metric strip renders where a value is unavailable
- **THEN** it presents an explicit unavailable state rather than a placeholder number

#### Scenario: A step heading wraps at the narrow floor

- **WHEN** a numbered step renders a long translated title at the narrow floor and at 200% zoom
- **THEN** the title wraps and the number stays associated with it

#### Scenario: Editorial content needs no new subsystem

- **WHEN** the editorial composition is adopted
- **THEN** it renders inside an existing information surface, and no release-management feature is added

#### Scenario: The step heading

- **WHEN** a step heading renders
- **THEN** a numbered marker filled in the accent, with contrasting text and the control-size
  chamfer, pairs with a semantic heading and stays with it when the heading wraps

#### Scenario: Metric figures

- **WHEN** a metric value renders
- **THEN** it is set in tabular figures

#### Scenario: Fixtures are labelled

- **WHEN** a workbench shows fixture metric values
- **THEN** they are labelled as demonstrations

#### Scenario: Where adoption happens

- **WHEN** a composition is adopted
- **THEN** the consumer is an existing help, setup, analytics or information surface, and without a
  release listing the editorial card is reached through an existing information surface

### Requirement: Code blocks offer the plain file-header presentation

The terminal block SHALL gain a file variant with a filename header, a copy action and an inset code
body, without window dots or prompt, while the terminal variant stays available. Its header SHALL
read as chrome and its body SHALL set code in the mono face in its own scroll region. Copy SHALL
preserve the source exactly and report success, or a denied or unavailable clipboard. The code SHALL
remain selectable without JavaScript.

#### Scenario: A denied clipboard is reported

- **WHEN** a visitor invokes copy and the clipboard is unavailable or denied
- **THEN** the control reports that outcome, and the code remains selectable by hand

#### Scenario: Long lines stay reachable

- **WHEN** the file variant renders multiline content with lines longer than the viewport
- **THEN** the code scrolls inside its own labelled bounded region rather than widening the page

#### Scenario: The header's layout

- **WHEN** the file header renders
- **THEN** the filename is in the mono face on the chrome level, with the copy action opposite it

### Requirement: Every reference maps to a story and a production consumer

The workbench SHALL carry an index mapping each supplied reference to the story that renders it and to the production surface that consumes it. Newly owned components SHALL have Playground and Matrix coverage in addition to their named reference scenario. Predecessor components and their existing stories SHALL be reused rather than reimplemented.

#### Scenario: Reviewer follows a reference

- **WHEN** a reviewer selects a reference entry in the index
- **THEN** its story renders the corresponding production component with representative data, and names its consuming surface and any known visual discrepancy

#### Scenario: A pattern with no consumer is not finished

- **WHEN** a new visual pattern has no production surface consuming it
- **THEN** it is not recorded as delivered

### Requirement: Surface adoption and parity acceptance require evidence

New visual patterns SHALL be adopted in the relevant existing Control, public, TV or help surfaces
and documented with their consumers. Optional private audit details SHALL keep their access
boundaries. Verification SHALL cover reference hierarchy, actual fonts, colors, geometry and
interaction states through stories and representative routes, and SHALL record its evidence;
unreviewed examples SHALL NOT be marked as achieved parity.

#### Scenario: Full reference review

- **WHEN** implementation is proposed for acceptance
- **THEN** evidence covers every reference, desktop and mobile compositions, declared workbench widths including 188px, eight-language layout, keyboard focus, 200% zoom and reduced motion, plus broadcast readability over light and dark backgrounds

#### Scenario: Optional data and visibility boundaries

- **WHEN** an adopted public composition lacks authorized audit details, hash, verification or timing data
- **THEN** those fields are absent or explicitly unavailable, and the fixture examples do not broaden public visibility or create production claims

#### Scenario: What evidence is recorded

- **WHEN** parity is verified
- **THEN** the record names the reference identifier, story or route, language, viewport, evidence
  location and unresolved discrepancies
