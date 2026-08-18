## Why

No chaos-vault architecture decision governs this change — owner-directed (2026-08-19), same footing
as `0015`/`0016`/`0099`. `Club.abbreviation` and `Team.abbreviation` already exist
(`packages/domain/src/identifiers/abbreviation.ts`, `Team`/`Club` aggregates) and are deliberately
organizer-chosen, never derived — the type's own doc comment states why: *"the moment the heuristic
ships, every club whose name it mishandles has an abbreviation nobody chose and cannot explain."* They
are also collision-*tolerant* by explicit design: `labelCollisions` (`short-labels.ts`) reports a
shared abbreviation within one competition but never refuses it — *"CopaLibre enforces the integrity of
its own records and what this organizer explicitly configured, and never what a competition usually
requires."*

Neither property fits what's being asked for here, and for a structural reason, not a preference: a
`Team`'s abbreviation is fixed and reused across every tournament it ever enters, so it cannot be
guaranteed collision-free within any *particular* tournament — two teams from unrelated clubs can each
independently carry "SL" and only discover the clash the day they're both drawn into the same
competition. Distinctness is only checkable, and only guaranteeable, at the scope where two sides
actually share a bracket cell, a group table row, and a match header: the **entrant** — a team's (or
individual's) specific participation in one tournament, not the team itself. So this is a new, narrower
concept layered onto `Entrant`, not a redefinition of `Team`/`Club`'s abbreviation, which keeps its
existing organizer-chosen, collision-tolerant behavior exactly as it is today, everywhere outside a
specific tournament's own display surfaces.

**This is a default-fill suggestion, not automation that overrides a usable choice** — auto-derivation
fills an empty, malformed, or tournament-colliding registration value. A supplied value that passes the
existing format validation and is free in the tournament is used as given; otherwise the same one-shot
derived proposal is tried, never a widening sequence. Once an entrant has an abbreviation — supplied or
derived — nothing recomputes it afterward except an explicit, separate officer edit. This mirrors how
club-alias suggestion already works in this codebase (*"What the organizer typed wins over what would
be suggested"*), applied to this value.

## What Changes

- **No new value object.** An entrant's abbreviation is validated with the exact same format
  `Abbreviation` already enforces (`Abbreviation.create`, ≤10 characters, uppercase letters/digits,
  single interior spaces permitted) — the format was never the difference; what's different is entirely
  behavioral (see below), which lives at the repository layer, not in a second value type answering the
  same format question twice.
- `Entrant` gains an optional `abbreviation` field, resolved once, at registration:
  1. If a registration request or CSV-import row supplies one explicitly and it passes
     `Abbreviation.create` and is free in this tournament, it is stored as given.
  2. If that value is empty, malformed, already taken in this tournament, or absent, a candidate is
     derived: the team's own `abbreviation` if it has one; else the club's; else initials of the display
     name's significant words (a stop-word list covering English,
     Spanish, Portuguese, French, Italian, and German short function words — `de`/`del`/`la`/`the`/
     `of`/`und`/`della`/`des` and similar), truncated to 10 characters. Because the format already
     matches, a team's or club's own abbreviation is always usable verbatim as the starting candidate
     when present — no conditional reformatting is ever needed.
  3. The candidate is checked against every other entrant already registered in the same tournament. If
     free, it is stored — silently, no confirmation step, matching "solved upon subscription." If taken,
     the entrant registers with no abbreviation set, and appears on a new "needs an abbreviation" list
     an officer resolves explicitly (see below) — the system never guesses a second, wider candidate on
     its own.
  4. Once set, by either path, an entrant's abbreviation is never recomputed automatically. An officer
     may change it explicitly at any tournament lifecycle point, provided the new value is valid and
     free in that tournament; the change is audited.
- A new, narrow write path — set/change one entrant's abbreviation — validates format **and** rejects a
  value already taken by another entrant in the same tournament. This is a deliberate, stated departure
  from `labelCollisions`'s report-only philosophy: that principle is about not second-guessing an
  organizer's *identity* choice for their own club; this value's entire reason to exist is guaranteed
  distinctness within one tournament, so enforcing it here doesn't relax that principle, it's the one
  place the principle was never claiming to cover.
- Display priority in every tournament-scoped surface: an entrant's own `abbreviation` is shown first;
  `abbreviationOf(team, club)`'s existing fallback chain still applies for the (should-be-rare) entrant
  that has none. Outside tournament scope — anywhere a `Team`/`Club` is shown without a specific
  tournament in view — nothing changes; `Team`/`Club`'s own abbreviation stays authoritative.
- Every surface that renders a resolved abbreviation renders it through one shared, size-aware name
  component. A `ResizeObserver` selects between the full name when it fits and the resolved
  abbreviation when it does not — an aesthetic/responsive choice, not an accessibility workaround.
  It never truncates, strips diacritics, or derives a display value. It wraps the abbreviation in
  `<abbr title="{full name}">` so the full name stays recoverable independent of viewport width.

## Capabilities

### Modified Capabilities
- `tournament-engine/competition-identity`: the existing "club/team short label" requirement is joined
  by a new requirement for an entrant's own, tournament-scoped, guaranteed-distinct abbreviation —
  explicitly a different guarantee than the club/team one, not a replacement of it.

## Impact

- `packages/domain/src/identifiers/abbreviation.ts` — unchanged; reused directly for entrant-abbreviation
  format validation, no new value object.
- `packages/domain/src/aggregates/participant.ts` — `Entrant` gains `readonly abbreviation?: string`.
- `packages/domain/src/aggregates/short-labels.ts` — a new `deriveEntrantAbbreviation(displayName,
  teamAbbreviation?, clubAbbreviation?)` pure function implementing the priority order above; existing
  `abbreviationOf`/`labelCollisions` untouched.
- `packages/persistence/src/repositories/enrollment-repository.ts` — `entrants` table gains a nullable
  `abbreviation` column with a per-tournament unique index; `registerEntrant` accepts an optional input,
  resolves and writes it per the rules above; a new method sets/changes one entrant's abbreviation with
  format + uniqueness validation; a new read lists entrants with no abbreviation resolved, for an officer
  to act on.
- `apps/api/src/controllers/public-projections.controller.ts` (and any other controller populating an
  `abbreviation`/`homeAbbreviation`/`awayAbbreviation` DTO field — confirmed by grep: this file is the
  only current populator, via a `names`/`standingsNames` resolution map) — that map's abbreviation
  source gains entrant-first priority; a new route for the explicit set/change action. CSV import accepts
  an optional abbreviation column and passes it to registration under the same fallback rules.
- `apps/web` — a new shared `EntrantName`-style component (full name when it fits, abbreviation with
  `<abbr title>` when it doesn't, selected by `ResizeObserver` without truncation or text transformation);
  every render site of a resolved abbreviation (`StandingsPage`, bracket components, `JerseyGrid`'s team
  headers, and whatever the public overview page renders once built) is switched to it; no change to the
  underlying wire field names.
