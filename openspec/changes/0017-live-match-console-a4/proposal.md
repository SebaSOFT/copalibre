## Why

The Live Match Operations Console is the highest-stakes screen in CopaLibre: it is where a referee
or table official commits facts that become part of an "immutable ledger"
(`../copalibre-design-system-fixed/a4-live-match-operations-console/code.html`, marked "corrected" in
that repo's own `index.html` after an earlier Tailwind-CDN JIT bug in its destructive-confirm dialog
was fixed). The MVP's result-authority policy
(`../chaos-vault/30-processes/decisions/2026-07-27-copalibre-tournament-engine-mvp-and-result-authority.md`)
permits no direct overwrite of a finalized outcome — only an audited correction. That policy is only
real if the console UI enforces it: a finalize action must be an irreversible, clearly-confirmed
commit, and every score shown live must reconcile with what the engine actually calculated, never
just an optimistic local guess that quietly diverges.

## What Changes

- Match header: circular SVG match-clock progress ring, live scoreboard, LIVE status badge.
- **Destructive finalize dialog** (the corrected `.cl-inline-alert` component from
  `packages/design-tokens`) warning that finalizing commits the score to an immutable ledger and
  cannot be undone; requires explicit confirmation, never a single-click or double-submittable action.
- Discipline-aware event palette rendered from the active `DisciplineDescriptor`'s event-definition
  registry (`../chaos-vault/30-processes/decisions/2026-07-27-copalibre-tournament-engine-mvp-and-result-authority.md`
  "Operations console and event authority") — the palette is configuration, never a hardcoded
  universal catalog.
- Conditional event workflow: an event can branch to a quick outcome choice before its final form
  (e.g. penalty → goal or missed), per the "Live console workflow reference" in the same decision doc.
- Active timers rendered as visible objects (type, affected team/participant, remaining time,
  authorized dismissal/resolution action) — not bare numbers attached to a card event.
- Tactical data tiles: stream latency, packet loss, spectator count, stream uptime.
- Chronological, color-coded Event Ledger right rail with period-aware filtering.
- Plain-text log-note footer field — explicitly **not** a command-execution console (per the design
  system's own corrections log, which reworded this from "command console").
- Match-scoped, capability-based authorization: event entry, clock control, lineup selection, and
  match finalization are separate permissions, not consequences of a generic organizer role.

## Capabilities

### New Capabilities
- `live-match-console`: the referee/table-official UI for recording match events, controlling the
  clock, and finalizing a match through an audited, irreversible-confirmation workflow, rendered from
  discipline configuration rather than hardcoded per-sport UI.

### Modified Capabilities
(none)

## Impact

- **New UI**: `apps/web` `/control/{organization}/tournaments/{tournament}/matches/{match}` operate
  view (React, control surface).
- **Consumes**: phase 8 (`0008-live-match-operations-result-authority`) match-control API and correction
  workflow, phase 3's discipline event-definition/rule registry, phase 10 (`0010-realtime-sse-contract`)
  for live score/event updates to any concurrently-open spectator/operator views, phase 11's design
  tokens (`.cl-inline-alert`, chamfer, accent bars).
- **Highest blast-radius UI in the product**: a bug here can either corrupt a published match result
  or block a legitimate finalize — both are treated as release blockers, not ordinary bugs.
