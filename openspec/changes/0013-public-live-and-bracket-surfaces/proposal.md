## Why

TMS-007 ("Public live competition surfaces") in
`../chaos-vault/50-research/copalibre-market-segment-feature-specification.md` is only partially
delivered by the static B1 overview page from `0012-public-web-astro-shell`. The product's core spectator
value — watching a competition live and understanding who's winning and why — requires the B2 Live
Competition Dashboard and B3 public Bracket/Stage view already designed in
`../copalibre-design-system-fixed/b2-live-competition-dashboard/code.html` and
`.../b3-bracket-stage-view-public/code.html`, wired to the real-time projection pipeline from
`0010-realtime-sse-contract` instead of the mockups' static placeholder data. The accessibility rule
already encoded in `../copalibre-design-system-fixed/shared/copalibre-system.css` — state badges
always pair color with a text label, "never color alone" — is a hard requirement here specifically,
because B3's win/loss legend is exactly the kind of color-only cue that rule exists to prevent.

## What Changes

- Build the **B2 Live Competition Dashboard**: public nav + score ticker (shared with B1), central
  live-match hero (match metadata, clock, two team panels with streak/elimination-risk label, VS
  score, a 5-segment chamfered "Series State Bar" showing game-by-game series progress), right rail
  "Up Next" queue and "Top Performers" stat-leaders table — sourced from
  `b2-live-competition-dashboard/code.html`, deliberately **without** the FPS minimap the original
  mockup had (already removed per the corrections log in `copalibre-design-system-fixed/index.html`
  — public surfaces must stay discipline-agnostic).
- Build the **B3 public Bracket/Stage view**: read-only bracket (Quarterfinals → Semifinals → Grand
  Final columns), non-color-redundant win/loss legend (chamfered swatch **plus** text label, winner
  rows also carry a check-circle icon and loser rows a cancel icon — dual redundant cues, never color
  alone), live match node with distinct glow treatment, dashed 50%-opacity "TBD" placeholder for
  unresolved future rounds.
- Wire both screens to the public SSE channel `/events/public/{organization}/tournaments/{tournament}`
  from `0010-realtime-sse-contract`: subscribe on mount, apply `standings.updated`/match-state events to
  the rendered projection, reconnect with the last acknowledged event ID on drop.
- Ensure both screens degrade to their last-known server-rendered state (no blank/broken UI) if the
  SSE connection is unavailable, consistent with the architecture doc's "public reads remain cheap
  and cacheable" principle — live enhancement, not a hard dependency.

## Capabilities

### New Capabilities
- `public-live-surfaces`: the public site shows a live competition dashboard and a read-only bracket
  view that update in near-real-time via the public SSE channel, remain informative if the live
  connection drops, and never encode win/loss or match state using color as the only signal.

### Modified Capabilities
(none — `public-web-shell` and `url-routing-contract` from `0012-public-web-astro-shell` are consumed, not modified)

## Impact

- **New files/dirs**: `apps/web/src/pages/[organization]/tournaments/[tournament]/live.astro`,
  `apps/web/src/pages/[organization]/tournaments/[tournament]/stages/[stage].astro`,
  `apps/web/src/components/public/{LiveMatchHero,SeriesStateBar,TopPerformers,BracketView,
  MatchNode,ResultLegend}.tsx` (React islands for the parts that need live updates; static
  where possible per the architecture's "small React islands for live updates" guidance).
- **Depends on**: `0012-public-web-astro-shell` (routing, layout, design tokens already wired),
  `0010-realtime-sse-contract` (the public SSE channel this phase consumes), `tournament-engine-fixtures-
  mvp-formats` (bracket structure data, including the double-elimination layout this phase must be
  able to render), `0003-rules-engine-neuron-js-adapter` (standings/tiebreak data shown in Top Performers
  and implicitly in bracket progression).
- **No authenticated or mutating behavior** — both screens remain part of the anonymous public
  surface.
