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

### Requirement: Authorization Code with PKCE completes to a working session

The control application's `/control/callback` route SHALL exchange the identity provider's returned
authorization code for an access token directly with the provider's token endpoint (no client secret —
PKCE is the public-client substitute), verify the callback's `state` against the value stored when the
flow began, and write the resulting token into the in-memory session store used by every authenticated
request — so completing the identity provider's login screen results in a usable, authenticated control
panel, not a dead end.

#### Scenario: A successful callback establishes a working session

- **WHEN** the identity provider redirects back to `/control/callback` with a valid authorization code
  and the `state` matching what the login attempt stored
- **THEN** the control application holds a valid access token in memory and subsequent API requests
  carry it as a Bearer header

#### Scenario: A mismatched or missing state is refused

- **WHEN** `/control/callback` receives a `state` value that does not match the one stored when the
  login attempt began, or no transaction was stored at all
- **THEN** the callback refuses to exchange the code, no token is stored, and the operator sees an
  error rather than a silently broken session

#### Scenario: An identity-provider error is shown, not swallowed

- **WHEN** the identity provider redirects back with an `error` parameter instead of a `code`
- **THEN** the control application shows the operator that authorization failed rather than attempting
  a token exchange or silently doing nothing

### Requirement: Every authenticated request carries the session's access token

Every control-panel screen's API client SHALL be constructed with the shared session store's token
reader, so every authenticated request automatically carries the current access token — an operator's
API calls SHALL NOT be able to reach the backend with no `Authorization` header while a session exists.

#### Scenario: A request made after login carries the Bearer header

- **WHEN** an operator with a valid session performs an action that calls the control API (any screen)
- **THEN** the request carries `Authorization: Bearer <token>` with the session's current access token

### Requirement: An unauthenticated visit to a protected screen redirects to login

Visiting a control-panel screen with no valid access token in the session store SHALL redirect to the
login page rather than rendering the screen and making unauthenticated requests; the login page SHALL
return the operator to their original destination after a successful callback.

#### Scenario: A protected screen redirects when no session exists

- **WHEN** an operator with no stored access token navigates directly to a control-panel screen
- **THEN** they are redirected to the login page instead of seeing the screen attempt to load with no
  credentials

#### Scenario: Login returns the operator to where they were headed

- **WHEN** an operator is redirected to login from a specific screen and completes authentication
  successfully
- **THEN** they land on the screen they originally requested, not a generic default

### Requirement: Owned component layer, not Chakra UI
The control application SHALL use the owned shadcn/ui-style component source and Radix Primitives for
its interactive UI, and SHALL NOT include Chakra UI as a production dependency. This owned layer SHALL
span all five Atomic Design tiers — atoms, molecules, organisms, templates under
`apps/web/src/control/components/ui/`, and the page/route components that consume them — not only
badge/button/card; any Control-web screen, present at the time this requirement changes or added at any
later point, SHALL compose its form controls, tabular listings, cards, modals, and operation feedback
from this owned layer rather than defining a new one-off inline style object for a pattern the layer
already covers. The organization dashboard (`Dashboard.tsx`) SHALL compose inside `ControlShell.tsx`
(or inherit its `.cl-control__nav` navigation chrome), guaranteeing consistent typography, active states,
and no unstyled browser default hyperlinks.

#### Scenario: No Chakra dependency in production build
- **WHEN** the control application's production dependency list is inspected
- **THEN** it contains no Chakra UI package

#### Scenario: A screen's form controls and tabular data come from the owned layer
- **WHEN** any Control-web screen under `apps/web/src/control/components/` is inspected, regardless of
  when it was added
- **THEN** its labeled inputs, selects, tabular listings, cards, and modals are composed from the owned
  component layer's atoms/molecules/organisms/templates, not a screen-local inline style object
  duplicating one of them

#### Scenario: New route debuts after this change
- **WHEN** a developer adds a new Control-web route
- **THEN** the route composes from the owned atomic design layer and reuses an existing template when
  its shape matches an existing template family

#### Scenario: Dashboard navigation renders styled chrome
- **WHEN** an administrator views the organization dashboard
- **THEN** the sidebar navigation displays styled uppercase labels with active state highlights and no raw blue unstyled browser links.

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
client-side language-preference order: an explicit stored preference, then a supported browser
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

### Requirement: Control-panel chrome is available in all eight supported interface languages

The control panel's message catalog SHALL have populated content for every language in the
platform's supported-language contract (English, Spanish, French, Portuguese, Italian, German,
Russian, Mandarin Chinese), not just English and Spanish, so the language switcher changes chrome for
any selection rather than silently falling back to English for any of its non-English options.

#### Scenario: Every supported language renders its own chrome, not an English fallback

- **WHEN** an operator selects French, Portuguese, Italian, German, Russian, or Mandarin Chinese from
  the control-panel language switcher
- **THEN** labels, buttons, and messages render in the selected language rather than falling back to
  English

#### Scenario: Every catalog carries the same key set as the English source

- **WHEN** the control panel's message catalogs are inspected
- **THEN** each of the seven non-English catalogs (Spanish, French, Portuguese, Italian, German,
  Russian, Mandarin Chinese) has exactly the same set of message IDs as `messages.en.ts`, with no empty
  translation values

### Requirement: Control-panel navigation never reloads the page

Navigating between control-panel screens within the same organization session SHALL update the browser
URL and render the destination screen without a full page reload — every internal control-panel link
SHALL use client-side navigation, not a plain browser-navigated anchor.

#### Scenario: Following an internal link does not reload the page

- **WHEN** an operator activates a link to another control-panel screen (for example, from the
  dashboard's sidenav to the roles screen)
- **THEN** the destination screen renders and the URL updates, with no full page reload

#### Scenario: The browser's back and forward buttons work

- **WHEN** an operator navigates between two control-panel screens and then uses the browser's back
  button
- **THEN** the previous screen renders at its own URL, without a full page reload

#### Scenario: A direct visit or hard refresh still renders the right screen

- **WHEN** an operator loads a control-panel URL directly (typed, bookmarked, or via a hard refresh)
- **THEN** the screen matching that URL renders correctly, exactly as it would after client-side
  navigation to the same URL

### Requirement: A default post-login landing resolves to a useful destination

When `/control/callback` completes with no specific destination requested (a bare or bookmarked visit
to `/control/`, distinct from a guard-redirected login from a protected screen, which already carries a
real destination), the control application SHALL look up the operator's organization memberships and
land them on a useful destination rather than an unreachable default path.

#### Scenario: Exactly one organization sends the operator straight to its dashboard

- **WHEN** a default-landing login completes for an operator who holds a role in exactly one
  organization
- **THEN** the control application navigates to that organization's dashboard with no further
  interaction required

#### Scenario: Multiple organizations show a picker

- **WHEN** a default-landing login completes for an operator who holds a role in more than one
  organization
- **THEN** the control application shows each organization (alias, name, and role) as a link to its
  dashboard, and does not enter any organization automatically

#### Scenario: No organizations show an explanatory empty state

- **WHEN** a default-landing login completes for an operator who holds no organization role
- **THEN** the control application shows that the account has no organizations yet, rather than a
  "screen not found" error

#### Scenario: A guard-redirected login is unaffected

- **WHEN** an operator is redirected to login from a specific protected screen and completes
  authentication successfully
- **THEN** they land on that original screen directly, with no organization-membership lookup performed

### Requirement: Control web renders dynamic table layouts and rankings

The control web shell and tournament screens SHALL render declared table layouts (group standings, player rankings, goalkeeper leaderboards, and schedule summaries) dynamically from the table projection API rather than static column definitions.

#### Scenario: Standings page renders columns from the declared layout
- **WHEN** an operator views a stage standings page for a football tournament
- **THEN** the rendered table columns (`PJ, PG, PE, PP, GF, GC, Dif, Pts`) match the effective table layout configuration for that stage

#### Scenario: Operator toggles between declared tournament ranking views
- **WHEN** an operator navigates between Top Scorers and Goalkeeper rankings
- **THEN** each view renders its corresponding declared columns, formatted fractions, and multi-column sort rankings

### Requirement: Extended tier ownership
- The five-tier ownership rule SHALL apply to every Control-web screen, including list, form, and detail surfaces, not only the initially migrated admin screens.

#### Scenario: Legacy list screen is modernized
- **WHEN** a legacy hand-rolled list screen is refactored
- **THEN** the screen uses `ListScreenTemplate` and `DataTable` instead of bespoke grid markup.

### Requirement: The static control-panel shell is locale-neutral before hydration
The static HTML shell that serves every `/control/**` route before `ControlApp` hydrates (`control/[...path].astro`
and `control/app.astro`) SHALL declare a locale-neutral `lang` attribute and locale-neutral `<noscript>`
fallback copy, since the shell is served identically regardless of which of the eight supported interface
languages the authenticated operator will use once the React chrome hydrates and resolves their real
preference.

#### Scenario: The shell does not hardcode a specific non-English language
- **WHEN** the static control-panel shell is served, before `ControlApp` hydrates
- **THEN** its `<html lang>` attribute is the platform's neutral default (English), not hardcoded to any
  other specific language

#### Scenario: The noscript fallback is not hardcoded to one language
- **WHEN** JavaScript is disabled and the control-panel shell's `<noscript>` fallback renders
- **THEN** its text is in the platform's neutral default language, not hardcoded to any other specific
  language

### Requirement: Primary sidebar navigation reachability
Every section listed in the control panel's primary sidebar navigation SHALL resolve to a working page
for an authorized user, both via the nav item itself and via its direct URL.

#### Scenario: Opening every sidebar section
- **WHEN** an authenticated org-admin clicks each of the primary sidebar sections (Dashboard, Clubs,
  Tournaments, Live Console, Organization, Analytics, Roles, Venues & Officials)
- **THEN** each SHALL render its real page content, never a not-found screen

#### Scenario: Requesting a sidebar section's URL directly
- **WHEN** an authenticated org-admin requests any primary sidebar section's URL directly (not via
  client-side navigation)
- **THEN** the same real page content SHALL render

### Requirement: Post-authentication landing destination
An authenticated user reaching the control panel root with no specific prior destination SHALL land on
a real, navigable page.

#### Scenario: Logging in with no prior destination
- **WHEN** a user authenticates from the login page directly (not redirected there from a specific
  protected URL)
- **THEN** they SHALL land on their organization's dashboard (or an organization picker, if they belong
  to more than one), never a not-found screen with no navigation

### Requirement: Mobile sidebar navigation
The primary sidebar navigation SHALL remain fully reachable at mobile viewport widths.

#### Scenario: Navigating at a phone viewport width
- **WHEN** the control panel is viewed at a mobile viewport width (≤430px)
- **THEN** every primary sidebar section SHALL remain reachable through a collapse pattern (such as a
  hamburger menu or drawer), and no section SHALL be clipped off-screen with no way to reach it
