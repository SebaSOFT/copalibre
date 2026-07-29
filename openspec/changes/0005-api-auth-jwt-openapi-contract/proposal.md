## Why

Phase 4 (`0004-persistence-postgres-outbox-audit`) gives CopaLibre durable, auditable storage, but
nothing outside the process can reach it yet — there is no HTTP surface, no authentication, and no
documented contract for how a client (public web, control web, CLI, future mobile/PWA/MCP) talks to
the backend. `../chaos-vault/20-knowledge-domains/copalibre-platform-architecture.md`'s "JWT access
and stateless API nodes" and "Security planes" sections already decided the authentication model
(short-lived JWT Bearer validated against JWKS, four distinct security planes sharing one
transport) and the "API, CLI, mobile, PWA, and MCP" section requires "Generate client types from
OpenAPI" as the single domain contract every surface consumes. This phase builds that boundary.

## What Changes

- Stand up real `apps/api` controllers (replacing phase 1's health-only stub) exposing the first
  slice of commands: authoring/read endpoints over phase 4's repositories.
- Implement **JWT Bearer validation** via JWKS: asymmetric signature check, approved algorithm only
  (never token-selected `none`), exact issuer/audience match, expiration and not-before/issued-at
  constraints, subject/tenant/scope extraction, key-identifier/rotation handling — per "Access-token
  contract."
- Implement the **policy/guard layer** across the four security planes from the "Security planes"
  table: Public read, Authenticated interaction (participant self-service — resource-ownership
  policy: a participant's scope is their own records, never another's), Admin/control (organizer/
  official consoles, stronger scopes, immutable audit, explicit confirmation for destructive
  actions), Integration (OAuth clients/API keys/webhooks/MCP — narrow scopes). Authenticated
  interaction and Admin/control share the same JWT mechanism, differing only by authorization
  policy, never by transport.
- Generate a **versioned OpenAPI artifact** from the Nest application during build, and add
  `packages/contracts` holding OpenAPI-derived shared types consumed by both frontends and any CLI.
- Add **contract-lint and breaking-change CI checks** on the generated OpenAPI artifact — the
  architecture doc requires this to run "before that artifact is copied into the Astro build" ahead
  of phase 20's Scalar reference.
- Enforce browser storage rules at the contract level (documented, testable): access JWT never
  persisted to `localStorage`; Authorization Code + PKCE is the supported browser flow; the two
  supported modes (strict stateless vs. pragmatic persistent with rotating refresh + reuse
  detection) are both documented, with the strict mode as the default until a refresh-credential
  threat model is separately decided.
- Explicit non-goal for this phase: no tournament-specific business endpoints beyond thin
  read/write pass-throughs to phase 4's repositories — phases 6–8 add the real tournament-engine
  and live-match endpoints on top of this contract.

## Capabilities

### New Capabilities
- `api-auth-contract`: JWT Bearer authentication via JWKS, the four-plane authorization policy
  layer, and a generated/versioned/contract-linted OpenAPI artifact consumed by every client
  surface.

### Modified Capabilities
(none)

## Impact

- **New files/dirs**: `apps/api/{controllers,guards,policy}/`, `packages/contracts/`, OpenAPI
  generation script, contract-lint/breaking-change-check CI tooling.
- **Dependencies introduced**: `@nestjs/passport`/JWT verification library, a JWKS client, an
  OpenAPI generator (Nest's `@nestjs/swagger` or equivalent), an OpenAPI diff/breaking-change tool.
- **Depends on**: phase 4 for repositories; phase 1 for the `apps/api` scaffold and CI skeleton.
- **Unblocks**: phases 6–8 (tournament engine, scheduling, live match ops) add endpoints behind
  this same guard/policy layer; phase 14 (`0014-control-web-shell-and-org-dashboard`) consumes the
  generated client from `packages/contracts`; phase 20 (`0020-help-docs-and-api-reference`) publishes
  this OpenAPI artifact via Scalar.
- **Explicit non-decision carried forward**: the identity provider is not selected in this phase —
  only JWT Bearer + JWKS + PKCE compatibility are selected, per the architecture doc's open gates.
  `design.md` documents this explicitly.
