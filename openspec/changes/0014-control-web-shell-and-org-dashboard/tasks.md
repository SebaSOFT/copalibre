## 1. Control application scaffold

- [ ] 1.1 Mount the React control application at `/control/**` inside `apps/web`
- [ ] 1.2 Configure Tailwind CSS and CSS variables consuming `packages/design-tokens`
- [ ] 1.3 Set up React Router (or Astro-driven routing) for `/control/{organization}` and nested routes

## 2. Owned component layer

- [ ] 2.1 Copy in the initial shadcn/ui-style primitives needed for A1 (button, card, badge, avatar, dropdown, tooltip)
- [ ] 2.2 Wire Radix Primitives for accessible interaction behavior on each copied component
- [ ] 2.3 Add each copied component's entry to `THIRD_PARTY_NOTICES.md` with source version and preserved MIT notice
- [ ] 2.4 Confirm no Chakra UI package is present in `package.json` dependencies

## 3. Session and auth

- [ ] 3.1 Implement in-memory JWT access-token store (no `localStorage`/`sessionStorage`/cookie persistence)
- [ ] 3.2 Implement Authorization Code + PKCE browser flow against a mock/stub authorization server for this phase
- [ ] 3.3 Implement the strict-stateless vs. pragmatic-persistent mode abstraction behind one `useAuth()` interface
- [ ] 3.4 Implement re-authentication redirect on reload when no persistent refresh credential exists

## 4. API and SSE clients

- [ ] 4.1 Generate the API client from `packages/contracts`' OpenAPI artifact
- [ ] 4.2 Implement the authenticated Fetch-based SSE client, consuming `0010-realtime-sse-contract`'s shared reconnect/backoff library
- [ ] 4.3 Confirm the Authorization header (not a URL query param) carries the token on both API and SSE requests

## 5. A1 Organization Dashboard

- [ ] 5.1 Build sidenav (Dashboard/Live Console/Tournaments/Organization/Analytics)
- [ ] 5.2 Build top bar (region switcher, notifications/settings/help icons, avatar)
- [ ] 5.3 Build quick-stats tiles (Active Tournaments, Pending Registrations, Matches Today)
- [ ] 5.4 Build tournament card grid with LIVE/UPCOMING/DRAFT visual states and colored accent bars
- [ ] 5.5 Build monospace Recent Activity event log sourced from the audit log API
- [ ] 5.6 Enforce organization-membership scoping on all dashboard data fetches

## 6. Unit tests

- [ ] 6.1 React Testing Library tests: session module never writes the token to persistent storage
- [ ] 6.2 React Testing Library tests: tournament card renders correct visual state per lifecycle status
- [ ] 6.3 React Testing Library tests: quick-stats tiles render correct counts from mocked API data

## 7. Integration tests

- [ ] 7.1 Integration test: dashboard API call scoped to organization A returns no organization B data
- [ ] 7.2 Integration test: approving a registration produces a corresponding recent-activity entry

## 8. E2E tests (Playwright)

- [ ] 8.1 E2E: full PKCE login flow against the mock authorization server, landing on the dashboard
- [ ] 8.2 E2E: reload with no persistent refresh credential returns the user to the auth flow
- [ ] 8.3 E2E: dashboard renders tournament cards and recent-activity feed for a seeded organization

## 9. CI wiring

- [ ] 9.1 Add this phase's unit tests to the existing `unit-tests` job in `.github/workflows/ci.yml`
- [ ] 9.2 Add this phase's Playwright specs to the existing `e2e-tests` job in `.github/workflows/ci.yml`
- [ ] 9.3 Add a CI check that fails if a copied `components/ui/` file has no matching `THIRD_PARTY_NOTICES.md` entry
