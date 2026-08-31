# Closed sets

Four vocabularies in the descriptor are closed enums the platform defines, not open strings a module
invents. Each is closed for a stated reason; each states what to do when a regulation needs something
outside it.

## Formats — `availableFormats`

Exactly eight values exist, and no ninth can be added by a module:

- `single-elimination` — one loss eliminates an entrant from the bracket.
- `double-elimination` — an entrant is eliminated only after two losses, via a winners and a losers
  bracket.
- `round-robin` — every entrant plays every other entrant once; standings rank by accumulated points.
- `league` — every entrant plays every other entrant across a season-length schedule; standings rank
  by accumulated points.
- `round-robin-single-leg` — every entrant plays every other entrant exactly once, with no return
  fixture.
- `round-robin-home-away` — every entrant plays every other entrant twice, once at each side's home
  venue.
- `free-for-all` — all entrants compete in the same heat at once; standings rank by finishing position.
- `heats` — entrants compete across multiple heats; standings rank by finishing position across every
  heat.

**Why closed:** the fixture-generation engine implements exactly these eight structures. Advertising a
ninth would mean simulating a bracket shape nothing generates — the same "must not advertise support
it cannot provide" constraint that keeps every other closed set closed.

**When a regulation needs something outside it:** a regulation describing "group stage into knockout"
is not a ninth format — it is two stages, the first `round-robin` (or `league`), the second
`single-elimination` (or `double-elimination`), connected by a tournament profile's stage-qualification
declaration (out of this descriptor's scope; see the tournament-profile module kind). A discipline
declares which of the eight formats it can be played under in `availableFormats`; a tournament chooses
one of those per stage.

## Series resolution classes — `series.resolutionClass`

- `best-of` — the series ends as soon as one side has won enough matches to make the remaining ones
  irrelevant. The span must be odd, so a majority is always possible.
- `aggregate` — the series winner is decided by total score across every match, added together, not by
  who won more matches.
- `points-per-leg` — each match in the series awards its own points; the series winner is whoever
  accumulates the most across every leg.

**Why closed:** these are the three ways a real-world multi-match tie is resolved that the accounting
engine can compute without a custom script. A regulation whose tie-resolution logic does not reduce to
one of these declares `series.resolutionScript` instead — a Neuron-JS script — rather than forcing an
approximation into `resolutionClass`.

## Aggregation modes — `statistics[].aggregation`

- `sum` — values add together (goals, points scored).
- `count` — how many times the statistic was recorded (appearances, cards shown).
- `max` — the highest single value recorded (a personal-best distance).
- `min` — the lowest single value recorded (a fastest lap or time).
- `average` — the mean of every recorded value.

**Why closed:** these are the five folds the standings engine's accumulator implements; a statistic
declares which one applies to it, and the engine folds every recorded value the same way regardless of
discipline. A regulation's derived figure that is not a straightforward fold of one of these (a rating
computed from several other statistics, say) is a `computed` table column — see the descriptor
reference's `tableLayouts` entry — not a new aggregation mode.

## Result reasons — `ResultReason` (a recorded outcome, not a descriptor field)

- `played` — an ordinarily played result. Absent on a recorded outcome also means this.
- `administrative-loss` — a loss assigned outside play, by ruling.
- `walkover` — the opponent did not show; no match was contested.
- `forfeit-abandonment` — the match started and was abandoned before a natural result.
- `disqualified` — the entrant was removed from the result by ruling, mid-competition or after.
- `did-not-finish` — the entrant started but did not complete the match (a placement discipline's
  usual case for this).

**Why closed:** every result-correction and standings-explanation surface in the platform reasons about
"why is this entry's result what it is" using exactly these six values; a discipline does not declare
its own set, because the audited-correction workflow, the standings explainer, and the public match
report all read this same closed vocabulary. This is not a descriptor field — it is set per side on a
recorded outcome — documented here because a regulation section about walkovers, forfeits, and
disqualification maps onto it rather than onto anything in the descriptor itself.
