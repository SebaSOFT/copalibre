# Broadcast TV Surfaces Specification

## Purpose

Provides unattended venue-TV and streaming-overlay rendering of published tournament data, with its
own reliability and authorization contract distinct from the public and control web surfaces.

## Requirements

### Requirement: Kiosk and overlay routes
The system SHALL serve `/tv/{organization}/tournaments/{tournament}` (full rotation),
`/tv/{organization}/tournaments/{tournament}/stages/{stage}/matches/{match}` (pinned to one match), and the same
routes with `?mode=overlay` for transparent chroma-key rendering, reusing the organization/tournament
alias tuple unchanged from the public routes per the URL and routing contract.

#### Scenario: Overlay mode renders transparent
- **WHEN** a `/tv/**` route is requested with `?mode=overlay`
- **THEN** the response renders with a transparent background suitable for chroma-key capture, with
  no navigation chrome, pointer affordances, or dismissible UI

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
