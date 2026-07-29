## Context

Phase 8 (`live-match-operations`) already implements the only path by which a result can change: the
audited correction/supersession workflow. The tournament-engine decision record explicitly deferred
participant-initiated input to P1. See proposal.md for motivation. This design covers how a
participant's report/dispute becomes an *input* to that existing workflow without creating a second
mutation path.

## Goals / Non-Goals

**Goals:**
- A participant can submit a report/dispute for their own match only.
- The submission can never itself change authoritative state.
- An operator applying a correction can cite the submission as its reason/evidence.

**Non-Goals:**
- Does not add participant-initiated automatic corrections (e.g., "two participants agree → auto-apply") — every correction still requires an authorized operator action, per MVP-era decision record language that this phase does not revisit.
- Does not change phase 8's correction data model — reuses it unchanged.

## Decisions

**Reports/disputes are a new fact type, not a new mutation type.** They are stored as operational
facts (like recorded match events) that reference a match and optionally a result, with their own
audit trail, but they carry no authority to change a `MatchRuleset`-derived outcome. This preserves
the "three JSON layers separate" boundary from the tournament-engine decision record (domain
configuration / decision rules / operational facts) — a report is squarely an operational fact.

**Evidence uses the same S3-compatible object-storage adapter as every other media path**, not a
bespoke upload mechanism, per the architecture doc's "Object storage is behind an S3-compatible
adapter... Media processing, validation, thumbnails, renditions, and malware checks run
asynchronously" — evidence upload is asynchronous and validated by `apps/worker`, consistent with
"Background work and scheduling."

**Authorization reuses phase 18's resource-ownership policy verbatim**, adding only a new scoped
action ("submit report/dispute for own match") rather than a parallel authorization concept — a
participant token's policy check is identical in shape to any other participant self-service action.

## Open gates

None newly introduced by this phase.

## Risks / Trade-offs

- [Risk] A flood of low-quality disputes could overwhelm operators. → Mitigation: pending
  reports/disputes surface as a queue (like registration review in phase 15), not as automatic
  interruptions, and can be dismissed by an operator without applying a correction.
- [Risk] Evidence files could be used to exfiltrate large amounts of data or malicious content. →
  Mitigation: reuse the same async validation/malware-check path the architecture doc already
  specifies for all media, not a bespoke exception for this feature.
- [Risk] A participant could submit conflicting reports to game the review queue. → Mitigation: the
  correction workflow's existing recalculation-preview step surfaces exactly what would change before
  an operator commits, regardless of how many or how conflicting the underlying submissions were.

## Migration Plan

N/A — additive; MVP-era matches with no participant reports/disputes behave identically to before this
phase.
