# realtime-events Specification

## Purpose
Delivers authoritative projection updates to public spectators and authenticated operators live,
with durable replay after disconnect and without ever exposing credentials in a URL.

## Requirements

### Requirement: Public SSE stream
The system SHALL serve `GET /events/public/{organization}/tournaments/{tournament}` as an
`text/event-stream` response with `Cache-Control: no-cache, no-transform`, requiring no
authentication, exposing only sanitized public projections.

#### Scenario: Anonymous client connects successfully
- **WHEN** an unauthenticated client requests `/events/public/{organization}/tournaments/{tournament}` with `Accept: text/event-stream`
- **THEN** the server responds `200 OK` with `Content-Type: text/event-stream` and begins sending events

#### Scenario: Public stream never leaks unpublished data
- **WHEN** a tournament has data an organizer has not published
- **THEN** the public stream for that tournament never includes that unpublished data in any event payload

### Requirement: Durable event envelope
Every event SHALL carry at least `eventId`, `organizationId`, `stream`, `entityId`, `eventType`,
`projectionVersion`, `createdAt`, and `payload` in camelCase, sourced from the persistence layer's
snake_case outbox columns.

#### Scenario: Event envelope is complete
- **WHEN** any event is emitted on any stream
- **THEN** it includes all eight required fields with `eventId`/`projectionVersion`/`createdAt` populated from the corresponding outbox row

### Requirement: Cursor-based reconnection and replay
A client reconnecting with a `Last-Event-ID` header SHALL either receive a replay of missed events
from that cursor, or, if the replay window has expired, an explicit instruction to fetch a complete
current projection.

#### Scenario: Reconnect within replay window
- **WHEN** a client reconnects with `Last-Event-ID` set to an event ID still within the server's replay window
- **THEN** the server replays every event after that ID before resuming live delivery

#### Scenario: Reconnect after replay window expiry
- **WHEN** a client reconnects with a `Last-Event-ID` older than the server's replay window
- **THEN** the server does not silently resume from an arbitrary point; it signals the client to fetch a complete current projection

### Requirement: Authenticated SSE via Fetch streaming
Authenticated event streams SHALL be consumed via Fetch response streaming with an `Authorization:
Bearer` header, not native `EventSource`, at `GET /events/control/{organizationAlias}`.

#### Scenario: Authenticated stream requires a valid bearer token
- **WHEN** a request to `/events/control/{organizationAlias}` is made without a valid `Authorization: Bearer` header
- **THEN** the server rejects the connection before streaming any event

#### Scenario: Token never appears in the URL
- **WHEN** any authenticated SSE connection is established
- **THEN** no access token or refresh credential appears anywhere in the request URL or query string

### Requirement: Long-polling fallback
The system SHALL provide `GET /api/events?after=<cursor>&wait=<seconds>` with the same
authorization, cursor, replay, and projection semantics as the SSE contract, for clients or networks
incompatible with persistent streaming.

#### Scenario: Long-poll returns events and next cursor
- **WHEN** a client calls the long-poll endpoint with a valid `after` cursor
- **THEN** the response includes any events after that cursor and the next durable cursor to use on the following call

### Requirement: Public stream abuse controls
Public SSE connections SHALL be subject to per-IP and per-resource connection limits and bounded
replay depth.

#### Scenario: Excessive connections from one IP are limited
- **WHEN** a single IP address opens more public SSE connections than the configured per-IP limit
- **THEN** additional connection attempts from that IP are rejected until existing connections close or the limit window resets

### Requirement: A placement change reaches the stream of its tournament

Publishing a batch SHALL emit, in the same transaction, one event per published placement it creates,
changes or withdraws, filed under the match, so that it reaches that match's tournament stream. The
event SHALL carry the match, stage, start, estimated end, venue, whether the match was withdrawn, and its
previous published placement, if any. An unpublished placement SHALL emit no public event.

#### Scenario: A moved match reaches its tournament's public stream

- **WHEN** an organizer publishes a batch moving a match of tournament A from 14:30 to 18:00
- **THEN** a subscriber to tournament A's public stream receives one event for that match with its new
  start and venue and its previous start, and a subscriber to tournament B receives nothing for it

#### Scenario: Two tournaments in one batch reach two streams

- **WHEN** one batch moves a match of tournament A and a match of tournament B
- **THEN** each tournament's stream receives the event for its own match only

#### Scenario: A withdrawal is announced

- **WHEN** a published match is withdrawn from its slot
- **THEN** its tournament stream receives an event stating the match is withdrawn, with its previous
  placement

#### Scenario: Unpublished work stays private

- **WHEN** a placement is previewed but not published
- **THEN** no event about it reaches any public stream

### Requirement: The public stream publishes freed slots

The public stream SHALL publish the event that marks a match not-required by an early series decision,
naming the match, so public surfaces stop showing it in its former slot.

#### Scenario: An anulled game leaves the public schedule live

- **WHEN** a best-of-five is decided in three and its fourth and fifth games become not-required
- **THEN** a public subscriber receives an event for each of those two matches, and receives no other
  payload field than the match and its new status

### Requirement: A side resolution reaches its tournament's public stream

When the audited resolution sets or changes the entrant of a persisted side, the event it publishes SHALL
be filed under that side's match, so it reaches the match's tournament stream. Its public form SHALL carry
only the match, the side and the entrant.

#### Scenario: A finalized quarter-final announces its semi-final side

- **WHEN** a quarter-final of tournament A is finalized and its semi-final side resolves
- **THEN** tournament A's public stream receives one event naming the semi-final match, the side and the
  winning entrant, and no other field

#### Scenario: Another tournament hears nothing

- **WHEN** that resolution happens
- **THEN** tournament B's public stream receives nothing for it
