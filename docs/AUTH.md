# Authentication contract

Established with the API auth contract (stateless API nodes, security planes) and extended by `native-identity-provider`. CopaLibre uses a hybrid model:

1. **OIDC Providers:** External identity via stateless JWTs.
2. **Native Identity Provider:** Local email/password authentication using Argon2, and stateful Personal Access Tokens (PATs) for MCP and API integrations.

## Access tokens

API clients and personal access tokens authenticate with `Authorization: Bearer <token>`. A Control
browser session authenticates with the same JWT held in an `HttpOnly` session cookie (see
[Browser flow](#browser-flow)); the header wins when a request carries both. Either way the API
validates:

- asymmetric signature against the configured trust source: the local signing key for native
  sessions, or the provider's JWKS (`COPALIBRE_JWKS_URI`) for external OIDC sessions;
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
- A PAT is accepted only as `Authorization: Bearer`. One found in the session cookie leaves the request unauthenticated.

**Native Local JWTs**
The native login flow (`/api/auth/login`) issues one-hour JWTs using **RS256**. The API reads the
private key and matching public JWKS from `COPALIBRE_JWT_PRIVATE_KEY_FILE` and
`COPALIBRE_JWKS_FILE`, or from `jwt-private.pem`/`jwks.json` in its working directory or
`/var/lib/copalibre`. `copalibre init` creates these files on the host; ensure the API container
can read the matching pair through your deployment mounts. If absent, the API generates temporary
in-memory keys, so restarts invalidate existing tokens and replicas cannot reliably share identity.
The public keys are served at `/api/auth/jwks.json`. Every API route lives under `/api`. Native tokens use
`COPALIBRE_NATIVE_JWT_ISSUER` (default `http://localhost:8080`) and are verified against the API's
loaded local public key set. OIDC tokens use `COPALIBRE_JWT_ISSUER` and the remote JWKS. Both paths
enforce the same algorithm allowlist, audience, expiry and clock-tolerance rules. The API checks the
local signing key with a startup sign-and-verify probe and refuses to start if its configured key
pair, issuer or audience cannot verify that probe. `COPALIBRE_JWT_SECRET` is not a supported signing
setting.

Key fetching, caching, and rotation are handled by `jose`'s `createRemoteJWKSet`, which re-fetches on
an unknown `kid` — that is the key-rotation overlap the design requires, and it means a transient
JWKS outage doesn't immediately invalidate live sessions.

**A token in the query string is ignored.** `?access_token=…` leaves the request unauthenticated on
purpose: URLs leak into proxy logs, browser history, metrics, traces, screenshots and error reports.

`copalibre init --oidc-issuer <url> --oidc-client-id <id>`, or a yes to its identity provider question,
writes the OIDC variables and `COPALIBRE_CSP_IDENTITY_ORIGIN`. The web role's Content Security Policy
allows connections, frames and form posts to the application origin only; the identity provider's origin
must be added there, or the browser blocks sign-in and silent renewal. The Helm chart derives it from the
issuer. `copalibre doctor` reports a missing or mismatched value.

The audience remains required. External OIDC is enabled when `COPALIBRE_JWKS_URI` and
`COPALIBRE_JWT_ISSUER` are configured; native-only deployments can omit both and still verify local
sessions. The API refuses to start without the audience or a valid native signing probe, so a
misconfigured deployment fails closed instead of serving everything as public. The native issuer
defaults to `http://localhost:8080`; set it explicitly when native sessions use a public application
URL. Keep it distinct from the OIDC issuer in hybrid deployments.

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

`authenticated-interaction` and `admin-control` share this same transport and differ **only**
in authorization policy: a participant token and an organizer token look identical at the transport
layer.

Authentication failures return **401**; authorization failures return **403**. Once a token has
verified, a policy denial is never reported as an authentication problem.

Fine-grained permissions live in the policy layer, never in token claims — per the architecture doc,
"Do not place secrets, personal data, or large mutable permission matrices in the token."

## Browser flow

Control never holds the access token where a script can read it. Public pages share the origin with
Control, so anything a script could read — `localStorage`, `sessionStorage`, a readable cookie, a
module variable — a script on any page could read too.

- **Native sign-in.** `POST /api/auth/login`, `POST /api/auth/accept-invitation` and
  `POST /api/auth/refresh` set the session cookie (the access JWT), the CSRF cookie and the refresh
  cookie, and answer with session metadata only: `subject`, `scopes`, `expiresAt`, `method`.
- **OIDC sign-in.** The browser completes Authorization Code + PKCE with the provider, then posts the
  provider's access token once to `POST /api/auth/session` as `Authorization: Bearer` and drops it.
  The API verifies it like any Bearer token — refusing personal access tokens and native tokens —
  and sets the session and CSRF cookies. A token whose cookie would exceed 4096 bytes is refused
  with `auth-token-too-large`. Silent renewal (`prompt=none`) hands each fresh token over the same
  way. Register `/control/silent-renew-callback` alongside the ordinary callback at the provider.
- **After a reload.** Control calls `GET /api/auth/session`, which the cookie authenticates, to learn
  who is signed in, with which scopes and until when. A 401 means signed out.
- **Event streams.** `/events/control/*` is same-origin, so the browser sends the session cookie;
  no token appears in a header or a URL.
- **Sign-out.** `POST /api/auth/logout` revokes the native refresh credential, if any, and clears all
  three cookies, for native and OIDC sessions alike.

The session cookie is `HttpOnly`, `SameSite=Strict`, `Path=/`, has no `Domain`, and expires with the
token. Over HTTPS it is `Secure` and named `__Host-copalibre_session`; on a plain-HTTP installation it
is `copalibre_session`. `COPALIBRE_SESSION_COOKIE_SECURE` selects between the two for every cookie;
the [operator cookie list](self-hosting.md#cookies) states each cookie's purpose and lifetime.

**CSRF.** `SameSite=Strict` is the first defence. The second is a signed double-submit token: the
`copalibre_csrf` cookie holds a random value and its HMAC, keyed from the installation's native
signing key and bound to the session's token (its `jti`, or a hash of the token). Every
cookie-authenticated request with a method other than `GET`, `HEAD` or `OPTIONS` must send the same
value in `X-CopaLibre-CSRF`; otherwise the API answers 403 `auth-csrf`. A Bearer request carries no
ambient credential and needs no CSRF token.

The API stays stateless: the cookie is the JWT every node already verifies. Revoking an access token
before its expiry is not supported; the token's short lifetime bounds it.

## Environment

| Variable                                | Required                     | Purpose                                                 |
| --------------------------------------- | ---------------------------- | ------------------------------------------------------- |
| `COPALIBRE_JWKS_URI`                    | OIDC only                    | External identity provider JWKS endpoint                |
| `COPALIBRE_JWT_ISSUER`                  | OIDC only                    | Exact external-provider `iss`                           |
| `COPALIBRE_CSP_IDENTITY_ORIGIN`         | OIDC only (web role)         | Issuer origin the Content Security Policy allows        |
| `COPALIBRE_NATIVE_JWT_ISSUER`           | no (`http://localhost:8080`) | Exact expected `iss` for locally signed native sessions |
| `COPALIBRE_JWT_AUDIENCE`                | yes                          | Exact expected `aud`                                    |
| `COPALIBRE_JWT_PRIVATE_KEY_FILE`        | native deployments           | Persistent RS256 private key file                       |
| `COPALIBRE_JWKS_FILE`                   | native deployments           | Matching persistent public JWKS file                    |
| `COPALIBRE_JWKS_CACHE_MAX_AGE_MS`       | no (600000)                  | Key cache lifetime / rotation overlap                   |
| `COPALIBRE_JWT_CLOCK_TOLERANCE_SECONDS` | no (5)                       | Clock-skew tolerance                                    |
| `COPALIBRE_SESSION_COOKIE_SECURE`       | no (`true`)                  | `Secure` and the `__Host-` prefix on session cookies    |

## The OpenAPI artifact

`packages/contracts/openapi/v1.json` is generated from the decorated controllers, so the spec cannot
drift from the implementation. CI regenerates it and fails if it differs from the committed copy,
then runs contract-lint (every route tagged; authenticated routes advertise bearer; public routes do
not; every route documented and typed) and a breaking-change check against the published artifact.
`packages/contracts` publishes TypeScript types generated from it — the public web shell serves the same file
via Scalar.
