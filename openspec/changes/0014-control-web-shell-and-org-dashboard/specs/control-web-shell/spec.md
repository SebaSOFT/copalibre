## Purpose

Provides the authenticated operator application shell — component vocabulary, session model, API and
SSE clients, and license-compliance bookkeeping — that every control-web screen in later phases is
built inside.

## ADDED Requirements

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
