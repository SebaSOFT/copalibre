# Broadcast TV Surfaces Specification

## Purpose

Provides unattended venue-TV and streaming-overlay rendering of published tournament data, with its
own reliability and authorization contract distinct from the public and control web surfaces.

## Requirements

### Requirement: Kiosk and overlay routes
The system SHALL serve `/tv/{organization}/tournaments/{tournament}` (full rotation),
`/tv/{organization}/tournaments/{tournament}/stages/{stage}/matches/{match}` (pinned to one match), and the same
routes with `?mode=overlay-lower` or `?mode=overlay-full` for chroma-key/broadcast-graphic rendering,
reusing the organization/tournament alias tuple unchanged from the public routes per the URL and
routing contract. A bare `?mode=overlay` SHALL be treated as an alias for `?mode=overlay-lower`. These
routes SHALL be rendered dynamically per request via server-side rendering for any published
tournament, rather than prerendered for a hardcoded fixture list, and SHALL be proxied through the
internal and edge reverse proxies without 404 or blank document errors.

#### Scenario: Overlay mode renders transparent
- **WHEN** a `/tv/**` route is requested with `?mode=overlay-lower` (or bare `?mode=overlay`)
- **THEN** the server-rendered response renders with a transparent background suitable for chroma-key
  capture, before any client script runs, with no navigation chrome, pointer affordances, or
  dismissible UI

#### Scenario: Overlay-full mode renders an opaque, full-bleed scene
- **WHEN** a `/tv/**` route is requested with `?mode=overlay-full`
- **THEN** the response renders an opaque, full-bleed broadcast graphic using the same match/tournament
  data as `overlay-lower`, with no navigation chrome, pointer affordances, or dismissible UI

#### Scenario: An overlay mode adapts to a portrait browser source without a separate URL
- **WHEN** either overlay mode is rendered in a portrait-dimensioned viewport
- **THEN** the layout adapts to a vertical composition using the same URL, with no additional query
  parameter or route required

#### Scenario: Dynamic tournament kiosk rendering
- **WHEN** an operator navigates to `/tv/{organization}/tournaments/{tournament}` for any active, published tournament
- **THEN** the kiosk page renders the live dashboard with tournament identity, matches, and rotation schedules rather than a blank or 404 page.

### Requirement: Device-scoped display token
Access to a `/tv/**` route or its underlying SSE stream SHALL be authorized by a device-scoped
display token distinct from a person's JWT: issued by an authenticated operator, bound to a specific
`/tv/**` path, independently revocable, and never assumed to persist only via `localStorage`.

#### Scenario: Display token survives a device power-cycle
- **WHEN** a kiosk device loses power and restarts
- **THEN** it resumes rendering its assigned `/tv/**` route without requiring a person to re-enter
  credentials, using its persisted display token

#### Scenario: Revoking a display token stops only that device
- **WHEN** an operator revokes one device's display token
- **THEN** that device loses access to the route while all other devices' tokens and all person JWTs
  remain unaffected

### Requirement: Silent failure handling
A `/tv/**` surface SHALL never present a visible error state requiring user interaction to dismiss or
retry; connection loss and data unavailability SHALL resolve automatically without a person present.

#### Scenario: Backend disconnect recovers without intervention
- **WHEN** the SSE connection underlying a `/tv/**` route drops
- **THEN** the client reconnects automatically and resumes rendering without any visible error message
  requiring a click to dismiss

### Requirement: Long-running memory stability
A `/tv/**` route SHALL sustain multi-day continuous rendering without unbounded memory growth.

#### Scenario: Multi-day soak does not leak
- **WHEN** a `/tv/**` route runs continuously in a headless browser for the duration of the soak-test
  window
- **THEN** measured memory usage does not grow unbounded over that window

### Requirement: Organizer event branding
A `/tv/**` route SHALL support an organizer-supplied logo and accent color layered over the base
Broadcast Command Precision identity without altering core token contracts.

#### Scenario: Organizer branding does not override core state colors
- **WHEN** an organizer applies a custom accent color to a `/tv/**` route
- **THEN** the live/upcoming/destructive/positive-result state colors from `packages/design-tokens`
  remain visually distinguishable and unchanged

### Requirement: TV routes render without a display token
A TV/kiosk route SHALL render real tournament content and remain rendered when requested with no
display token present, rather than requiring one to establish and reloading indefinitely if it cannot.

#### Scenario: Opening a bare, bookmarked TV URL
- **WHEN** a TV route is requested with no `token` query parameter
- **THEN** the page SHALL render the tournament's real current state and SHALL NOT reload or navigate to
  a blank page while waiting for a realtime connection that will never establish

#### Scenario: A display token is present
- **WHEN** a TV route is requested with a valid display token
- **THEN** the page SHALL upgrade to realtime updates on top of the same base rendering

### Requirement: TV routes are isolated from control-panel session state
A TV/kiosk route's rendering SHALL NOT depend on, or be redirected by, any control-panel
authentication/session state.

#### Scenario: A stale admin session cookie is present in the same browser
- **WHEN** a TV route is requested by a browser that also holds an expired or otherwise invalid
  control-panel session
- **THEN** the TV route SHALL still render normally and SHALL NOT redirect to `/control/login`

### Requirement: Broadcast-overlay visual presentation
A TV surface SHALL present a persistent status bar, a dominant focal panel, and a secondary panel
rotating through tournament statistics and highlights, styled per the "Broadcast Command Precision"
token contract (chamfered card geometry, condensed display typography for scores/headlines, monospace
telemetry, club emblems, and LIVE/UPCOMING/FINAL badge language with functional, non-color-only state
cues).

#### Scenario: A finished tournament's TV view
- **WHEN** a tournament has no live match because it is fully finished
- **THEN** the dominant focal panel SHALL present the champion (club emblem, name, final record) rather
  than an empty or unstyled state

#### Scenario: Rotating statistics panel
- **WHEN** a TV route is displayed for an extended period
- **THEN** the secondary panel SHALL rotate through at least standings and top statistical performers on
  a visible timer, and SHALL respect a reduced-motion preference by slowing or disabling that rotation

#### Scenario: Club branding on team references
- **WHEN** a team/club is referenced anywhere on a TV surface
- **THEN** that club's emblem SHALL be shown alongside its name, when the club has one uploaded

### Requirement: The kiosk's dominant focal panel uses its available height
The TV kiosk's dominant focal-match panel SHALL size and populate its content to use the panel's
available height, rather than leaving a majority of it empty above a fixed-height container.

#### Scenario: The focal panel has no large empty area
- **WHEN** the TV kiosk renders its dominant focal panel for an in-progress match
- **THEN** the panel's content extends to use its available height, with no more than a small,
  intentional margin remaining below the lowest content element

### Requirement: A non-overlay TV surface carries the tournament's discipline backdrop
A TV surface rendered in a non-overlay presentation SHALL render the tournament's own discipline
background imagery, blurred and at the same low opacity the public surfaces use, over the broadcast
ink base. An overlay presentation SHALL NOT render that imagery: a transparent overlay stays
transparent, and a solid key colour stays solid.

#### Scenario: A venue kiosk shows the discipline's own imagery
- **WHEN** a TV kiosk route renders for a tournament whose discipline ships background imagery
- **THEN** that imagery renders blurred behind the kiosk content, over the ink base

#### Scenario: An overlay presentation stays keyable
- **WHEN** a TV route renders in the lower-third overlay presentation, with or without a requested key
  colour
- **THEN** no discipline imagery is rendered, and the background remains transparent or the solid key
  colour as requested

### Requirement: TV surfaces present the tournament ticker at broadcast scale
A TV surface SHALL present the same tournament ticker as the public pages, sized for reading at
distance rather than at arm's length, and SHALL honour a reduced-motion preference the same way.

#### Scenario: The ticker renders on a venue display
- **WHEN** a TV kiosk route is displayed for a tournament with live matches
- **THEN** the ticker renders with the tournament's current results at the surface's own type scale

#### Scenario: An overlay presentation does not carry the ticker
- **WHEN** a TV route is requested in the lower-third overlay presentation
- **THEN** the ticker is not rendered, since that presentation exists to leave the frame clear

### Requirement: Broadcast TV styling is token-backed and readable over video
TV display and overlay components SHALL consume declared CopaLibre tokens for their reusable styling.
They SHALL preserve title-safe layout, readable scrims over video, explicit state cues, and
reduced-motion-safe feedback; chroma-key values remain an explicit rendering exception.

#### Scenario: A TV overlay renders over live video
- **WHEN** a broadcast overlay displays score or state information over a video source
- **THEN** its text remains readable through an approved panel or scrim, state is not colour-only, and
  the component does not rely on ornamental glow for legibility

#### Scenario: A TV stylesheet declares a value
- **WHEN** `tv-broadcast.css` or a TV component declares colour, border, radius, or motion
- **THEN** the value resolves to a declared token, except a chroma-key value registered as an explicit
  rendering exception

### Requirement: Reusable TV presentation is owned by a TV UI tier
A TV presentation pattern used by more than one broadcast route SHALL be composed from an owned TV UI
component rather than duplicated stylesheet rules. Relocated TV components SHALL preserve title-safe
layout, readable scrims over video, non-colour-only state cues, and their registered chroma-key
exception.

#### Scenario: A TV component is reused
- **WHEN** a TV presentation pattern appears in more than one broadcast route
- **THEN** it is composed from an owned TV UI component rather than duplicated bespoke stylesheet rules

#### Scenario: A TV component is relocated into the tier
- **WHEN** an existing TV component moves into the owned tier
- **THEN** its overlay remains readable over video, its state cues remain non-colour-only, and it
  introduces no undeclared token

### Requirement: Reusable `ResponsiveTimestamp` Atom
The system SHALL provide a reusable, restylable `ResponsiveTimestamp` atom component that dynamically calculates and renders kickoff, event, or log time relative to the viewing date across TV broadcast, public spectator, and operator control surfaces. It SHALL also support a relative-time format for feeds that intentionally show elapsed time rather than a clock time.

#### Scenario: Same-day timestamp calculation
- **WHEN** a scheduled or recorded timestamp occurs on the current viewing date
- **THEN** `ResponsiveTimestamp` outputs the localized hour and minute (e.g. `14:30`) in an accessible `<time datetime="...">` element.

#### Scenario: Different-day timestamp calculation
- **WHEN** a scheduled or recorded timestamp occurs on a different calendar date
- **THEN** `ResponsiveTimestamp` outputs the localized abbreviated day, month, and time (e.g. `02-Nov 14:30`).

#### Scenario: Relative-time rendering for an activity feed
- **WHEN** `ResponsiveTimestamp` is used with `format="relative"`
- **THEN** it outputs elapsed time relative to now (e.g. "5 minutes ago") in an accessible `<time datetime="...">` element, matching the operator dashboard's existing activity-feed convention.

### Requirement: Entrant Name Responsive Fallback
The system SHALL render an entrant's or club's name so that it adaptively falls back to its official 3/4-letter abbreviation whenever container space is constrained, eliminating ellipsis (`...`) truncation, across all tournament surfaces including TV broadcast.

#### Scenario: Constrained container layout
- **WHEN** container width cannot fit the full entrant name
- **THEN** the rendered name switches to the official abbreviation while retaining the full name in an accessible `title` attribute.

#### Scenario: Unconstrained container layout
- **WHEN** container width accommodates the full entrant name
- **THEN** the full name renders, with optional crest or monogram support.

### Requirement: Reusable `ResponsivePlayerName` Atom
The system SHALL provide a reusable, restylable `ResponsivePlayerName` atom that adaptively renders player/person identities across four responsive width tiers based on available container space:
1. Tier 1 (Full): `[Flag] [First Name] [Last Name]` (e.g. `[ARG] Sebastian Dieguez`)
2. Tier 2 (Medium): `[First Name] [Last Name]` (e.g. `Sebastian Dieguez`)
3. Tier 3 (Compact): `[Initial]. [Last Name]` (e.g. `S. Dieguez`)
4. Tier 4 (Minimal): `[Initial]. [Initial].` (e.g. `S. D.`)

#### Scenario: Full container width
- **WHEN** container width accommodates the complete representation
- **THEN** `ResponsivePlayerName` renders nationality flag icon, first name, and last name.

#### Scenario: Progressively constrained container widths
- **WHEN** container space narrows through medium, compact, and minimal thresholds
- **THEN** `ResponsivePlayerName` gracefully degrades to `First Last`, `F. Last`, and `F. L.` respectively, retaining full name and nationality in `title` and `aria-label`.

#### Scenario: Nationality not available
- **WHEN** no nationality code is supplied for a person
- **THEN** `ResponsivePlayerName` renders the name tiers with no flag and no layout gap, rather than a broken or placeholder icon.

### Requirement: Person-Granularity Table Rows Carry Name, Abbreviation, and Nationality
A person-granularity table projection row SHALL report the actor's resolved display name, tournament-scoped abbreviation (when the actor is a team), and nationality code (when the actor is a person), so that public and TV consumers of the same projection can render responsive team and player identities without a second lookup.

#### Scenario: Player ranking row exposes nationality
- **WHEN** a stage's player-ranking table projection includes a roster member whose match-roster snapshot recorded a nationality
- **THEN** that row's response carries the nationality code, and any consumer of the same projection (standings table, TV top-performers view) can render a flag from it.

#### Scenario: Team ranking row exposes name and abbreviation end to end
- **WHEN** a stage's team-ranking table projection is read through either the operator or the public table route
- **THEN** each row's response carries the resolved entrant name and, when configured, its tournament-scoped abbreviation.

### Requirement: Prominent TV Match Spotlight Emblems
The TV broadcast match spotlight SHALL render high-contrast, prominent team emblems, with the primary home team emblem sized at least 120x120px on the left side.

#### Scenario: Match spotlight layout
- **WHEN** a featured match is displayed on the TV broadcast kiosk
- **THEN** the left home emblem renders with minimum dimensions of 120x120px.
