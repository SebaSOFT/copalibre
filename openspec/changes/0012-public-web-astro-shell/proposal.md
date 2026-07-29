## Why

CopaLibre's spectator-facing surface must ship as a fast, cacheable, mostly-static site before any
authenticated control surface exists — that is the whole reason the architecture picked Astro SSG
with a Pico CSS baseline for public routes over a client-rendered SPA
(`../chaos-vault/20-knowledge-domains/copalibre-platform-architecture.md`, "Public web": "Pico CSS is
the initial public CSS baseline because it is dependency-free, semantic, class-light, and has no
JavaScript runtime... Do not wrap the entire public document in Chakra UI"). The same document's "URL
and routing contract" section requires every surface (public, `/control/**`, `/tv/**`, public SSE) to
derive its path from one shared alias/number contract, so that contract (`packages/routing`) must
exist before any public page is built, not be retrofitted after routes are hardcoded. TMS-007
("Public live competition surfaces") in
`../chaos-vault/50-research/copalibre-market-segment-feature-specification.md` is the feature this
phase begins delivering, starting with the tournament overview page (B1 in the already-built design
mockups at `../copalibre-design-system-fixed/b1-tournament-public-overview/`).

## What Changes

- Implement `packages/routing`: a pure-function, framework-agnostic URL-builder module accepting
  `{ organizationAlias, tournamentAlias, stageNumber?, roundNumber?, matchNumber?, participantAlias?,
  viewMode?, locale? }` and producing canonical paths for every surface prefix
  (`/`, `/control/**`, `/tv/**`, `/events/public/**`) by prefix substitution only — never accepting a
  database ID, per the architecture doc's routing contract rule 7.
- Implement organization-scoped public routes in `apps/web`: `/{organization}`,
  `/{organization}/tournaments/{tournament}`, and their `stages/{stage}`, `matches/{match}`,
  `participants/{participant}` children — `{stage}/{round}/{match}` are scoped sequential numbers,
  never UUIDs, per routing-contract rule 4.
- Build the **B1 Tournament Public Overview** screen: public nav (Overview/Stages/Matches/Teams/
  Stats tabs), auto-scrolling CSS-keyframe score ticker, hero with countdown to registration close,
  bento layout (Tournament Intel facts + standings preview table + flat "Broadcast Status Panel" +
  "Ruleset Briefing" card with rules-PDF download) — sourced from
  `../copalibre-design-system-fixed/b1-tournament-public-overview/code.html`, restyled onto
  `packages/design-tokens` (depends on phase `0011-design-tokens-broadcast-command-precision`) instead of
  the mockup's Tailwind-CDN scaffolding.
- Implement alias-rename handling: changing an organization or tournament alias preserves the old
  scoped path as a 301 redirect to the new canonical path (routing-contract rule 8), scoped so one
  organization's old alias can never resolve into another organization's route.
- Generate `sitemap.xml` from public canonical routes only; add `robots.txt` disallowing
  `/control/**` and `/tv/**`, plus `noindex` as the doc's required second layer of defense
  (routing-contract rule 9).
- Add locale-prefix routing on public routes (`/{locale}/{organization}/...`), primary locale may
  omit the prefix (routing-contract rule 10).
- Confirm the public shell renders and is navigable with JavaScript disabled (architecture doc
  acceptance criterion: "public pages remain useful without JavaScript and receive live enhancement
  when JavaScript is available").

## Capabilities

### New Capabilities
- `public-web-shell`: the public Astro site serves organization/tournament overview pages at
  canonical, alias-based, organization-scoped URLs, generates a sitemap restricted to public routes,
  redirects renamed aliases, supports locale-prefixed paths, and remains navigable without
  JavaScript.
- `url-routing-contract`: `packages/routing` is the single source of truth for deriving any
  surface's URL for a given resource from its alias/number tuple, consumed by every surface that
  will exist by the end of the roadmap (public, control, tv, SSE, webhook payloads, emails).

### Modified Capabilities
(none)

## Impact

- **New files/dirs**: `packages/routing/src/` (builder + types), `apps/web/src/pages/[organization]/
  index.astro`, `apps/web/src/pages/[organization]/tournaments/[tournament]/index.astro`,
  `apps/web/src/layouts/PublicLayout.astro`, `apps/web/src/components/public/*`
  (TournamentHero, ScoreTicker, StandingsPreview, BroadcastStatusPanel, RulesetBriefing),
  `apps/web/src/pages/sitemap.xml.ts`, `apps/web/public/robots.txt`.
- **Depends on**: `0001-bootstrap-monorepo-toolchain` (apps/web skeleton), `0005-api-auth-jwt-openapi-contract`
  (public read endpoints these pages fetch at build/request time),
  `0011-design-tokens-broadcast-command-precision` (styling), `0004-persistence-postgres-outbox-audit`
  (alias-redirect storage table).
- **No control-plane or authenticated behavior** — this phase is read-only and anonymous by
  construction; RBAC and mutation endpoints belong to later phases (14+).
