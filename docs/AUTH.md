# Authentication contract

Established by change `0005-api-auth-jwt-openapi-contract`, from
`chaos-vault/20-knowledge-domains/copalibre-platform-architecture.md` ("JWT access and stateless API
nodes", "Security planes"). The identity provider is deliberately **not** selected — only this
contract is, and any compliant OIDC provider satisfies it.

## Access tokens

All authenticated requests use `Authorization: Bearer <JWT>`. The API validates:

- asymmetric signature against the provider's JWKS (`COPALIBRE_JWKS_URI`);
- an allowlisted algorithm — `RS256/384/512`, `ES256/384`. `none` and every HMAC variant are absent
  from the allowlist, so a token cannot select its own verification scheme;
- exact `iss` (`COPALIBRE_JWT_ISSUER`) and `aud` (`COPALIBRE_JWT_AUDIENCE`);
- `exp`, and `nbf`/`iat` where present, with a small configurable clock tolerance;
- `sub` present; `org` (tenancy scope) and `scp` (coarse scopes) extracted into a typed context.

Key fetching, caching, and rotation are handled by `jose`'s `createRemoteJWKSet`, which re-fetches on
an unknown `kid` — that is the key-rotation overlap the design requires, and it means a transient
JWKS outage doesn't immediately invalidate live sessions.

**A token in the query string is ignored.** `?access_token=…` leaves the request unauthenticated on
purpose: URLs leak into proxy logs, browser history, metrics, traces, screenshots and error reports.

Configuration is required, not defaulted: the API refuses to start without all three auth variables,
so a misconfigured deployment fails closed instead of serving everything as public.

## Security planes

Every route declares exactly one plane with `@SecurityPlaneTag(...)`. CI's contract-lint fails the
build on an untagged route, and at runtime an untagged route is treated as `admin-control` — so
forgetting the tag cannot accidentally publish an endpoint.

| Plane                       | Token    | Coarse scope            | Authorization                                                         |
| --------------------------- | -------- | ----------------------- | --------------------------------------------------------------------- |
| `public-read`               | none     | —                       | published data only                                                   |
| `authenticated-interaction` | required | `copalibre.participant` | resource ownership: a subject may act only on their own records       |
| `admin-control`             | required | `copalibre.control`     | organization scope; destructive actions require explicit confirmation |
| `integration`               | required | `copalibre.integration` | organization scope plus narrow per-operation scopes                   |

`authenticated-interaction` and `admin-control` share this same bearer transport and differ **only**
in authorization policy: a participant token and an organizer token look identical at the transport
layer.

Authentication failures return **401**; authorization failures return **403**. Once a token has
verified, a policy denial is never reported as an authentication problem.

Fine-grained permissions live in the policy layer, never in token claims — per the architecture doc,
"Do not place secrets, personal data, or large mutable permission matrices in the token."

## Browser flow

Browsers use **Authorization Code + PKCE** and hold the access token **in memory only**. Never
`localStorage`: a long-lived access token in web storage is readable by any successful XSS.

Two modes are documented in the architecture doc. This release ships the first:

1. **Strict stateless (default, implemented).** Short access token in memory, no persistent refresh
   credential. A reload reauthenticates, and there is no immediate revocation before expiry.
2. **Pragmatic persistent (deferred).** Adds rotating refresh credentials with reuse detection and a
   small shared refresh-session record. Its storage, rotation, theft and revocation model needs its
   own threat-model decision, so it is intentionally not bundled here.

The known trade-off: strict mode forces reauthentication on reload, which may frustrate operators in
long live-match-console sessions (phase `0017`). Mode 2 is the documented escape hatch, gated on that
separate review.

## Environment

| Variable                                | Required    | Purpose                               |
| --------------------------------------- | ----------- | ------------------------------------- |
| `COPALIBRE_JWKS_URI`                    | yes         | Provider JWKS endpoint                |
| `COPALIBRE_JWT_ISSUER`                  | yes         | Exact expected `iss`                  |
| `COPALIBRE_JWT_AUDIENCE`                | yes         | Exact expected `aud`                  |
| `COPALIBRE_JWKS_CACHE_MAX_AGE_MS`       | no (600000) | Key cache lifetime / rotation overlap |
| `COPALIBRE_JWT_CLOCK_TOLERANCE_SECONDS` | no (5)      | Clock-skew tolerance                  |

## The OpenAPI artifact

`packages/contracts/openapi/v1.json` is generated from the decorated controllers, so the spec cannot
drift from the implementation. CI regenerates it and fails if it differs from the committed copy,
then runs contract-lint (every route tagged; authenticated routes advertise bearer; public routes do
not; every route documented and typed) and a breaking-change check against the published artifact.
`packages/contracts` publishes TypeScript types generated from it — phase `0020` serves the same file
via Scalar.
