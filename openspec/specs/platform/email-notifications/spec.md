# platform/email-notifications Specification

## Purpose
Tell the people who run a competition when something they manage changes — a tournament or club is created, an entrant registers, a club submits a squad — in the organization's language, with the organization's and the product's branding, and never twice to the same recipient. Also covers the invitation and password-reset emails, which share the layout and the delivery guarantee.

## Requirements

### Requirement: Lifecycle milestones publish transactional outbox events

The system SHALL publish a durable outbox event, in the same transaction as the mutation that caused
it, for each lifecycle milestone, and SHALL extend the existing events' payloads without renaming or
removing any field. Each payload SHALL carry the actor and, when the mutation was caused by CSV
import, demo loading or a club's own submission, an `origin` value.

#### Scenario: Tournament creation publishes its event atomically
- **WHEN** a user creates a tournament in an organization
- **THEN** the tournament row, its audit row and a `tournament.created` outbox row commit in one transaction
- **AND** the payload still carries `tournamentId`, `alias` and `status`, and additionally the actor

#### Scenario: Club creation publishes an event
- **WHEN** a club is created under an organization
- **THEN** a `club.created` outbox row commits in the same transaction as the club and its audit row

#### Scenario: Squad submission publishes an event in the transaction that persists the squad
- **WHEN** a club submits a squad for a tournament entrant
- **THEN** an `entrant.squad-submitted` outbox row carrying the entrant, tournament, team and member count commits in the same transaction that persists the squad

#### Scenario: A failed mutation publishes nothing
- **WHEN** any of these mutations rolls back
- **THEN** no outbox row for it exists

#### Scenario: The milestones

- **WHEN** a tournament is created, a club is created, an entrant is registered, or a club submits a
  tournament entrant's squad
- **THEN** `tournament.created`, `club.created`, `entrant.registered` or `entrant.squad-submitted`
  is published respectively

#### Scenario: Existing events keep their fields

- **WHEN** `tournament.created` or `entrant.registered` gains fields
- **THEN** every field it already carried is still present under the same name

### Requirement: Notification audience is resolved by role and excludes the actor

The worker SHALL resolve recipients from active organization role assignments at send time: the
organization's `admin` assignments for `tournament.created` and `club.created`, and additionally
that tournament's `tournament-admin` assignments for `entrant.registered` and
`entrant.squad-submitted`. It SHALL exclude the actor and SHALL collapse duplicate addresses
case-insensitively, and an event with no recipient SHALL complete without sending.

#### Scenario: Organization admins are notified of a new club
- **WHEN** a `club.created` event is processed for an organization with two active `admin` assignments, neither of them the actor
- **THEN** each of the two addresses receives one email

#### Scenario: Tournament admins of another tournament are not notified
- **WHEN** an `entrant.registered` event is processed for tournament A
- **THEN** a `tournament-admin` assigned to tournament B receives nothing

#### Scenario: Inactive and removed assignments are not notified
- **WHEN** a qualifying assignment has a status other than active, or has been removed
- **THEN** its address receives nothing

#### Scenario: The actor is not notified of their own action
- **WHEN** an organization `admin` creates a club
- **THEN** that admin receives no email for it, while the other admins do

#### Scenario: An address held through two assignments receives one email
- **WHEN** two active qualifying assignments carry the same address, compared case-insensitively
- **THEN** that address receives exactly one email for the event

#### Scenario: No recipient
- **WHEN** the only qualifying assignment belongs to the actor
- **THEN** the event completes without sending and without failing

### Requirement: Bulk imports and demo loading send no email
An outbox event whose `origin` is `import` SHALL send no email, so CSV import and demo loading do not
produce one email per record.

#### Scenario: CSV import registering many entrants
- **WHEN** a CSV import registers 200 entrants
- **THEN** no email is sent for any of them

### Requirement: Every email is branded with the organization and the product

Every email the worker sends SHALL render through one layout, with the organization in the header
and the Copa Libre signature in the footer. Every image SHALL have alternative text, a plain-text
part SHALL always be sent, and action links in the body SHALL use `COPALIBRE_APP_URL`.

#### Scenario: Organization email shows emblem and name
- **WHEN** a lifecycle email is rendered for an organization with an uploaded emblem
- **THEN** the header contains the emblem image served from that installation's public emblem route, with the organization name as its alternative text, and the organization name linking to its public page

#### Scenario: Organization without an emblem
- **WHEN** the organization has no emblem
- **THEN** the header shows the organization name without a broken image

#### Scenario: Footer signature is the same on every installation
- **WHEN** any email is rendered on a self-hosted installation with its own `COPALIBRE_APP_URL`
- **THEN** the footer links to `https://www.copalibre.app` and the body's action link points to that installation

#### Scenario: Footer link targets the canonical host
- **WHEN** any email is rendered
- **THEN** the footer link's address and its visible text name `www.copalibre.app`, not the apex `copalibre.app`, so following it needs no redirect

#### Scenario: Password reset has no organization
- **WHEN** a password-reset email is rendered
- **THEN** the header shows the Copa Libre mark only and the reset link and expiry text are unchanged

#### Scenario: Which emails share the layout

- **WHEN** the worker sends a lifecycle, invitation or password-reset email
- **THEN** each renders through the same layout

#### Scenario: The header

- **WHEN** an email is rendered
- **THEN** the header shows the organization's emblem, name and a link to its public page under
  `COPALIBRE_APP_URL`; with no emblem, the name only; with no organization, the Copa Libre mark only

#### Scenario: The footer

- **WHEN** an email is rendered on any installation
- **THEN** the footer shows the Copa Libre logo and a link to `https://www.copalibre.app`, whatever
  `COPALIBRE_APP_URL` is

### Requirement: Emails use the organization's primary language
The worker SHALL render each email in the `primary_language` of the organization it concerns, one of the
eight supported languages, with a message entry required for every supported language. An email with no
organization SHALL use English.

#### Scenario: Spanish-language organization
- **WHEN** a lifecycle email is rendered for an organization whose primary language is `es`
- **THEN** its subject and body are in Spanish

#### Scenario: Password reset
- **WHEN** a password-reset email is rendered
- **THEN** it is in English

### Requirement: The same email is never sent twice to the same recipient

The system SHALL send at most one message per outbox event and recipient address. The worker SHALL
reserve the `(event, recipient)` pair atomically before calling the provider and SHALL skip a
reserved pair. A definite provider rejection SHALL release the reservation so the row can retry; an
uncertain outcome SHALL keep it, SHALL be logged with the event id, and SHALL NOT be retried.

#### Scenario: Retry after a partial failure
- **WHEN** an event with three recipients sends to the first, then the provider rejects the second, and the row is retried
- **THEN** the first recipient is not sent to again, and the second and third are sent to

#### Scenario: Redelivery after a worker crash
- **WHEN** a worker crashes after sending to a recipient and before completing the row, and the row is claimed again
- **THEN** that recipient receives no second email

#### Scenario: Two workers claim the same row
- **WHEN** two workers process the same event concurrently
- **THEN** each recipient receives exactly one email

#### Scenario: Operator re-enqueues a dead-lettered event
- **WHEN** an operator re-enqueues an event whose email some recipients already received
- **THEN** those recipients receive no second email

#### Scenario: Uncertain outcome is not retried
- **WHEN** a provider request times out after the message may have been accepted
- **THEN** the reservation is kept and the recipient is not retried

#### Scenario: Existing emails follow the same rule
- **WHEN** an invitation or password-reset row is delivered twice
- **THEN** its recipient receives one email

#### Scenario: What counts as uncertain

- **WHEN** a timeout occurs after the request was sent
- **THEN** the outcome is uncertain

### Requirement: Email delivery outcomes are observable

The worker SHALL count every email delivery attempt by outcome (sent, already sent, outcome unknown,
refused) and SHALL expose those counts through its metrics surface. An outcome-unknown delivery
SHALL be logged with the event type and a hash of the recipient, and SHALL NOT include the address.
Observability SHALL NOT change the guarantee that the same email is never sent twice.

#### Scenario: An unknown outcome is counted and logged without the address
- **WHEN** the provider fails in a way that leaves acceptance uncertain
- **THEN** the unknown-outcome count increases by one
- **AND** the log line carries the event type and a recipient hash but not the address
- **AND** the recipient is not retried

#### Scenario: A refused message is counted separately
- **WHEN** the provider definitely refuses a message
- **THEN** the refused count increases and the unknown count does not

#### Scenario: A duplicate attempt does not resend
- **WHEN** the same event and recipient are attempted twice
- **THEN** the second attempt is counted as already sent and no message is sent

#### Scenario: Why the counts exist

- **WHEN** an operator reads the metrics
- **THEN** they show how many recipients may not have received an email

### Requirement: A club-portal submission is announced once
When a club submits through the club portal, the administrators SHALL receive the squad notice and SHALL NOT also receive a registration notice for the same submission, so that one submission does not produce two emails seconds apart.

#### Scenario: A club-portal submission sends the squad notice only
- **WHEN** a club submits its squad through the club portal, publishing both a registration and a squad event
- **THEN** the squad notice is sent to the administrators
- **AND** no registration notice is sent for that submission

#### Scenario: A registration made by an administrator still sends its notice
- **WHEN** an entrant is registered by an administrator rather than through the club portal
- **THEN** the registration notice is sent as before

### Requirement: A published reschedule notifies the clubs and tournament admins involved

When a published batch changes or withdraws previously published placements, the worker SHALL send each
recipient one email for the batch, listing that recipient's affected matches with previous and new start
and venue, grouped under the reason that applies to each. Recipients are active `club-admin` assignments of the clubs whose teams
play an affected match, and active `tournament-admin` assignments of its tournament, excluding the actor.

#### Scenario: Both clubs of a moved match are told

- **WHEN** an organizer moves a published match between two clubs' teams from 14:30 to 18:00, giving the
  reason "venue unavailable"
- **THEN** each club's admin receives one email naming the match, 14:30 and 18:00 and the reason, in the
  organization's primary language

#### Scenario: One email per batch, not per match

- **WHEN** one batch moves three matches of the same club's team
- **THEN** that club's admin receives one email listing all three matches

#### Scenario: Exceptions are grouped under their own reason

- **WHEN** a batch moves two of a club's matches for "Court 1 without lights" and a third, as an
  exception, for "requested by the visiting club"
- **THEN** that club's email lists the first two under one reason and the third under the other

#### Scenario: A preset reason is written in the email's language

- **WHEN** a match was moved with the preset reason "weather"
- **THEN** the email states that reason in the organization's primary language

#### Scenario: Unaffected clubs are not told

- **WHEN** a batch moves only matches between clubs A and B
- **THEN** the admin of club C receives nothing

#### Scenario: A first placement sends nothing

- **WHEN** a batch only places matches for the first time
- **THEN** no reschedule email is sent

#### Scenario: Demo loading and imports stay silent

- **WHEN** a schedule is published by demo loading or a bulk import
- **THEN** no reschedule email is sent

#### Scenario: The actor is not told of their own change

- **WHEN** a tournament admin who also holds a club-admin assignment moves a match of their own club
- **THEN** that person receives no email for the batch
