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
A `/tv/**` route SHALL sustain multi-day continuous rendering without unbounded memory growth. The automated scheduled verification pipeline SHALL compile all required workspace domain and engine dependencies before building the production web preview, guaranteeing the headless Chromium soak measurement executes to completion and produces an evaluated report artifact.

#### Scenario: Multi-day soak does not leak
- **WHEN** a `/tv/**` route runs continuously in a headless browser for the duration of the soak-test
  window
- **THEN** measured memory usage does not grow unbounded over that window, and the automated pipeline uploads `tv-soak-report.json` with evaluation results

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

### Requirement: Pinned-match kiosk shows recorded match events
The pinned-match kiosk route (`/tv/{organization}/tournaments/{tournament}/stages/{stage}/matches/{match}`)
SHALL show the match's recorded goal and card events — at minimum the scoring/carded entrant, the
player, and the minute — alongside the score, whenever the match has recorded events. A match with no
recorded events SHALL show no ticker, rather than an empty or placeholder one.

#### Scenario: Pinned match with recorded events shows a ticker
- **WHEN** the pinned-match kiosk route renders a match that has recorded goal or card events
- **THEN** the screen shows those events (entrant, player, minute) alongside the score

#### Scenario: Pinned match with no recorded events shows no ticker
- **WHEN** the pinned-match kiosk route renders a match with no recorded events
- **THEN** the screen shows the score without an empty or placeholder ticker section

### Requirement: Kiosk and overlay routes report a finished tournament's actual state
Any `/tv/**` route variant (kiosk, pinned-match, or either overlay mode) rendering a tournament whose
every match is either finalized or forfeited (a `not-required` match, if any, does not block this)
SHALL show that tournament's status badge and match ticker consistent with that finished state, never
the scheduled/upcoming default a route falls back to when its match data is unexpectedly empty.

#### Scenario: A finished tournament's overlay does not show a scheduled badge
- **WHEN** any `/tv/**` route variant renders a tournament whose matches are all finalized
- **THEN** its status badge reflects the finished state, not the scheduled/upcoming default

#### Scenario: A tournament decided partly by forfeit still shows as finished
- **WHEN** any `/tv/**` route variant renders a tournament where every match is finalized or forfeited,
  with at least one forfeited
- **THEN** its status badge and match ticker reflect the finished state, not the scheduled/upcoming
  default

### Requirement: TV match indicators reflect recorded discipline facts
A TV scorebug SHALL show possession only when the public live projection explicitly supplies a participating side, and each active timed penalty declared by that discipline. It SHALL not infer either marker from score, event names, or unrelated actions. Timed-penalty indicators SHALL update after event recording, manual timer resolution, and timer expiry without requiring a person to reload the display.

#### Scenario: Explicit possession is projected
- **WHEN** a live match projection explicitly identifies a participating entrant as holding possession
- **THEN** the TV scorebug identifies that entrant without claiming a possession percentage

#### Scenario: Timed penalty starts and ends
- **WHEN** a discipline-declared timed penalty is recorded for an entrant
- **THEN** the TV scorebug shows that entrant and the remaining time while the penalty is active, and removes the marker after expiry or authorized manual resolution

#### Scenario: No indicator facts exist
- **WHEN** the live projection omits possession or the match has no active timed penalty
- **THEN** the TV scorebug omits the corresponding indicator rather than showing a default or guessed value

### Requirement: Full-frame TV bracket presents published elimination matches
The full-frame TV kiosk and full overlay SHALL show a bracket section for an elimination stage using the published stage graph. It SHALL retain zone and round context, named pending sources, scores when published, and match state. Lower-third overlays and stages without an elimination bracket SHALL not show bracket cards.

#### Scenario: Published bracket with unresolved slots
- **WHEN** the featured stage is an elimination stage with published bracket matches
- **THEN** the TV section displays matchup cards grouped by zone and round, with unresolved entrants identified by their source matches rather than blank or invented names

#### Scenario: Non-elimination stage or unavailable bracket
- **WHEN** the featured stage is round robin or its bracket projection is unavailable
- **THEN** the TV keeps its other score and statistics sections without an empty bracket section or sample matchup cards

### Requirement: Broadcaster self-service portal
The system SHALL provide a dedicated self-service interface (`/control/tournaments/:id/broadcaster`) allowing authorized streamers and media operators to generate scoped broadcast display tokens and copy ready-to-use OBS Browser Source URLs without super-admin assistance.

#### Scenario: Streamer copies OBS overlay URL
- **WHEN** a streamer visits the broadcaster studio page for an active tournament or match
- **THEN** the system generates a scoped display token and provides a one-click button to copy the full OBS Browser Source URL with recommended resolution (1920x1080) and FPS settings (60fps)

#### Scenario: Overlay live preview
- **WHEN** a streamer configures their overlay on the broadcaster studio page
- **THEN** an embedded iframe renders the live overlay with a background picker (transparent, green chroma `#00FF00`, magenta `#FF00FF`, dark stadium) to preview layout before going live

### Requirement: Animated live event alerts in overlay mode
When rendered in overlay mode (`?mode=overlay-lower` or `?mode=overlay-full`), the broadcast surface SHALL dynamically render animated alert callouts for critical match events (such as goals, points, yellow/red cards, or penalties) received via real-time SSE stream.

#### Scenario: Goal or scoring event triggers animated banner
- **WHEN** a `match.event-recorded` event with a score-altering or highlight action is received by an active overlay
- **THEN** the overlay displays an animated banner showing the scoring team crest, scorer player name, minute/clock, and new score line
- **AND** the banner automatically dismisses after 6 seconds without operator intervention

#### Scenario: Disciplinary card event triggers alert
- **WHEN** a card event (yellow card, red card) is recorded during the match
- **THEN** the overlay displays a graphic callout with the card color, player name, minute, and club emblem
- **AND** auto-dismisses after 5 seconds

#### Scenario: Reduced motion preference
- **WHEN** the browser environment or operating system specifies `prefers-reduced-motion: reduce`
- **THEN** event alert banners transition with simple opacity fading rather than sliding or bouncing keyframe animations

### Requirement: Multi-court TV kiosk presentation mode
The system SHALL support a multi-court grid presentation mode (`?layout=multicourt` or `?grid=auto|2|4|6`) on tournament TV routes (`/tv/{organization}/tournaments/{tournament}`) to display multiple simultaneous matches on venue screens.

#### Scenario: Displaying 4 simultaneous matches in a 2x2 grid
- **WHEN** a TV route is loaded with `?layout=multicourt` and 4 matches are currently active
- **THEN** the screen renders a balanced 2x2 grid where each quadrant represents one court with its assigned court/pitch name, team emblems, score line, and running match clock

#### Scenario: Real-time score update on a specific court
- **WHEN** a score change occurs on Court 2 via SSE event
- **THEN** the Court 2 match card updates its score figures and pulses its indicator dot immediately without disrupting or re-rendering other court cards

#### Scenario: Multi-page rotation for large venues
- **WHEN** more active live matches exist than the selected grid display limit
- **THEN** the multi-court presentation rotates through groups of matches on a 20-second interval, respecting `prefers-reduced-motion` settings

### Requirement: Root TV kiosk launcher and display configuration
The system SHALL serve an interactive kiosk launcher at `/tv` allowing operators and unattended kiosk
displays to configure their destination screen parameters. The launcher SHALL present its controls in
a floating configuration panel above a full-bleed viewport background layer. The launcher SHALL
provide selectors for organization alias, active tournament, display view mode (full dashboard,
standings table, a selected pinned match, or broadcast overlay), background style (blurred discipline
background, neutral, chroma green, football grass, or basketball court), and interface language. When
the operator changes the background selection, the underlying full-bleed viewport layer SHALL mutate
in real time beneath the panel to provide progressive visual feedback. Selecting the pinned-match view
SHALL expose stage and match selectors and SHALL require a selected match before launch. On submission,
the launcher SHALL navigate to the fully configured TV surface URL and persist the configuration in
client storage for automatic recovery on display reboot. Launching an overlay without an explicit
background SHALL default to transparent output for browser-source compositing.

#### Scenario: Root TV route provides interactive kiosk launcher
- **WHEN** a user or kiosk device visits `/tv`
- **THEN** the page renders a floating kiosk launcher popup above a full-bleed background allowing
  selection of organization, tournament, view mode, background theme, and language rather than
  returning a 404

#### Scenario: Real-time background mutation beneath launcher popup
- **WHEN** an operator selects or changes a background style in the `/tv` launcher popup
- **THEN** the full-screen viewport layer behind the popup updates immediately in real-time to reflect
  the selected theme

#### Scenario: Kiosk launcher pre-fills persisted display settings
- **WHEN** a kiosk device that previously launched a TV display reloads `/tv`
- **THEN** the form inputs pre-populate with the previously selected configuration values

#### Scenario: Pinned-match view requires a selected match
- **WHEN** an operator selects the `Matches` view
- **THEN** the launcher presents stage and match selectors from the selected tournament and does not
  launch until a valid match is selected

#### Scenario: Pinned-match selection launches the existing match route
- **WHEN** an operator selects a stage and match in the `Matches` view
- **THEN** the launcher opens that match's existing TV route with the chosen language, presentation,
  and background parameters

### Requirement: Universal background composition across all TV screens
The TV broadcast layout SHALL decouple background rendering from specific overlay modes, allowing any TV
screen and layout mode (full dashboard, multi-court grid, pinned match view, standings table, lower
third, or full overlay) to be combined with any supported background style: blurred subtle discipline
imagery (`bg=discipline`), neutral dark surface (`bg=neutral`), solid chroma key color (`bg=chroma`),
turf green (`bg=football`), hardwood court (`bg=court`), or transparent alpha channel
(`bg=transparent`).

#### Scenario: Kiosk screen renders with selected background query
- **WHEN** any `/tv/**` screen is requested with a `?bg=` or `?background=` parameter (e.g.
  `?bg=court` or `?bg=chroma`)
- **THEN** the TV layout renders that background style behind the screen content, regardless of whether
  the route is a full kiosk dashboard or a pinned match view

#### Scenario: Blurred discipline background is applied to arbitrary TV screens
- **WHEN** a TV route is requested with `?bg=discipline`
- **THEN** the TV layout renders the blurred, subtle atmospheric discipline backdrop image matching the
  tournament's declared discipline

### Requirement: TV surfaces present each zone of a mixed-format stage by its effective format
A full-frame TV surface SHALL present a stage whose zones play different formats zone by zone: every table-producing zone SHALL appear as its own standings table headed by the zone's name, every elimination zone SHALL appear in the bracket view, and a league zone SHALL list its matches grouped by round. Rows of different zones SHALL NOT be interleaved in one table. A stage whose zones all play the stage's own format, and a stage without declared zones, SHALL render exactly as before. The lower-third overlay SHALL be unchanged.

#### Scenario: Two league zones show two headed tables
- **WHEN** the kiosk shows the standings of a stage with two table-producing zones
- **THEN** each zone renders as its own table headed by that zone's name
- **AND** no row of one zone appears in the other zone's table

#### Scenario: A league zone beside knockout zones has a fixtures view
- **WHEN** a stage has knockout zones and one league zone
- **THEN** the bracket view draws the knockout zones only
- **AND** the league zone's matches are available as a view grouped by round, with each match's state and score

#### Scenario: A uniform stage is unchanged
- **WHEN** every zone plays the stage's own format, or the stage declares no zones
- **THEN** the standings tab and bracket view render as they did before zone formats could differ

### Requirement: TV club emblems resolve through the same-origin club emblem route
A TV surface SHALL request a club's emblem from the same-origin club emblem route built from the club's identifier, SHALL NOT build image URLs from an object identifier, and SHALL show the club's monogram when the club has no emblem or the request fails.

#### Scenario: Standings, spotlight, performers and the recap show emblems
- **WHEN** the kiosk shows standings, the match spotlight, the performers view or the champion recap for clubs that have emblems
- **THEN** each emblem image loads from the club emblem route

#### Scenario: A missing emblem shows a monogram
- **WHEN** a club has no emblem or its request fails
- **THEN** the surface shows the club's abbreviation instead of a broken image

### Requirement: The TV recap of a finished tournament names the resolved champions
When every match of a tournament is final and the tournament has resolved winners, the kiosk's recap SHALL present each resolved zone's champion or co-champions under the zone's name, and SHALL NOT present a standings leader of an earlier stage as the tournament's champion. A tournament without resolved winners (such as a single league) MAY present its first-ranked entrant as champion.

#### Scenario: Three cups show three champions
- **WHEN** a finished tournament has resolved winners for three zones of its last stage
- **THEN** the recap shows each zone's champion headed by that zone's name

#### Scenario: A group-stage leader is not the champion
- **WHEN** the first stage's standings leader did not win a final
- **THEN** the recap does not name that entrant as champion

#### Scenario: A league tournament keeps its champion
- **WHEN** a finished tournament is one league with no elimination stage
- **THEN** the recap names the first-ranked entrant as champion

### Requirement: TV surfaces show formatted dates and a labelled status
No TV surface SHALL print a machine timestamp. Dates and times SHALL render through the shared timestamp atom in the viewer's language and the organization's time zone. The header of a finished tournament SHALL show the date of its last match, without a ticking clock; the header of a live tournament SHALL show a labelled clock without seconds.

#### Scenario: The ticker shows a readable date
- **WHEN** the ticker lists a match with a kick-off time
- **THEN** the date reads as a localized date and time, not as an ISO string

#### Scenario: A finished tournament has no ticking clock
- **WHEN** every match is final
- **THEN** the header shows the finish date and no running clock

### Requirement: Every TV route keeps the same outer margin
Every TV route and panel SHALL keep the same outer margin on all four sides, including the bottom edge.

#### Scenario: The bottom margin is present on the dashboard
- **WHEN** the rotating dashboard and the pinned-match route are shown at the same size
- **THEN** both leave the same margin below their lowest panel

### Requirement: Each TV view shows what it is named for
The `standings` view SHALL show the standings full-frame, the `matches` view the paged match list full-frame, and a pinned match SHALL show that match's own data and events whether or not it is finished. The champion recap SHALL appear only in the rotating dashboard of a finished tournament.

#### Scenario: Standings differ from the dashboard
- **WHEN** a finished tournament is opened with `view=standings`
- **THEN** the kiosk shows the standings, not the champion recap

#### Scenario: A finished pinned match shows its data
- **WHEN** a pinned match of a finished tournament is opened
- **THEN** the kiosk shows that match's score, sides and recorded events

### Requirement: A pinned match is identified by its stage ordinal
The pinned-match route SHALL resolve its match by the same stage ordinal the public match route uses, and overview and live match data SHALL carry that ordinal.

#### Scenario: Match 34 of stage 1 is found
- **WHEN** the pinned route for stage 1 and match 34 is opened for a stage with 36 matches
- **THEN** it shows the thirty-fourth match of the stage

#### Scenario: An unknown ordinal is reported
- **WHEN** the ordinal is beyond the stage's matches
- **THEN** the kiosk reports that the match does not exist instead of showing another view

### Requirement: The TV match list is compact
The TV match list SHALL render as a compact table showing two matches per row at broadcast size and SHALL page through long lists with the rotation.

#### Scenario: Seventy-two matches page
- **WHEN** a tournament has seventy-two matches
- **THEN** the list shows them two per row, several rows per page, advancing page by page

### Requirement: The kiosk refreshes from addresses that are served
The kiosk's client-side refreshes of live matches and of the featured stage's bracket SHALL request addresses that the deployed API or web application serves.

#### Scenario: A live refresh is answered
- **WHEN** the kiosk's refresh interval elapses
- **THEN** it requests the tournament's live matches at an address that answers with the live projection

### Requirement: The launcher names stages and pins a match for the overlay
The TV display launcher SHALL show each stage with its number and name, SHALL list match choices grouped by stage and zone or group with the round and the entrants' names, and SHALL offer the match choice for the overlay view and put the explicit match in the launch link. The launcher SHALL use the TV typography and control styles.

#### Scenario: Stages have names
- **WHEN** the viewer opens the stage select for a tournament with a group stage and cups
- **THEN** each option shows its number and name

#### Scenario: The overlay view asks for a match
- **WHEN** the viewer selects the overlay view
- **THEN** the match fields are shown and the launch link carries the chosen match

#### Scenario: The overlay may stay on the live match
- **WHEN** the overlay's match is left on the automatic choice
- **THEN** the launch link names no match and the overlay shows the court's live match

#### Scenario: Two overlays, two matches
- **WHEN** two overlay links are launched with different matches
- **THEN** each overlay shows its own match

### Requirement: The public main menu links to the TV display launcher
The public site's main navigation SHALL include a "TV Streaming" link to the TV display launcher, carrying the page's language.

#### Scenario: The menu reaches the launcher
- **WHEN** a spectator opens the main menu of any public page
- **THEN** a TV Streaming link leads to the launcher in the page's language
