## Context

See proposal.md - Why / What Changes. Owner-directed (2026-08-19), not chaos-vault-sourced. Confirmed
before designing: `abbreviationOf` (`short-labels.ts`) has zero callers anywhere in tracked source
today (grepped repo-wide) — the DTOs that carry an `abbreviation`/`homeAbbreviation`/`awayAbbreviation`
field (`public-tournament.dto.ts`) are populated directly by
`apps/api/src/controllers/public-projections.controller.ts` from a `names`/`standingsNames` resolution
map, not through the shared helper. This proposal repoints that map's source; it does not need to
introduce `abbreviationOf` as a new dependency anywhere it wasn't already reachable.

## Goals / Non-Goals

**Goals:**
- Every entrant in a tournament has, or can easily get, a short label guaranteed distinct from every
  other entrant in that same tournament.
- Getting one requires no extra step from an officer in the common case (registration "just works").
- A valid, tournament-free officer choice — supplied at registration or set later — is authoritative
  and is never silently recomputed or replaced; an empty, malformed, or colliding registration input
  instead receives the ordinary one-shot derived proposal.
- `Team`/`Club`'s own abbreviation (organizer-chosen, collision-tolerant) is completely unaffected.

**Non-Goals:**
- **Not a smarter collision-resolution algorithm.** When a derived candidate collides, this proposal
  does not try a second, wider guess (e.g. "SL" taken → try "STL" automatically) — it leaves the
  entrant unresolved and surfaces it for an officer, per the owner's explicit direction that
  auto-derivation is a default-fill suggestion only, not a system that keeps guessing on its own.
- **Not changing `Abbreviation`, `labelCollisions`, or `abbreviationOf`.** All three keep their exact
  current behavior and their exact current (lack of) callers where that was already true.
- **Not retroactively resolving abbreviations for entrants registered before this change ships** — see
  Migration Plan. Existing entrants read as unresolved (on the "needs an abbreviation" list) until
  either an officer sets one or a maintenance task backfills them; this proposal does not silently
  invent an abbreviation for data it didn't write.
- **Not building the entrant-level "needs an abbreviation" screen** — the read/list this proposal adds
  is an API-level building block; a UI for it is a small follow-up, or folds into whichever screen
  proposal ends up covering registration review.

**Open gates:** none.

## Decisions

- **`Abbreviation` is reused as-is for format validation — no new value object.** The format question
  ("is this a legal short label") and the behavioral question ("who gets to set it, and what happens on
  collision") are separable, and only the second differs between `Team`/`Club`'s abbreviation and an
  entrant's. `Abbreviation.create` already accepts exactly the shape wanted here (≤10 characters,
  uppercase letters/digits, single interior spaces). Introducing a second type with the identical
  format would be the type answering nothing a boolean parameter couldn't, for the cost of a second
  place `MAX_ABBREVIATION_LENGTH` could drift from.
- **A usable supplied value wins; every unusable registration value receives one ordinary proposal.**
  An explicit registration or CSV-import value is stored unchanged only when `Abbreviation.create`
  accepts it and no other entrant in the tournament uses it. Empty, malformed, or colliding values are
  treated as absent: `deriveEntrantAbbreviation` runs once and its candidate is stored only when free.
  A taken derived candidate leaves the entrant unresolved; the system never broadens either input or
  derived candidates automatically.
- **Derivation priority: team's own abbreviation → club's → initials.** An organizer-chosen
  `Team.abbreviation` is the best available candidate when present — reusing it verbatim (rather than
  deriving something new alongside it) means a team that already has a sensible short label keeps
  seeing it in tournament context too, and since the format is identical there is no reformatting step
  to get it wrong. When neither the team nor the club has one, initials-of-significant-words is the
  last resort.
- **Initials heuristic is intentionally simple and always officer-correctable.** A hardcoded stop-word
  list covering English, Spanish, Portuguese, French, Italian, and German short function words —
  articles, a handful of prepositions, "and"/"y"/"e"/"et"/"und" — is filtered before taking each
  remaining word's first letter, truncated to 10:
  ```
  and, au, aux, da, das, de, degli, dei, del, della, delle, dem, den, der, des, di, die, do, dos, du,
  ein, eine, el, em, en, et, for, gli, il, im, in, la, las, le, les, lo, los, of, on, the, um, uma, un,
  una, une, uno, und, von, zu
  ```
  This will sometimes produce an ugly or non-obvious result for a name the list doesn't anticipate —
  accepted, because the result is never final: a collision (or an officer just not liking it) routes to
  the explicit edit path, which accepts anything that fits the format.
- **Deliberately no single-character stop words** (no bare `a`, `e`, `i`, `o`, `y`, even though each is
  a real function word in at least one covered language). The request's own motivating example —
  "Boca Blue"/"Boca Red", "San Francisco A"/"San Francisco B" — depends on a trailing single letter
  being a *meaningful* disambiguator, not noise to discard; filtering `a` as an article would strip
  exactly the letter that tells those two entrants apart. Restricting the list to two-or-more-character
  words keeps every such suffix intact.
- **Collision check is a straightforward per-tournament uniqueness query**, not a search over
  alternative candidates — consistent with the "suggestion, not automation" direction. A DB-level unique
  index on `(tournament_id, abbreviation)` (nullable column, so unresolved entrants don't collide with
  each other) is the actual enforcement. Registration uses a collision as the trigger for its one derived
  proposal; the explicit set/change path rejects it with a clear conflict rather than a raw constraint
  violation, the same pattern `assertAbbreviation`/`assertEntrantAlias` already use elsewhere in this
  file.
- **"Never recomputed automatically" is enforced by construction, not by a flag.** Nothing in this
  proposal re-derives an abbreviation for an entrant that already has one — `registerEntrant`'s
  derivation step only runs once, at insert, and the only other write path is the explicit set/change
  method. That explicit, audited change is safe at every tournament lifecycle point when its valid value
  is free in the tournament. There is no scheduled job, no re-derivation-on-read, nothing that could
  silently overwrite an officer's choice later.
- **Display priority resolved at the read layer, not by writing entrant abbreviations back onto
  `Team`/`Club`.** `Team.abbreviation`/`Club.abbreviation` are never written to by this proposal; the
  `names` resolution map `public-projections.controller.ts` already builds picks `entrant.abbreviation
  ?? abbreviationOf(team, club)` per entrant, which is where "entrant wins in tournament scope" actually
  lives.
- **Responsive display uses `ResizeObserver`, never text transformation.** The shared name component
  observes its allotted space and selects either the full name or the already-resolved abbreviation. It
  does not truncate, remove diacritics, or generate an alternate abbreviation; when it shows the stored
  abbreviation it wraps it in `<abbr title>` containing the full name.

## Risks / Trade-offs

- [Risk] The per-tournament unique index rejects a legitimate re-registration or import scenario this
  design didn't anticipate → Mitigation: the index is on `(tournament_id, abbreviation)` with
  `abbreviation` nullable — an entrant can always exist with no abbreviation set; nothing about
  registering an entrant fails because of this feature, only the *derivation* step silently no-ops on
  collision.
- [Risk] The stop-word list, even covering six languages, still mishandles a name in a seventh, or one
  the list's function words don't anticipate → Mitigation: explicitly accepted per Non-Goals — the
  derived candidate is always officer-correctable,
  and a wrong guess is no worse than today's status quo (no entrant abbreviation at all).
- [Risk] A caller of the existing (currently unused) `abbreviationOf`/`labelCollisions` appears between
  now and implementation, changing this proposal's "zero blast radius on those two functions" premise →
  Mitigation: re-grep at implementation time as a task-list item; both functions are untouched regardless,
  so a new caller would just need to also learn about entrant-priority, not be blocked by this change.

## Migration Plan

- Additive migration: `ALTER TABLE entrants ADD COLUMN abbreviation text NULL`, plus a unique index on
  `(tournament_id, abbreviation)` (partial/filtered where `abbreviation IS NOT NULL`, matching how every
  other nullable-and-unique column in this schema is already indexed).
- No backfill: every entrant registered before this change ships reads as unresolved (present on the
  "needs an abbreviation" list) until an officer sets one, or a follow-up maintenance task is run to
  backfill them through the same derivation logic — deliberately not done automatically as part of this
  migration, since silently assigning thousands of existing entrants a guessed label the moment this
  ships is exactly the kind of unrequested automation the owner's direction rules out.
- Reversible: dropping the column and index loses nothing another feature depends on, since nothing
  else in this proposal writes to `Team`/`Club`'s own abbreviation.
