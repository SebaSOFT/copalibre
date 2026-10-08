# platform/email-notifications Specification

## Purpose
Tell the people who run a competition when something they manage changes — a tournament or club is created, an entrant registers, a club submits a squad — in the organization's language, with the organization's and the product's branding, and never twice to the same recipient. Also covers the invitation and password-reset emails, which share the layout and the delivery guarantee.

## Requirements

### Requirement: Lifecycle milestones publish transactional outbox events
The system SHALL publish a durable outbox event, in the same transaction as the mutation that caused it,
for each of these milestones: a tournament is created (`tournament.created`), a club is created
(`club.created`), an entrant is registered into a tournament (`entrant.registered`), and a club submits
the squad for a tournament entrant (`entrant.squad-submitted`). `tournament.created` and
`entrant.registered` are existing events; this requirement SHALL extend their payloads without renaming
or removing any existing field. Each payload SHALL carry the actor and, when the mutation was caused by
CSV import, demo loading or a club's own submission, an `origin` value.

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

### Requirement: Notification audience is resolved by role and excludes the actor
The worker SHALL resolve recipients from active organization role assignments at send time. For
`tournament.created` and `club.created` the audience SHALL be the organization's `admin` assignments. For
`entrant.registered` and `entrant.squad-submitted` it SHALL be the organization's `admin` assignments and
the `tournament-admin` assignments scoped to that tournament. The worker SHALL exclude the principal that
caused the event and SHALL collapse duplicate addresses case-insensitively, so one person holding several
qualifying roles is one recipient. An event with no resolved recipient SHALL complete without sending.

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
Every email the worker sends, lifecycle, invitation and password reset, SHALL render through one layout.
The header SHALL show the organization's emblem, name and a link to its public page under
`COPALIBRE_APP_URL`; with no emblem it SHALL show the name only; with no organization, as in a password
reset, it SHALL show the Copa Libre mark only. The footer SHALL show the Copa Libre logo and a link to
`https://copalibre.app`, regardless of the installation's `COPALIBRE_APP_URL`. Every image SHALL have
alternative text, and a plain-text part SHALL always be sent. Action links in the body SHALL use
`COPALIBRE_APP_URL`.

#### Scenario: Organization email shows emblem and name
- **WHEN** a lifecycle email is rendered for an organization with an uploaded emblem
- **THEN** the header contains the emblem image served from that installation's public emblem route, with the organization name as its alternative text, and the organization name linking to its public page

#### Scenario: Organization without an emblem
- **WHEN** the organization has no emblem
- **THEN** the header shows the organization name without a broken image

#### Scenario: Footer signature is the same on every installation
- **WHEN** any email is rendered on a self-hosted installation with its own `COPALIBRE_APP_URL`
- **THEN** the footer links to `https://copalibre.app` and the body's action link points to that installation

#### Scenario: Password reset has no organization
- **WHEN** a password-reset email is rendered
- **THEN** the header shows the Copa Libre mark only and the reset link and expiry text are unchanged

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
For every email the worker sends, identified by its outbox event and recipient address, the system SHALL
send at most one message to that recipient. The worker SHALL reserve the `(event, recipient)` pair
atomically before calling the provider, and SHALL skip a recipient whose pair is already reserved. When
the provider definitely rejects the message the reservation SHALL be released so the row can retry; when
the outcome is uncertain, such as a timeout after the request was sent, the reservation SHALL be kept, the
failure SHALL be logged with the event id, and the recipient SHALL NOT be retried.

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
