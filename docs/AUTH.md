# Authentication contract

Established with the API auth contract (stateless API nodes, security planes) and extended by `native-identity-provider`. CopaLibre uses a hybrid model:

1. **OIDC Providers:** External identity via stateless JWTs.
2. **Native Identity Provider:** Local email/password authentication using Argon2, and stateful Personal Access Tokens (PATs) for MCP and API integrations.

## Access tokens

All authenticated requests use `Authorization: Bearer <JWT>`. The API validates:

- asymmetric signature against the provider's JWKS (`COPALIBRE_JWKS_URI`);
- an allowlisted algorithm — `RS256/384/512`, `ES256/384`. `none` and every HMAC variant are absent
  from the allowlist, so a token cannot select its own verification scheme;
- exact `iss` (`COPALIBRE_JWT_ISSUER`) and `aud` (`COPALIBRE_JWT_AUDIENCE`);
- `exp`, and `nbf`/`iat` where present, with a small configurable clock tolerance;
- `sub` present; `org` (tenancy scope) and `scp` (coarse scopes) extracted into a typed context.

**Personal Access Tokens (PATs)**
For machine-to-machine integrations (like MCP), operators can generate PATs from their Preferences screen.

- A PAT is an opaque string starting with `clpat_`.
- The raw token is shown only once during creation.
- The backend stores a SHA-256 hash in the `personal_access_tokens` table.
- At runtime, the API guard detects the `clpat_` prefix and validates it statefully via a database lookup, allowing immediate revocation.

**Native Local JWTs**
The native login flow (`/auth/login`) issues one-hour JWTs using **RS256**. The API reads the
private key and matching public JWKS from `COPALIBRE_JWT_PRIVATE_KEY_FILE` and
`COPALIBRE_JWKS_FILE`, or from `jwt-private.pem`/`jwks.json` in its working directory or
`/var/lib/copalibre`. `copalibre init` creates these files on the host; ensure the API container
can read the matching pair through your deployment mounts. If absent, the API generates temporary
in-memory keys, so restarts invalidate existing tokens and replicas cannot reliably share identity.
The public keys are served at `/.well-known/jwks.json` and `/auth/jwks.json`. Native tokens use the
same asymmetric verifier as OIDC tokens; `COPALIBRE_JWT_SECRET` is not a supported signing setting.

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

OIDC browsers use **Authorization Code + PKCE**. The current control panel keeps its access token
in memory and tab-scoped `sessionStorage`, so a reload can recover an unexpired session; it does not
persist access tokens in `localStorage`.

Native login, invitation acceptance and refresh issue a rotating opaque refresh cookie,
`copalibre_refresh_token`, scoped to `/auth`, with `HttpOnly`, `SameSite=Strict`, a 30-day lifetime,
and `Secure` in production. `POST /auth/refresh` consumes the stored hashed refresh credential and
issues a new cookie/access token; `POST /auth/logout` revokes the presented refresh credential and
clears the cookie. Browser code cannot read the refresh cookie. Serve `/auth/*` through the application
origin and HTTPS in production so the cookie reaches the intended API.

OIDC renewal uses the identity provider's silent authorization flow (`prompt=none`) with PKCE;
it does not use CopaLibre's native refresh cookie. Register `/control/silent-renew-callback` alongside
the ordinary callback at the provider. If silent renewal cannot complete, the operator must sign in
again. The server continues to authorize every request independently of browser session storage.

## Environment

| Variable                                | Required           | Purpose                                       |
| --------------------------------------- | ------------------ | --------------------------------------------- |
| `COPALIBRE_JWKS_URI`                    | yes                | JWKS endpoint for native or external identity |
| `COPALIBRE_JWT_ISSUER`                  | yes                | Exact expected `iss`                          |
| `COPALIBRE_JWT_AUDIENCE`                | yes                | Exact expected `aud`                          |
| `COPALIBRE_JWT_PRIVATE_KEY_FILE`        | native deployments | Persistent RS256 private key file             |
| `COPALIBRE_JWKS_FILE`                   | native deployments | Matching persistent public JWKS file          |
| `COPALIBRE_JWKS_CACHE_MAX_AGE_MS`       | no (600000)        | Key cache lifetime / rotation overlap         |
| `COPALIBRE_JWT_CLOCK_TOLERANCE_SECONDS` | no (5)             | Clock-skew tolerance                          |

## The OpenAPI artifact

`packages/contracts/openapi/v1.json` is generated from the decorated controllers, so the spec cannot
drift from the implementation. CI regenerates it and fails if it differs from the committed copy,
then runs contract-lint (every route tagged; authenticated routes advertise bearer; public routes do
not; every route documented and typed) and a breaking-change check against the published artifact.
`packages/contracts` publishes TypeScript types generated from it — the public web shell serves the same file
via Scalar.
