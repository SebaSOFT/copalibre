## Context

Phase 6 (`tournament-engine`) generates fixtures/standings for one stage. Phase 8
(`live-match-operations`) owns result finality and the audited correction workflow. TMS-012 (P1) asks
for explicit multi-stage tournaments (group stage → playoffs). See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Deterministic, auditable stage-to-stage advancement.
- Reuse phase 8's existing correction/mutation-class machinery across a stage boundary instead of
  inventing a parallel one.

**Non-Goals:**
- Does not change single-stage fixture generation or tiebreak calculation (phase 6, phase 3).
- Does not add new tournament formats beyond the 6 MVP formats — a "multi-stage tournament" is a
  sequence of stages, each still one of those 6 formats.

## Decisions

**Advancement is declared configuration, not code.** Following the `DisciplineDescriptor →
TournamentRuleset → StageConfiguration` pattern from phase 2, advancement rules (count, ranking
criteria, target seed positions) live in `StageConfiguration` as a new declarative field, keeping the
"configuration ownership" principle from the tournament-engine decision record intact rather than
hardcoding advancement logic per format.

**Stage completion is a explicit state, not inferred from "all matches have a result."** A stage can
have all matches resolved yet still be intentionally held open (e.g., awaiting a correction window).
Completion is an explicit operator action, gated by phase 8's result-finality rules, matching the
product's "authoritative competition facts" invariant — nothing advances silently.

**Cross-stage correction reuses `blocked_after_results`, it does not add a fourth mutation class.**
The three mutation classes (`safe`/`requires_rebuild`/`blocked_after_results`) from the tournament-
engine decision record already express exactly the needed semantics once "the next stage has started"
is treated as the same kind of downstream-impact boundary as "a valid result exists" — no new
classification is needed.

## Open gates

None newly introduced. This phase inherits the still-open "first standard parameter catalogue and
default comparator order" gate from phase 2/3 (standings ranking used for advancement uses whatever
comparator pipeline the tournament's ruleset defines) but does not need that gate resolved to define
the advancement-rule *shape*.

## Risks / Trade-offs

- [Risk] Advancement misconfiguration (e.g., advancing more participants than the next stage has seed
  slots) could silently drop or duplicate a participant. → Mitigation: advancement-rule validation at
  configuration time rejects a mismatch between advance-count and next-stage seed-slot count before
  the tournament can publish.
- [Risk] Treating "next stage started" as the correction-blocking boundary could be too coarse if the
  next stage has many independent groups. → Mitigation: scope the blocking boundary to the specific
  next-stage group/bracket segment actually fed by the corrected standings, not the whole next stage.

## Migration Plan

N/A — additive capability; single-stage tournaments are unaffected since they never invoke advancement.
