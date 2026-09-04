# Broadcast TV Surfaces Specification

## Purpose

Provides unattended venue-TV and streaming-overlay rendering of published tournament data, with its
own reliability and authorization contract distinct from the public and control web surfaces.

## Requirements

### Requirement: Kiosk and overlay routes
The system SHALL serve `/tv/{organization}/tournaments/{tournament}` (full rotation),
`/tv/{organization}/tournaments/{tournament}/stages/{stage}/matches/{match}` (pinned to one match), and the same
routes with `?mode=overlay` for transparent chroma-key rendering, reusing the organization/tournament
alias tuple unchanged from the public routes per the URL and routing contract. These routes SHALL be
rendered dynamically per request via server-side rendering for any published tournament, rather than
prerendered for a hardcoded fixture list, and SHALL be proxied through the internal and edge reverse proxies
without 404 or blank document errors.

#### Scenario: Overlay mode renders transparent
- **WHEN** a `/tv/**` route is requested with `?mode=overlay`
- **THEN** the response renders with a transparent background suitable for chroma-key capture, with
  no navigation chrome, pointer affordances, or dismissible UI

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
