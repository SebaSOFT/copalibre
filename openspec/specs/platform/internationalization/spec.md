# internationalization Specification

## Purpose

Gives every organization a stable primary language and timezone, defines the eight-language contract
the rest of the platform's interface work targets, and defines how a visitor's own interface-language
preference is resolved — the foundation later changes build translated content and routing on top of.

## Requirements

### Requirement: Eight supported interface languages, as stable codes

The system SHALL define a single, shared list of supported interface languages — English (`en`),
Spanish (`es`), French (`fr`), Portuguese (`pt`), Italian (`it`), German (`de`), Russian (`ru`), and
Mandarin Chinese (`zh`) — as ISO 639-1 codes, never as display labels, reused by every layer that
validates or stores a language selection.

#### Scenario: A language code outside the supported set is rejected

- **WHEN** any API request supplies a `primaryLanguage` value that is not one of the eight supported
  codes
- **THEN** the request is rejected with a validation error naming the supported set

#### Scenario: A display label is never accepted as a language code

- **WHEN** a caller supplies a human-readable label (for example `"Español"`) instead of an ISO 639-1
  code
- **THEN** the request is rejected; only the stable codes are valid values

### Requirement: Organization primary language and timezone

Every organization SHALL carry a `primaryLanguage` (one of the seven supported codes) and a `timezone`
(a valid IANA time zone identifier). Both are presentation-layer defaults only: they never reinterpret
stored instants, which remain UTC throughout the persistence and domain layers.

#### Scenario: A new organization defaults to Spanish and UTC when not specified

- **WHEN** an organization is created without an explicit `primaryLanguage` or `timezone`
- **THEN** the organization is created with `primaryLanguage: "es"` and `timezone: "UTC"`, matching
  today's de facto behavior for installations that predate this capability

#### Scenario: An organization may declare its own primary language and timezone at creation

- **WHEN** an organization is created with an explicit `primaryLanguage` from the supported set and a
  valid IANA `timezone`
- **THEN** the organization is created with those values

#### Scenario: An invalid timezone identifier is rejected

- **WHEN** an organization is created or updated with a `timezone` value that is not a valid IANA time
  zone identifier
- **THEN** the request is rejected with a validation error, and no organization is created or updated

#### Scenario: An organization admin updates the primary language or timezone after creation

- **WHEN** a user holding the organization's `admin` role calls the settings update with a new
  `primaryLanguage`, a new `timezone`, or both
- **THEN** the organization's stored value(s) update accordingly, and every other organization's
  settings are unaffected

#### Scenario: A non-admin cannot update organization settings

- **WHEN** a user without the organization's `admin` role attempts to update `primaryLanguage` or
  `timezone`
- **THEN** the request is refused and no value changes

### Requirement: Interface-language preference is separate from content language

The system SHALL treat a user's chosen interface language (which language buttons, labels, and
navigation render in) as entirely separate from content language (the language an organizer entered a
tournament's, participant's, or organization's own name or description in). Interface-language
preference resolution SHALL never translate or alter organizer-entered content.

#### Scenario: Selecting a different interface language does not alter organizer-entered names

- **WHEN** a user changes their interface language
- **THEN** every organizer-entered name, alias, and description continues to render exactly as entered,
  in whatever language the organizer used

### Requirement: Client-side interface-language preference resolution order

A visitor's interface language SHALL resolve, in order: (1) an explicit preference already stored for
that browser, (2) the organization's `primaryLanguage` when the current page is scoped to a known
organization, (3) the supported language that best matches the browser's own language list, (4) English,
as the final fallback. The stored preference SHALL be a per-browser value (not synced to any user
account), consistent with control and TV surfaces being permitted a simpler locale mechanism than the
public surface's path-prefix routing.

#### Scenario: An explicit stored preference wins over every other signal

- **WHEN** a browser already has a stored interface-language preference
- **THEN** that language is used regardless of the organization's primary language or the browser's own
  language list

#### Scenario: An organization's primary language is used before falling back to the browser

- **WHEN** no preference is stored yet and the current page is scoped to an organization
- **THEN** the organization's `primaryLanguage` is used as the resolved interface language

#### Scenario: The browser's own language list is used off any organization-scoped page

- **WHEN** no preference is stored yet and the current page is not scoped to any organization
- **THEN** the supported language best matching the browser's own language list is used

#### Scenario: English is the final fallback

- **WHEN** no preference is stored, no organization scope applies, and none of the browser's languages
  match a supported code
- **THEN** English is used

### Requirement: Discipline and tournament-profile display strings resolve through the supported-language contract

Every discipline or tournament-profile document's display strings (a discipline or profile's `name`,
a segment type's, event definition's, statistic's, or scoring input's `label`) SHALL be resolvable
against the platform's `SupportedLanguage` contract, falling back to English when the requested
language has no translation, the same fallback behavior the rest of the platform's interface
languages already use. A document's stable `code`/`alias` identifiers are unaffected — this
requirement governs only human-facing display strings, never a value used for effects, capability
binding, or persisted event/statistic records.

#### Scenario: An operator sees a module label in their organization's primary language

- **WHEN** an organization's `primaryLanguage` is `es` and its bound discipline's `yellow-card` event
  definition declares `{ en: "Yellow card", es: "Tarjeta amarilla" }` as its label
- **THEN** the match console renders "Tarjeta amarilla" for that event

#### Scenario: A module with no translation for the requested language falls back to English

- **WHEN** a discipline document's event label is `{ en: "Goal" }` with no `es` entry, and the
  viewer's resolved interface language is `es`
- **THEN** the rendered label is "Goal", not an empty string or an error

#### Scenario: An existing plain-string label remains valid and renders unchanged

- **WHEN** a discipline document authored before this requirement existed declares
  `"label": "Yellow card"` as a plain string
- **THEN** the document validates successfully and every viewer, regardless of interface language,
  sees "Yellow card" — identical to its behavior before this requirement

### Requirement: API error responses carry a stable, localizable error code
Every API error response SHALL carry a stable, machine-readable `errorCode` (kebab-case) alongside its
existing developer-facing `message`, so a client can resolve a translated, operator-facing message
through the platform's eight-language contract instead of rendering the server's message text directly.
An error response with no specific mapped code SHALL still be resolvable to one generic translated
message on the client, never left to render an untranslated string.

#### Scenario: A domain error carries a stable code
- **WHEN** an API request fails validation against a known, named error condition (for example, a club
  alias conflict)
- **THEN** the error response body includes an `errorCode` value stable across releases, in addition to
  its existing `message`

#### Scenario: An error's message text never changes its code
- **WHEN** an error response's developer-facing `message` wording is edited in a later change
- **THEN** its `errorCode` value is unaffected, so a client-side translation mapped to that code
  continues to resolve correctly without needing to change alongside the message text

#### Scenario: The error contract never depends on request locale
- **WHEN** an API request is made in any organization or interface-language context
- **THEN** the response's `errorCode` and `message` are identical regardless of the requester's
  interface-language preference — translation happens client-side, not by the API varying its response
  by locale

### Requirement: Domain-term glossary governs translation of tournament-specific vocabulary

Reference: the glossary document lives at `docs/i18n-glossary.md`.

The platform SHALL maintain a single glossary of domain terms (including but not limited to `roster`,
`seed`/`seeding`, `bracket`, `entrant`, `tiebreak`, `standings`, `zone`/`group`, `alias`, `placement`)
that name a specific tournament-software concept rather than their generic dictionary meaning, with
per-locale guidance on the correct rendering for each of the eight supported languages. Any translation
review, human or LLM-assisted, SHALL check flagged strings containing a glossary term against the
glossary's guidance before treating a translation as correct.

#### Scenario: A glossary term has documented per-locale guidance

- **WHEN** the glossary is inspected for the term `seeding`
- **THEN** it states the expected rendering (or explicitly "keep untranslated") for each of the eight
  supported languages, not just English

#### Scenario: The glossary is the shared reference for review, not an isolated judgment call

- **WHEN** a translation review (human or LLM-assisted) flags a string containing a glossary term
- **THEN** the review's guidance for that term matches the glossary's documented guidance, rather than
  being decided independently per review

### Requirement: Translated content accuracy review requires human confirmation before publication

The system's translated interface strings and localized discipline/tournament-profile display content
SHALL be reviewable for contextual accuracy — not only for completeness, which the existing supported-
language and fallback requirements already guarantee — through a process that produces a report of
flagged strings per locale, and SHALL NOT publish a changed translation for any locale until a human
fluent in that locale has confirmed the specific change.

#### Scenario: A flagged mistranslation is not applied without human confirmation

- **WHEN** a content-accuracy review flags a string in a locale for likely mistranslation or wrong
  domain-term usage
- **THEN** the flagged string's existing translation remains published until a human fluent in that
  locale confirms the proposed replacement

#### Scenario: A review report identifies the specific string and locale, not just a pass/fail

- **WHEN** a content-accuracy review completes for a locale
- **THEN** its report names each flagged message key, its current translation, the concern, and a
  proposed replacement — never only a locale-level score

#### Scenario: Discipline and tournament-profile localized labels are in scope

- **WHEN** a content-accuracy review runs for a locale
- **THEN** it includes that locale's entries in every installed discipline or tournament-profile
  document's localized `name` (and `description`, once that field exists) alongside the interface
  message catalogues
