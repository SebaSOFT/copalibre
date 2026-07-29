## Why

TMS-013 ("Participant result reporting, evidence, and dispute",
`../chaos-vault/50-research/copalibre-market-segment-feature-specification.md`) is P1: participants
should be able to self-report a result and raise a dispute rather than every discrepancy requiring an
operator to notice it first. `../chaos-vault/30-processes/decisions/2026-07-27-copalibre-tournament-
engine-mvp-and-result-authority.md` is explicit that this was deliberately excluded from MVP: "
Participant reporting and participant-initiated disputes are not MVP scope. Authorized operator
corrections with audit history are MVP scope." This phase is that deferred capability, and it must be
built as an *input* to phase 8's existing audited correction workflow, never a second path that can
mutate a result.

## What Changes

- Add **participant self-service result reporting**: a participant (scoped to their own match per
  phase 18's `roles-permissions` resource-ownership policy) can submit a proposed result and optional
  evidence (screenshots, replay files, description).
- Add a **dispute workflow**: a participant can flag a recorded result as disputed, attaching evidence
  and a reason.
- **Neither action mutates the authoritative result.** A submitted report or dispute is a fact fed
  into phase 8's existing audited correction workflow as a *candidate input an operator reviews* — it
  requires the same operator-authorized correction (actor, timestamp, reason, prior/replacement state,
  recalculation preview) before anything changes. This phase adds a new *source* of correction
  requests; it does not add a new mutation path.
- Add **evidence storage**: uses the S3-compatible object-storage adapter already specified in the
  architecture doc, with the same audit trail (who uploaded what, when) as any other operational fact.

## Capabilities

### New Capabilities
- `participant-reporting`: self-service result reporting and dispute submission, scoped to a
  participant's own matches, feeding into the existing operator-authorized correction workflow.

### Modified Capabilities
- `roles-permissions`: extends the resource-ownership policy with the specific write action
  "submit a report or dispute for my own match," still bounded by the existing "a participant's scope
  is their own records only" rule — no new authorization concept, just a new scoped action.

## Impact

- **Depends on**: phase 8 (`live-match-operations`) for the correction workflow this phase feeds,
  phase 18 (`roles-permissions`) for the resource-ownership policy it extends.
- **New files**: report/dispute submission endpoints in `apps/api`, evidence-upload handling via
  `apps/worker`'s object-storage adapter, a "pending participant reports" queue surfaced to operators
  in control-web.
- P1 phase: deferred past MVP, fully specified here.
