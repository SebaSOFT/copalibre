## 1. Domain

- [ ] 1.1 No new value object. `Entrant`'s abbreviation is validated with the existing
      `Abbreviation.create` (`packages/domain/src/identifiers/abbreviation.ts`) — confirm at
      implementation time that nothing about that class assumes a `Team`/`Club` context that wouldn't
      also make sense for an `Entrant` (expected: nothing does, since it validates a string only).
- [ ] 1.2 `packages/domain/src/aggregates/participant.ts`: `Entrant` gains `readonly abbreviation?:
      string`.
- [ ] 1.3 `packages/domain/src/aggregates/short-labels.ts`: `STOP_WORDS` — English, Spanish, Portuguese,
      French, Italian, and German short function words, **no single-character entries** (protects a
      meaningful trailing letter like "San Francisco A"/"San Francisco B" from being stripped as if it
      were an article):
      `['and','au','aux','da','das','de','degli','dei','del','della','delle','dem','den','der','des',
      'di','die','do','dos','du','ein','eine','el','em','en','et','for','gli','il','im','in','la',
      'las','le','les','lo','los','of','on','the','um','uma','un','una','une','uno','und','von','zu']`;
      `deriveEntrantAbbreviation(displayName: string, teamAbbreviation?: string, clubAbbreviation?:
      string): string | undefined` — the team's abbreviation if present, else the club's, else initials
      of `displayName`'s words with `STOP_WORDS` filtered, truncated to 10; `undefined` when no
      candidate is derivable at all (e.g. a name with no foldable characters, mirroring `suggestAlias`'s
      own "produces nothing rather than something empty" precedent).
- [ ] 1.4 Unit tests: `deriveEntrantAbbreviation` cases for each priority branch, truncation, and the
      no-candidate case; a stop-word case per covered language (e.g. `"Casa de Italia"`→drops `de`,
      `"Real do Porto"`→drops `do`, `"Les Bleus"`→drops `les`, `"Città di Torino"`→drops `di`,
      `"Bayern von München"`→drops `von`); a case confirming `"San Francisco A"` and `"San Francisco B"`
      derive distinct candidates (`A`/`B` preserved, not filtered as if they were articles).

## 2. Persistence

- [ ] 2.1 Migration: `ALTER TABLE entrants ADD COLUMN abbreviation text NULL`; partial unique index on
      `(tournament_id, abbreviation) WHERE abbreviation IS NOT NULL`.
- [ ] 2.2 `packages/persistence/src/schema.ts`: `EntrantsTable` gains `abbreviation: string | null`.
- [ ] 2.3 `packages/persistence/src/mapping.ts`: `toEntrant` carries `abbreviation`.
- [ ] 2.4 `packages/persistence/src/repositories/enrollment-repository.ts`: `registerEntrant` —
      1. if `input.abbreviation` is supplied, store it unchanged only when `Abbreviation.create` accepts
         it and it is free in this tournament;
      2. otherwise (input absent, empty, malformed, or taken), resolve the team's or club's own
         abbreviation and the entrant's display name (a person's `displayName` or the team's `name` per
         `entrantRef.kind`), call `deriveEntrantAbbreviation`, and if a candidate exists, check it
         against every other entrant's `abbreviation` already set in the same `tournament_id`; store it
         if free, leave `abbreviation` unset if taken or undeliverable.
- [ ] 2.5 New method `setEntrantAbbreviation(uow, { entrantId, abbreviation, organizationId, actor,
      authorizationContext })`: validates format, checks tournament-scoped uniqueness (excluding the
      entrant's own current row), writes at every tournament lifecycle point, audits
      (`entrant.abbreviation-set` action, previous/resulting state).
- [ ] 2.6 New read `listEntrantsNeedingAbbreviation(tournamentId)`: entrants in the tournament with
      `abbreviation IS NULL` — the "needs an abbreviation" list an officer works from.
- [ ] 2.7 Integration tests: registering two entrants whose derived candidates collide leaves the
      second unresolved and the first resolved; a valid, unique explicitly-supplied abbreviation is
      stored as given even when a derived candidate would have been different; malformed or
      tournament-colliding supplied input falls back to derivation; `setEntrantAbbreviation` rejects a
      value already taken by another entrant in the same tournament and accepts one taken in a *different*
      tournament; re-registering derivation never overwrites an entrant that already has one (there is no
      code path that would, but assert it as a regression guard).

## 3. API

- [ ] 3.1 `apps/api/src/dto/` and `packages/domain/src/import-export/csv-import.ts` — entrant
      registration input and individual/team CSV rows gain an optional `abbreviation` field; worker
      preview validation permits it; response DTOs carrying `abbreviation` continue to, sourced as
      described in section 4.
- [ ] 3.2 New route: `PATCH .../entrants/:entrantId/abbreviation` (mirrors the existing entrant/
      registration route's auth shape — `RequireOrganizationRole('admin')`), calling
      `setEntrantAbbreviation`; `409`/`400` on collision or format error with a message an officer can
      act on.
- [ ] 3.3 New route: `GET .../tournaments/:tournamentAlias/entrants/needing-abbreviation`, calling
      `listEntrantsNeedingAbbreviation`.
- [ ] 3.4 Regenerate `packages/contracts/openapi/v1.json` and `src/generated/v1.ts`.
- [ ] 3.5 Integration tests for both new routes, plus CSV import of valid, malformed, and
      tournament-colliding optional abbreviation values through registration fallback.

## 4. Display priority — entrant abbreviation wins in tournament scope

- [ ] 4.1 `apps/api/src/controllers/public-projections.controller.ts`: the `names`/`standingsNames`
      resolution map's `abbreviation` value becomes `entrant.abbreviation ?? abbreviationOf(team,
      club)` (confirmed via repo-wide grep: this file is the only current populator of
      `abbreviation`/`homeAbbreviation`/`awayAbbreviation` response fields — re-grep at implementation
      time in case that's changed).
- [ ] 4.2 Integration test: a bracket/standings/overview response for an entrant with its own resolved
      abbreviation shows that value, not the team's, when they differ.

## 5. Web — a shared, size-aware name component

- [ ] 5.1 New shared component (e.g. `EntrantName`) taking the full name and the resolved abbreviation:
      renders the full name when its allotted space fits it, the abbreviation (wrapped in
      `<abbr title="{full name}">…</abbr>`) when it doesn't. Use `ResizeObserver` for the
      aesthetic/responsive switch; do not truncate, remove diacritics, or derive any display text.
- [ ] 5.2 `apps/web/src/control/components/StandingsPage.tsx` (name/abbreviation cell rendering),
      bracket components, `JerseyGrid.tsx`'s team header, and any public-overview rendering: switched to
      the shared component rather than rendering the name or abbreviation directly.
- [ ] 5.3 Component/unit tests: mock `ResizeObserver` to verify full name at generous width and the
      unchanged abbreviation with a correct `title` attribute at constrained width, at each of the above
      render sites; assert that no truncated or transformed text is rendered.

## 6. Wiring and CI

- [ ] 6.1 Confirm new `*.test.ts`/`*.integration.test.ts` files are picked up by existing Jest glob
      configuration; no explicit registration expected.
- [ ] 6.2 No `.github/workflows/ci.yml` change expected — new test files under existing steps' glob
      only; confirm with `yarn test:verify-discovery` before merging.
- [ ] 6.3 e2e: one Playwright case confirming an entrant's abbreviation renders with a working tooltip
      on at least one real page (standings or bracket), per this repo's "e2e where the capability
      touches a user-facing surface" convention.

## 7. Explicitly deferred (tracked here, not built in this proposal)

- [ ] 7.1 (Follow-up) A maintenance/backfill task to derive abbreviations for entrants registered
      before this change ships.
- [ ] 7.2 (Follow-up) A dedicated "entrants needing an abbreviation" UI screen — this proposal ships the
      API list only.
- [ ] 7.3 (Follow-up) Any second-guess widening strategy for a collided derivation — explicitly not
      wanted per design.md; noted here only so it isn't proposed again without re-litigating that.
