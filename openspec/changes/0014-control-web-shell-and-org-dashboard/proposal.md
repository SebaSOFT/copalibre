## Why

Every operator-facing screen (A2–A7, phases 15–18) needs a shared authenticated shell before any of
them can be built: a component vocabulary, a JWT session model, an API client, and an SSE client.
`../chaos-vault/20-knowledge-domains/copalibre-platform-architecture.md`, "Control web" section,
already picked the stack — "React + shadcn/ui-style owned component source + Radix Primitives +
Tailwind CSS... This replaces Chakra UI 3; do not run Chakra and shadcn/Radix in the same control
surface" — and its "License and AGPL policy" subsection requires an explicit MIT-notice inventory
because CopaLibre is AGPL-licensed while shadcn/ui and Radix are MIT. This phase stands up that shell
and ships the first real screen, **A1 Organization Dashboard**
(`../copalibre-design-system-fixed/a1-organization-dashboard/code.html`), so every later control-web
phase adds screens inside an already-working shell instead of re-deriving auth/layout/API-client
wiring each time.

## What Changes

- Scaffold the `/control/**` React application inside `apps/web` (per the architecture doc's
  "Consolidated web, help, and API reference" section: one Astro app, React only for `/control/**`
  and exceptional public islands).
- Implement the owned shadcn/ui-style component layer (copied-and-owned source, not an npm
  dependency) + Radix Primitives + Tailwind CSS/CSS variables, explicitly not Chakra UI.
- Implement JWT session handling: access token held in memory only, never `localStorage`; Authorization
  Code + PKCE browser flow against a self-hostable/customer-selected OIDC provider (provider itself
  is an explicit open gate per the architecture doc — this phase implements the PKCE-compatible
  client contract, not a specific provider integration).
- Implement the generated API client (from `packages/contracts`, produced by
  `0005-api-auth-jwt-openapi-contract`'s OpenAPI artifact) and an authenticated Fetch-based SSE client
  consuming `0010-realtime-sse-contract`'s shared reconnect/backoff library.
- Start and maintain `THIRD_PARTY_NOTICES.md`: every copied shadcn/ui component file and direct Radix
  dependency gets an inventory entry with its MIT notice preserved, per the architecture doc's
  license-policy operational requirements.
- Build **A1 Organization Dashboard**: fixed left sidenav (Dashboard/Live Console/Tournaments/
  Organization/Analytics), top bar with region switcher and notifications/settings/help icons,
  quick-stats tiles (Active Tournaments, Pending Registrations, Matches Today), tournament card grid
  with LIVE/UPCOMING/DRAFT states (colored left accent bar per state, matching `copalibre-system.css`
  conventions), and a monospace Recent Activity event log — sourced from
  `a1-organization-dashboard/code.html`.

## Capabilities

### New Capabilities
- `control-web-shell`: `/control/**` provides an authenticated React shell (owned shadcn/ui-style +
  Radix + Tailwind components, in-memory JWT session, generated API client, authenticated SSE
  client) with a maintained MIT-notice inventory for its AGPL-combined codebase.
- `organization-dashboard`: authenticated organizers see an overview of their organization's active,
  upcoming, and draft tournaments plus a recent-activity audit feed.

### Modified Capabilities
(none)

## Impact

- **New files/dirs**: `apps/web/src/control/` (React app root), `apps/web/src/control/components/ui/`
  (owned shadcn-style primitives), `apps/web/src/control/lib/{auth,api-client,sse-client}.ts`,
  `apps/web/src/control/pages/OrganizationDashboard.tsx`, `THIRD_PARTY_NOTICES.md` (populated, was
  seeded empty in `0001-bootstrap-monorepo-toolchain`).
- **Depends on**: `0001-bootstrap-monorepo-toolchain` (workspace/tooling), `0005-api-auth-jwt-openapi-contract`
  (JWT validation contract + generated client types), `0010-realtime-sse-contract` (authenticated SSE
  client library), `0011-design-tokens-broadcast-command-precision` (Tailwind tokens/CSS variables this
  shell consumes).
- **Open gate carried forward, not resolved here**: identity-provider selection remains unselected
  per the architecture doc; this phase implements the PKCE-compatible client contract against
  whichever OIDC provider is later chosen.
