# control-web-shell Specification

## Purpose
Provides the authenticated operator application shell — component vocabulary, session model, API and
SSE clients, and license-compliance bookkeeping — that every control-web screen in later phases is
built inside.
## Requirements
### Requirement: JWT access token held in memory only
The control application SHALL hold the JWT access token in memory only and SHALL NOT persist it in
`localStorage`, `sessionStorage`, or a cookie.

#### Scenario: Access token absent from persistent storage
- **WHEN** a user is authenticated in the control application
- **THEN** inspecting `localStorage` and `sessionStorage` finds no access token value

#### Scenario: Reload requires re-authentication in strict mode
- **WHEN** the browser is reloaded with no persistent refresh credential configured
- **THEN** the user is returned to the authentication flow rather than silently remaining logged in

### Requirement: Authenticated requests use a Bearer header, never a URL
Every authenticated API request and authenticated SSE connection SHALL send the access token via the
`Authorization: Bearer` header and SHALL NOT place it in a URL query string.

#### Scenario: SSE connection carries the token in a header
- **WHEN** the control application opens the authenticated SSE stream
- **THEN** the request is made via Fetch streaming with an `Authorization` header, and the resulting URL contains no token value

### Requirement: Owned component layer, not Chakra UI
The control application SHALL use the owned shadcn/ui-style component source and Radix Primitives for
its interactive UI, and SHALL NOT include Chakra UI as a production dependency.

#### Scenario: No Chakra dependency in production build
- **WHEN** the control application's production dependency list is inspected
- **THEN** it contains no Chakra UI package

### Requirement: Third-party notice inventory stays current
Every copied shadcn/ui component file or direct Radix dependency added to the control application
SHALL have a corresponding entry in `THIRD_PARTY_NOTICES.md` preserving its MIT copyright/permission
notice.

#### Scenario: New copied component requires a notice entry
- **WHEN** a new shadcn/ui-style component file is added under `apps/web/src/control/components/ui/`
- **THEN** `THIRD_PARTY_NOTICES.md` contains a corresponding entry before the change is considered complete

### Requirement: Control-panel interface strings are extracted and language-switchable

Every user-facing control-panel string (labels, buttons, validation messages, status words) SHALL be
sourced from a message catalog keyed by a stable ID, never hardcoded inline, so a screen's interface
language can change without touching its logic. The active language SHALL resolve via the platform's
client-side language-preference order (0051): an explicit stored preference, then a supported browser
language, then English — with an explicit switcher available to change the stored preference.
Organizer-entered content (tournament names, participant names, organization names) is never
translated by this mechanism.

#### Scenario: Selecting a language changes control-panel chrome without changing content

- **WHEN** an operator selects a different interface language from the control-panel switcher
- **THEN** labels, buttons, and messages re-render in the selected language, while every
  organizer-entered name continues to render exactly as entered

#### Scenario: An unset preference falls back through browser language to English

- **WHEN** no interface-language preference is stored yet for a browser
- **THEN** the control panel resolves the interface language from the browser's own language list,
  falling back to English if none of the browser's languages are supported

#### Scenario: Dates and times render in the active interface language, not a fixed locale

- **WHEN** the control panel renders a date or time value
- **THEN** it formats using the active interface language, never a hardcoded locale tag

### Requirement: Control-panel chrome is available in all seven supported interface languages

The control panel's message catalog (0053) SHALL have populated content for every language in the
platform's supported-language contract (English, Spanish, French, Portuguese, Italian, German,
Russian), not just English and Spanish, so the language switcher changes chrome for any selection
rather than silently falling back to English for five of its seven options.

#### Scenario: Every supported language renders its own chrome, not an English fallback

- **WHEN** an operator selects French, Portuguese, Italian, German, or Russian from the control-panel
  language switcher
- **THEN** labels, buttons, and messages render in the selected language rather than falling back to
  English

#### Scenario: Every catalog carries the same key set as the English source

- **WHEN** the control panel's message catalogs are inspected
- **THEN** each of the six non-English catalogs (Spanish, French, Portuguese, Italian, German, Russian)
  has exactly the same set of message IDs as `messages.en.ts`, with no empty translation values

