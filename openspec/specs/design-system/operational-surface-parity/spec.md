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

### Requirement: Standings panel exposes ranking evidence in the advertised hierarchy

The standings presentation SHALL render over the existing table owners rather than a new table implementation, with a panel header, rank and entrant cells, descriptor-driven statistical columns in tabular figures, and a footer carrying the tiebreaker sequence. Ranking order and comparator outcomes SHALL come from the projection that produced them; a position SHALL NOT be inferred from score, nor ordering achieved through presentation alone.

Where two entrants are level, the deciding comparator SHALL be identifiable in the rendered panel rather than left to the reader to deduce.

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

Small eyebrow labels and larger section labels SHALL be variants of the existing badge owner rather than new components, each carrying a text label in addition to any colour, dot or icon. A tag SHALL read as chrome: it resolves to the chrome surface level, carries a border, and sets its label in the mono face at small size. Where a tag signals a live condition it MAY carry a status dot, which SHALL be inert under reduced motion.

An outcome legend SHALL pair each outcome with a distinct glyph and a written label — the reference marks advancement with a check in an accented box and elimination with a cross in a neutral one — so the two are separable without colour and without a colour-vision assumption.

#### Scenario: A legend is readable without colour

- **WHEN** an outcome legend renders advancing and eliminated entries
- **THEN** each carries a distinct glyph and a written label, and neither relies on its fill alone

#### Scenario: A long localized label wraps rather than truncates

- **WHEN** a section label renders a long translated string at the narrow floor
- **THEN** it wraps and stays complete rather than being clipped

### Requirement: Ticker has compact and broadcast presentations

The existing ticker presentation SHALL be extracted into an owned component offering a compact public mode and a broadcast mode. It SHALL render upcoming, live, final, empty and stale states, SHALL label an overtime or extra period only where the discipline configures one, and SHALL offer a pause control where it scrolls. Under reduced motion it SHALL present a static list rather than motion, and SHALL remain readable when data is stale, with the staleness stated.

Each entry SHALL carry a state badge, both entrant names, the score, and the elapsed or scheduled time, with the score set in tabular figures so digits do not shift as they change. Entries SHALL be visually separated from one another. The ticker SHALL occupy a fixed height so the content beneath it does not move as entries change.

#### Scenario: Reduced motion stops the movement, not the information

- **WHEN** the ticker renders under a reduced-motion preference
- **THEN** it presents its entries as a static list with no scrolling, and every entry stays reachable

#### Scenario: Stale data says so

- **WHEN** the ticker's data is stale or its connection is lost
- **THEN** it states that condition rather than presenting an old score as current

#### Scenario: Overtime appears only where configured

- **WHEN** a match runs beyond regulation in a discipline that declares no overtime
- **THEN** no overtime label is rendered

### Requirement: Bracket stage composition preserves competition topology

The bracket stage SHALL compose the existing round, node and connector projections, including the championship node the predecessor change owns. It SHALL preserve seed identities, match links, pending sources, byes, series, loser paths and reset finals where the format declares them, and SHALL NOT introduce a connection the projection did not produce in order to complete a picture.

Where the graph renderer cannot represent a topology, or the viewport is too narrow for it, a complete textual round-and-branch presentation SHALL carry the same information.

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

### Requirement: Public mobile header expands navigation in page flow

The public header SHALL keep brand, locale control and menu toggle in a stable row, and its mobile navigation SHALL expand in page flow — displacing the ticker and content downward — rather than overlaying them. The toggle SHALL carry an accessible name and its expanded state, and SHALL change its own icon between the opened and closed conditions. Hidden links SHALL NOT be focusable. Escape SHALL close an enhanced menu and restore focus. Destinations SHALL use existing locale-aware links, and the header's primary action SHALL remain reachable inside the expanded navigation as well as in the header row.

With JavaScript unavailable, the page SHALL retain accessible navigation through a native disclosure or an already-expanded navigation.

The operator surface SHALL retain its modal drawer, with its overlay, focus trap and return-focus behavior unchanged, because the two surfaces serve different tasks.

#### Scenario: Expanding pushes content down

- **WHEN** a visitor opens the mobile menu
- **THEN** the navigation appears in flow above the ticker and page content, displacing them rather than covering them

#### Scenario: Closed navigation is not reachable by keyboard

- **WHEN** the menu is closed
- **THEN** its links are not focusable, and the toggle reports its collapsed state

#### Scenario: Navigation survives without JavaScript

- **WHEN** the page renders with JavaScript unavailable
- **THEN** navigation remains reachable and its destinations are valid locale-aware links

### Requirement: Informational compositions cover inverse cards, steps, metrics and releases

The library SHALL own an inverse informational card, a numbered step heading, a metric strip composed from the existing stat tile, and an editorial release card composed from the existing card and callout owners.

A step heading SHALL pair a numbered marker with a semantic heading, the marker filled in the accent with text that meets contrast against it, chamfered at the control size, and the number SHALL remain associated with its heading when the heading wraps. Metric values SHALL be set in tabular figures. Each SHALL be adopted by an existing help, setup, analytics or information surface, and each adoption SHALL be documented with its consumer.

A metric SHALL present an actual value or an explicit unavailable state. Invented measurements, implied benchmarks and certification claims SHALL NOT appear on a production surface, and fixture values SHALL be labelled as demonstrations in the workbench.

No release-management subsystem SHALL be introduced: where the application has no release listing, the editorial composition SHALL be reachable through an existing information surface instead.

#### Scenario: A metric with no value says so

- **WHEN** a metric strip renders where a value is unavailable
- **THEN** it presents an explicit unavailable state rather than a placeholder number

#### Scenario: A step heading wraps at the narrow floor

- **WHEN** a numbered step renders a long translated title at the narrow floor and at 200% zoom
- **THEN** the title wraps and the number stays associated with it

#### Scenario: Editorial content needs no new subsystem

- **WHEN** the editorial composition is adopted
- **THEN** it renders inside an existing information surface, and no release-management feature is added

### Requirement: Code blocks offer the plain file-header presentation

The existing terminal block SHALL gain a file variant presenting a filename header, a copy action and an inset code body, without the terminal variant's window dots or prompt. Its header SHALL read as chrome — the filename in the mono face on the chrome surface level, the copy action opposite it — and its body SHALL set the code in the mono face inside its own scroll region. The terminal variant SHALL remain available. Copy SHALL preserve the source exactly, SHALL report success, and SHALL report a denied or unavailable clipboard rather than failing silently. The code SHALL remain selectable without JavaScript.

#### Scenario: A denied clipboard is reported

- **WHEN** a visitor invokes copy and the clipboard is unavailable or denied
- **THEN** the control reports that outcome, and the code remains selectable by hand

#### Scenario: Long lines stay reachable

- **WHEN** the file variant renders multiline content with lines longer than the viewport
- **THEN** the code scrolls inside its own labelled bounded region rather than widening the page

### Requirement: Every reference maps to a story and a production consumer

The workbench SHALL carry an index mapping each supplied reference to the story that renders it and to the production surface that consumes it. Newly owned components SHALL have Playground and Matrix coverage in addition to their named reference scenario. Predecessor components and their existing stories SHALL be reused rather than reimplemented.

#### Scenario: Reviewer follows a reference

- **WHEN** a reviewer selects a reference entry in the index
- **THEN** its story renders the corresponding production component with representative data, and names its consuming surface and any known visual discrepancy

#### Scenario: A pattern with no consumer is not finished

- **WHEN** a new visual pattern has no production surface consuming it
- **THEN** it is not recorded as delivered

### Requirement: Surface adoption and parity acceptance require evidence

New visual patterns SHALL be adopted in the relevant existing Control, public, TV or help surfaces and documented with their consumers. Optional private audit details SHALL retain current access boundaries. Verification SHALL cover reference hierarchy, actual fonts, colors, geometry and interaction states through stories and representative application routes. It SHALL record reference identifier, story or route, language, viewport, evidence location and unresolved discrepancies; unreviewed examples SHALL NOT be marked as achieved parity.

#### Scenario: Full reference review

- **WHEN** implementation is proposed for acceptance
- **THEN** evidence covers every reference, desktop and mobile compositions, declared workbench widths including 188px, eight-language layout, keyboard focus, 200% zoom and reduced motion, plus broadcast readability over light and dark backgrounds

#### Scenario: Optional data and visibility boundaries

- **WHEN** an adopted public composition lacks authorized audit details, hash, verification or timing data
- **THEN** those fields are absent or explicitly unavailable, and the fixture examples do not broaden public visibility or create production claims
