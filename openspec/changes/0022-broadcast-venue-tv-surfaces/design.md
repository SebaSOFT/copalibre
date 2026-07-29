## Context

The architecture doc's "Broadcast and venue display" table establishes this surface has no session
in the person-JWT sense, can run for days unattended, and must never depend on a dismiss action. See
proposal.md for motivation. This design covers the display-token mechanism and the reliability
engineering needed to meet that table's requirements.

## Goals / Non-Goals

**Goals:**
- A concrete, revocable, device-scoped authorization mechanism that is not a person's JWT.
- Zero visible-error states on this surface, ever.
- Provable multi-day memory stability.

**Non-Goals:**
- No new event channel — reuses phase 10's public SSE unchanged.
- No new visual identity — layers organizer branding over phase 11's tokens, does not redefine them.
- Does not resolve the still-open identity-provider or queue-adapter gates (see Open gates below).

## Decisions

**Display token: a long-lived, route-bound, revocable opaque token, not a JWT.** A person's JWT is
short-lived by design (architecture doc: "short access-token lifetime limits stale coarse claims").
That is wrong for a kiosk that must survive a power-cycle and cannot re-authenticate a human. Instead:
an authenticated operator issues a display token scoped to exactly one `/tv/**` path (organization +
tournament + optional match + mode), stored server-side with a revocation flag, presented by the
device as a bearer credential on the SSE request and the initial page load. Revocation is a single
server-side flag flip, independent of any person's session lifecycle. Alternative considered: reusing
a long-lived refresh-token pattern from the browser auth flow — rejected because it conflates a
person's identity lifecycle with a device's, and revoking a person's access should not require
touching every kiosk they once configured.

**Token storage on-device: not `localStorage`.** The architecture doc explicitly forbids depending on
`localStorage` surviving a power-cycle for this surface. The token is provisioned into the kiosk's
environment/config at setup time (e.g., baked into the device's launch URL as a path segment resolved
server-side, or written to a config file the kiosk's browser-launcher reads on boot) rather than
relying on browser storage the OS/browser could clear.

**Silent reconnect, capped exponential backoff, no error UI ever.** Reuses phase 10's shared
reconnect/backoff client library unchanged in mechanism, but this surface's UI layer never renders
the "recoverable error" state that public/control web are allowed to show — it only ever shows "last
known good projection" while retrying underneath.

**Soak test runs on a schedule, not per pull request.** A multi-day memory measurement cannot gate a
PR. It runs as a long-duration scheduled job (mirrors phase 21's nightly backup-restore-drill pattern)
with a shorter proxy signal (e.g., a 2-hour accelerated run with tighter memory-growth thresholds) as
the actual per-PR gate.

## Open gates

**Resolved by this phase:** the device-scoped display-token mechanism, previously listed in
`copalibre-platform-architecture.md`'s "Explicit non-decisions and open gates" as "named as a
requirement but not designed." The Decisions section above is the design.

**Not resolved by this phase (still open, unaffected by this change):** the concrete queue adapter
and the identity-provider selection remain open gates from the architecture doc. Display-token
issuance/validation is implemented against the same abstract PostgreSQL-backed authorization pattern
used elsewhere (phase 5's policy layer), not against any specific identity provider, so this phase
does not need those gates resolved to proceed.

## Risks / Trade-offs

- [Risk] A leaked display token grants read access to one route indefinitely until revoked. →
  Mitigation: scope is read-only and single-route; revocation is instant; tokens are never person-
  identifying, limiting blast radius to "someone can watch this one TV feed early/on an unintended
  screen," not an account compromise.
- [Risk] "No visible error, ever" can hide a genuinely broken device from the organizer. → Mitigation:
  device health (last-successful-render heartbeat) is surfaced in control-web's A1 dashboard (phase
  14), not on the kiosk screen itself — the silence rule applies only to the unattended surface, not
  to operator-facing monitoring.
- [Risk] Organizer branding could accidentally override a state color, breaking the "never color
  alone" accessibility contract. → Mitigation: branding is restricted to a named accent-color token
  and logo slot; state colors (live/upcoming/destructive/positive) are not overridable inputs.

## Migration Plan

N/A — additive new surface, no existing behavior changes.
