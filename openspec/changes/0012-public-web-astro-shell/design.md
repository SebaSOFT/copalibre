## Context

`apps/web`'s public shell exists only as an empty Astro placeholder from
`0001-bootstrap-monorepo-toolchain`. The full routing contract (organization-scoped canonical paths,
alias-not-UUID rule, prefix-substitution derivation) is already fully specified in
`../chaos-vault/20-knowledge-domains/copalibre-platform-architecture.md`, "URL and routing contract"
— this design implements that contract, it does not redesign it. B1's visual layout is already built
as a static mockup in `../copalibre-design-system-fixed/b1-tournament-public-overview/code.html`;
this phase restyles it onto real tokens and wires it to real (eventually API-backed) data instead of
inventing new layout.

## Goals / Non-Goals

**Goals:**
- `packages/routing` is the only place any surface computes a CopaLibre URL.
- The public overview page is real, server-rendered, and correct without JavaScript.
- Sitemap/robots/noindex correctly separate public from non-public surfaces from day one.

**Non-Goals:**
- No authenticated behavior, no control-plane mutation — read-only public surface only.
- No live SSE wiring yet for this specific page (the ticker/standings-preview live-refresh lands
  functionally once phase `0010-realtime-sse-contract` and phase `0013-public-live-and-bracket-surfaces` exist;
  this phase ships the static/server-rendered baseline first, per the "public pages... receive live
  enhancement when JavaScript is available" acceptance criterion — enhancement, not requirement).
- No B2/B3 screens — those are `0013-public-live-and-bracket-surfaces` (phase 13).

## Decisions

**`packages/routing` is framework-agnostic and has zero Astro/React imports.** It must be importable
identically from Astro pages, the future React control app, and backend-generated links (webhook
payloads, notification emails), per architecture-doc routing-contract rule 7. Alternative considered:
an Astro-only route-helper — rejected because it can't be reused by `apps/control-web` or
`apps/worker`-generated email links.

**Aliases resolve to internal IDs server-side, not client-side.** The page handler looks up
`organizationAlias`/`tournamentAlias` against the alias index (owned by
`0004-persistence-postgres-outbox-audit`) and 404s or redirects before rendering; the browser never sees a
database identifier. This is what makes routing-contract rule 5 ("stable database identifiers never
appear in a URL") enforceable rather than just a convention.

**Redirect storage is organization-scoped, not global.** A redirect table keyed by
`(organization_id, old_tournament_alias) -> new_tournament_alias` prevents the cross-organization
alias-collision leak described in routing-contract rule 8 and the corresponding spec scenario above.
Alternative considered: a global alias-history table — rejected, it would let organization B's reuse
of a freed alias inherit organization A's redirect history.

**Astro `getStaticPaths`/on-demand rendering choice deferred to implementation**, since the
architecture doc specifies Astro SSG generally but tournament data changes after publish (new
matches, updated standings). Use Astro's hybrid output: statically pre-render the page shell at build
time where possible, but treat this as a task-level implementation detail, not a spec-level
behavior — public-facing behavior (page renders correctly, without JS) is what's specified, not the
rendering strategy that produces it.

## Risks / Trade-offs

- [Risk] Pico CSS's minimal default styling may not carry the "Broadcast Command Precision" identity
  strongly enough on its own. → Mitigation: `packages/design-tokens` (its own phase) supplies custom
  SebaSOFT CSS layered over Pico specifically for "complex domain views such as brackets, standings,
  timelines, scoreboards, match cards" per the architecture doc — Pico is the baseline, not the whole
  system.
- [Risk] Sitemap/robots correctness is easy to silently regress as more routes are added in later
  phases. → Mitigation: the CI task in this phase's `tasks.md` asserts sitemap contents by pattern,
  not just that the file exists, so a future phase accidentally adding `/control/**` to it fails CI.
- [Risk] Redirect-table growth is unbounded if aliases are renamed frequently. → Mitigation: out of
  scope for this phase's spec (no volume requirement stated in chaos-vault); flagged here for the
  eventual `0021-deployment-docker-compose-cli` backup/retention design to consider.

## Open Questions

- Exact Astro rendering mode (fully static vs. on-demand per organization) is left to
  implementation, per the Decisions section above — does not change the spec-level behavior and can
  be revisited without touching `public-web-shell`'s requirements.
