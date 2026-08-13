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
