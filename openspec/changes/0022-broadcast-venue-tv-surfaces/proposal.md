## Why

`../chaos-vault/20-knowledge-domains/copalibre-platform-architecture.md` defines a third product
surface alongside public web and control web: unattended venue TVs and streaming-software overlays.
Its "Broadcast and venue display" comparison table makes clear this is not a themed variant of the
public site — it has a categorically different consumption model (no session, no pointer/keyboard,
must run for days unattended, failures must resolve silently because nobody is present to click
retry). Building it as an afterthought on top of public-web assumptions would violate that contract.
This phase gives `/tv/**` its own design and its own reliability bar, reusing the public projection
data and public SSE channel rather than duplicating them.

## What Changes

- Add `apps/web` `/tv/**` routes: a **kiosk mode** (full-rotation and pinned-to-one-match views per
  the architecture doc's URL contract: `/tv/{organization}/tournaments/{tournament}` and
  `/tv/{organization}/tournaments/{tournament}/matches/{match}`) and a **transparent overlay mode**
  (`?mode=overlay`) for OBS/streaming-software chroma-key capture.
- **Design and resolve the device-scoped display-token mechanism**, currently listed as an open gate
  in the architecture doc ("named as a requirement but not designed"): a long-lived, narrowly-scoped,
  operator-issued, per-device/per-route token — distinct from a person's JWT — bound to a specific
  `/tv/**` path, revocable by the organizer without affecting any person's session, never stored via
  a mechanism assumed to survive only as long as `localStorage` (a kiosk can power-cycle).
  **This resolves that gate; it does not resolve the still-open queue-adapter or identity-provider gates.**
  See design.md's Open Gates section for the precise boundary.
- Reuse phase 10's (`realtime-events`) **public SSE channel** — no second event channel, per the
  architecture doc: "the underlying data is the same published projection, only the rendering
  differs, so a second event channel is unnecessary complexity."
- Implement **unattended-reliability requirements**: title-safe/action-safe margins and type sizing
  for 5–10m viewing distance; silent reconnect only, no visible error/retry UI; no dependency on
  `localStorage` surviving a power-cycle; long-running memory stability (no leak over a multi-day
  session).
- Support **organizer event-branding**: the base CopaLibre identity layered with an organizer-supplied
  logo/color accent, without breaking the underlying Broadcast Command Precision token contract from
  phase 11.

## Capabilities

### New Capabilities
- `broadcast-tv-surfaces`: unattended kiosk and transparent-overlay rendering of published tournament
  projections, with a device-scoped display-token authorization mechanism distinct from a person's JWT.

### Modified Capabilities
(none — this is additive; it does not change public-web or control-web requirements)

## Impact

- **New files**: `apps/web/src/pages/tv/**`, a display-token issuance endpoint in `apps/api` (operator-
  authenticated, issues/revokes device tokens), a display-token validation guard in `apps/events` for
  the SSE channel this surface consumes.
- **Depends on**: phase 10 (`realtime-events`) for the public SSE channel and phase 11
  (`design-tokens`) for the base visual identity this surface layers organizer branding over.
- **New CI concern**: a long-running memory-leak soak test that cannot run on every pull request (see
  tasks.md) — runs on a schedule instead, mirroring the backup-restore-drill pattern introduced in
  phase 21.
