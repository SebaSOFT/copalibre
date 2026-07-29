## 1. URL-builder package

- [ ] 1.1 Implement `packages/routing` input type `{ organizationAlias, tournamentAlias, stageNumber?, roundNumber?, matchNumber?, participantAlias?, viewMode?, locale? }`
- [ ] 1.2 Implement public-path builder (`/`, `/{organization}`, `/{organization}/tournaments/{tournament}`, `.../stages/{stage}`, `.../matches/{match}`, `.../participants/{participant}`)
- [ ] 1.3 Implement `/control/**`, `/tv/**`, `/events/public/**` derivation by prefix substitution from the same input
- [ ] 1.4 Implement input validation rejecting UUIDs/raw IDs in place of aliases or scoped numbers
- [ ] 1.5 Implement locale-prefix handling (primary locale omits prefix)

## 2. Alias resolution and redirects (persistence-dependent)

- [ ] 2.1 Define the organization/tournament alias index lookup used by page handlers (depends on `0004-persistence-postgres-outbox-audit`)
- [ ] 2.2 Define the organization-scoped alias-redirect table schema (`organization_id`, `old_alias`, `new_alias`)
- [ ] 2.3 Implement server-side alias resolution: unknown alias → 404, redirected alias → 301 to canonical path

## 3. Public page implementation

- [ ] 3.1 Build `PublicLayout.astro` (nav, footer, Pico CSS baseline)
- [ ] 3.2 Build `/{organization}/tournaments/{tournament}/index.astro` (B1 overview page)
- [ ] 3.3 Port `TournamentHero`, `ScoreTicker`, `StandingsPreview`, `BroadcastStatusPanel`, `RulesetBriefing` components from `../copalibre-design-system-fixed/b1-tournament-public-overview/code.html` onto `packages/design-tokens` tokens (no Tailwind-CDN dependency)
- [ ] 3.4 Confirm all core content renders server-side with no client JS required

## 4. Sitemap and indexing controls

- [ ] 4.1 Implement `sitemap.xml` generation restricted to public canonical routes
- [ ] 4.2 Implement `robots.txt` disallowing `/control/**` and `/tv/**`
- [ ] 4.3 Add `noindex` meta/header to any accidental non-public route rendering (defense in depth)

## 5. Unit tests

- [ ] 5.1 `packages/routing` builder unit tests: canonical path generation for every surface prefix
- [ ] 5.2 `packages/routing` unit tests: rejection of UUID/raw-ID input
- [ ] 5.3 `packages/routing` unit tests: query-parameter-only view state (mode, locale, filters never in path)
- [ ] 5.4 Alias-redirect resolution unit tests, including the cross-organization non-leak scenario

## 6. Integration tests

- [ ] 6.1 Integration test: requesting a published tournament's overview returns 200 with expected data
- [ ] 6.2 Integration test: requesting an unpublished tournament's overview returns not-found with no operational data
- [ ] 6.3 Integration test: renamed-alias request returns 301 to the new canonical path, scoped per organization

## 7. E2E tests (Playwright)

- [ ] 7.1 E2E: navigate public site from home → organization → tournament overview
- [ ] 7.2 E2E: tournament overview page passes a no-JS content check (disable JS, assert core content present)
- [ ] 7.3 E2E: fetch `sitemap.xml` and assert no `/control/` or `/tv/` entries
- [ ] 7.4 E2E: fetch `robots.txt` and assert `Disallow: /control/` and `Disallow: /tv/`

## 8. CI wiring

- [ ] 8.1 Add a `unit-tests` step (or extend the existing job) in `.github/workflows/ci.yml` running `packages/routing` and public-page unit tests
- [ ] 8.2 Add an `e2e-tests` job in `.github/workflows/ci.yml` running the Playwright suite from section 7 against a built `apps/web` preview server
