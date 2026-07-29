## Context

Phase 4 gives repositories; nothing outside the Nest process can call them. This design covers how
`apps/api` exposes those repositories safely and how every future client (this session's phases 12–
18 and any future CLI/mobile/MCP) agrees on one contract, per the architecture doc's "API, CLI,
mobile, PWA, and MCP" section: "No surface receives direct database authority."

## Goals / Non-Goals

**Goals:**
- Every request is either explicitly public or explicitly authenticated+authorized before it
  reaches a repository call.
- The OpenAPI artifact is the single source of truth for request/response shapes — no
  hand-maintained client types drift from it.
- The guard/policy layer is reusable unchanged by phases 6–8's tournament-engine endpoints.

**Non-Goals:**
- No tournament-specific business logic beyond thin CRUD pass-throughs — phases 6–8 add that.
- No identity-provider selection or hosting — only the JWT/JWKS/PKCE *contract* is fixed here.
- No refresh-token persistence model — the strict stateless mode is the default; the pragmatic
  persistent mode's storage/rotation/reuse-detection/revocation model is explicitly deferred (see
  Open Questions).

## Decisions

**JWKS-based verification, not a shared symmetric secret.** Asymmetric verification lets the API
validate tokens without holding a secret capable of *issuing* them, matching the "self-hostable or
customer-selected OIDC identity provider" model — the API only needs the provider's public JWKS
endpoint, never a shared secret it could leak. Alternative considered: a shared HMAC secret — rejected
because it couples the API's trust boundary to the identity provider's secret-management practices
instead of a rotatable public key.

**Guards + a policy layer, not per-controller ad hoc checks.** Nest guards handle authentication
(is this token valid?); a separate policy layer handles authorization (may this subject act on this
resource?). Keeping them separate is what lets a participant token and an organizer token "look the
same at the transport layer and differ entirely at the policy layer," per the architecture doc.
Alternative considered: encoding fine-grained permissions directly in JWT claims — rejected per the
architecture doc's explicit instruction: "Do not place secrets, personal data, or large mutable
permission matrices in the token."

**Nest's own OpenAPI generation (`@nestjs/swagger`), not a hand-written spec.** Generating from
decorated controllers keeps the spec and the implementation from drifting — a hand-written OpenAPI
file would need manual sync on every endpoint change. The generated artifact is still contract-
linted and breaking-change-checked in CI so generation drift doesn't silently ship a breaking change.

**Strict stateless mode is the default; pragmatic persistent mode is future work.** The architecture
doc names both modes as "explicit" and supported, but choosing the persistent mode's refresh-storage/
rotation/reuse-detection/revocation model "requires a separate threat-model decision" — this phase
ships the simpler, safer default and leaves the richer mode to a dedicated future change rather than
bundling an unreviewed threat model into this proposal.

## Risks / Trade-offs

- [Risk] Strict stateless mode means every page reload forces reauthentication, which may frustrate
  operators during long live-match-console sessions (phase 17). → Mitigation: this is a known,
  accepted trade-off per the architecture doc; if operator friction proves unacceptable, the
  pragmatic persistent mode is the documented escape hatch, gated on its own threat-model review.
- [Risk] JWKS endpoint unavailability blocks all authenticated traffic. → Mitigation: cache fetched
  JWKS keys with a bounded TTL and documented key-rotation overlap window, so a transient JWKS
  outage doesn't immediately invalidate live sessions.
- [Risk] Generated OpenAPI artifact could accidentally expose internal-only endpoints if decorators
  are misapplied. → Mitigation: contract-lint step in CI includes an explicit check that every
  controller route is deliberately tagged public/authenticated/admin before the artifact is
  accepted.

## Open Questions

- Concrete identity-provider selection remains an explicit open gate from the architecture doc — not
  resolved here, and does not change this phase's contract (JWT Bearer + JWKS + PKCE compatibility
  work with any compliant OIDC provider).
- The pragmatic persistent-refresh mode's storage/rotation/reuse-detection/revocation threat model is
  deferred to a future change; this phase's scope only requires the strict stateless mode to work
  end-to-end.
