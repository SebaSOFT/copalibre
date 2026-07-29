## Context

The visual layout for both screens already exists as static mockups (`b2-live-competition-dashboard`,
`b3-bracket-stage-view-public`) built on the shared `copalibre-system.css` token contract. This phase
is about making those layouts live (SSE-driven) and correctly sourced from real bracket/standings
data instead of hardcoded mockup content — not redesigning the screens.

## Goals / Non-Goals

**Goals:**
- Both screens are React islands within the otherwise-static Astro public shell, consistent with the
  architecture doc's "small React islands for live updates" guidance — not full client-rendered SPA pages.
- The color-plus-non-color redundancy rule from `copalibre-system.css` is enforced as a testable
  requirement, not just a CSS convention that can silently regress.
- Both screens degrade gracefully to server-rendered last-known state without SSE.

**Non-Goals:**
- This phase does not implement the SSE transport itself (`0010-realtime-sse-contract` owns the channel,
  reconnect/backoff, and cursor-replay client library) — it only consumes that client library.
- This phase does not implement bracket *generation* (fixture creation, double-elimination layout
  algorithm) — that's `0006-tournament-engine-fixtures-mvp-formats`. It only renders whatever bracket
  structure that engine produces.

## Decisions

**Islands architecture, not full-page hydration.** Only the components that need live updates
(`LiveMatchHero`, `SeriesStateBar`, bracket match nodes) are React islands; the page shell, nav, and
static sections stay plain Astro/HTML. This keeps the public surface's "cheap and cacheable" property
from the architecture doc's principle 4 intact even on the live pages.

**SSE reconnect logic lives entirely in the shared client library from `0010-realtime-sse-contract`.**
These screens only call it; they do not implement their own reconnect/backoff/cursor logic. Rejected
alternative: a page-local `EventSource`/`fetch` loop per screen — would duplicate reconnect logic and
risk drifting from the authenticated-SSE screens' behavior.

**Result-state redundancy is enforced by a shared `ResultLegend`/state-badge component, not ad hoc
styling per screen.** Every result/state indicator (bracket winner/loser, live/upcoming/disputed
badges) must go through one component that always renders a color plus an icon/text pairing. This
makes the "never color alone" rule structurally hard to violate rather than a lint/review convention.

## Risks / Trade-offs

- [Risk] SSE reconnect storms during a highly-watched live match could overload `apps/events`. →
  Mitigation: out of scope for this phase's spec (rate limiting/backoff is `0010-realtime-sse-contract`'s
  responsibility); this phase's e2e tests should still assert the dashboard doesn't hammer reconnects
  when the client library backs off correctly.
- [Risk] Bracket rendering must handle double-elimination's non-tree structure once
  `0006-tournament-engine-fixtures-mvp-formats` resolves that open design gap — this phase's bracket
  component should not assume single-elimination tree shape. → Mitigation: build `BracketView`
  against a generic round/match list data shape (not a nested tree), matching how the reference
  algorithm doc already flagged single-elimination's tree assumption as false for double elimination.

## Open Questions

- Whether Top Performers stat ordering ties into `0003-rules-engine-neuron-js-adapter`'s comparator
  pipeline directly or uses a simpler display-only sort is left to implementation; does not change
  this phase's spec-level behavior (it only requires the dashboard show the data, not how it's ranked
  internally, since that ranking's correctness is `0003-rules-engine-neuron-js-adapter`'s own requirement).
