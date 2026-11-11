# platform/security-assurance Specification

## Purpose
Provides repeatable evidence that CopaLibre security controls resist misuse, records remediation and operational actions, and produces a redacted release-readiness verdict.

## Requirements

### Requirement: Complete control inventory

The security gate SHALL account for every requested security control with an owner, applicability rationale, scope, evidence and verdict. Verdicts SHALL distinguish pass, fail, not applicable and blocked. Missing evidence, scanner errors and incomplete required scope SHALL block approval rather than count as a pass.

#### Scenario: Unsupported feature is explicitly inapplicable

- **WHEN** repository and route inspection establish that no pricing or payment flow exists
- **THEN** the report records prices/payments as not applicable with inspected scope and reviewer
- **AND** adding such a flow invalidates that applicability record

#### Scenario: Tool fails or history is shallow

- **WHEN** a mandatory scanner fails, times out or cannot access required history
- **THEN** the gate returns a nonzero result and records the control as blocked

### Requirement: Authentication and authorization evidence

Security verification SHALL demonstrate rejection of invalid credentials and tokens, privilege escalation and unauthorized cross-organization access across API, private events, integration and admin surfaces. It SHALL preserve public projection access and supported native and OIDC flows.

#### Scenario: Authenticated principal lacks authority

- **WHEN** a valid principal requests another organization's protected record or an admin action without capability
- **THEN** access is denied server-side with no protected data disclosure or mutation

#### Scenario: Invalid JWT and browser credentials

- **WHEN** verification exercises wrong issuer, audience, signature, algorithm, missing expiry, expired JWTs and OIDC state/nonce/PKCE mismatches
- **THEN** authentication is rejected
- **AND** browser bundles, HTML, runtime configuration, source maps and durable browser storage contain no privileged API keys, client secrets, signing keys or persisted access JWTs

### Requirement: Password and credential lifecycle safety

Native passwords SHALL use salted, adaptive password hashes with reviewed production parameters. Recovery and refresh credentials SHALL be hashed at rest, bounded by expiry and single use, including concurrent requests. Credential reset, logout and refresh SHALL satisfy the documented session invalidation policy without promising immediate stateless JWT revocation.

#### Scenario: Recovery replay and concurrent consumption

- **WHEN** expired, wrong-purpose or previously consumed recovery tokens are submitted, or two requests concurrently consume the same token
- **THEN** invalid requests fail and at most one concurrent request succeeds
- **AND** persisted tokens and logs reveal no raw credentials

#### Scenario: Existing hashes remain usable

- **WHEN** password parameters are hardened
- **THEN** supported existing hashes still verify and are upgraded through the supported credential lifecycle

### Requirement: Cookie and CSRF safety

Cookie-authenticated mutations SHALL reject cross-site request forgery through explicit server-side origin checks and a supported anti-CSRF mechanism where needed. Production refresh cookies SHALL be Secure, HttpOnly, host-scoped, narrowly path-scoped and SameSite-protected; logout SHALL clear matching attributes. Bearer-only APIs SHALL not gain ambient cookie authority.

#### Scenario: Malicious site submits a credentialed mutation

- **WHEN** an attacker uses a cross-origin form or request against refresh, logout or another cookie-authenticated mutation
- **THEN** it cannot change session or application state, including from an untrusted same-site subdomain

#### Scenario: Legitimate native and OIDC sessions

- **WHEN** a supported browser completes native refresh/logout or OIDC login/renewal
- **THEN** the flow succeeds under the production cookie, CSP and origin policies

### Requirement: Edge and browser hardening

Production public surfaces SHALL require HTTPS at the trusted edge, restrict forwarded-header trust, enforce exact-origin CORS, and emit appropriate security headers including an enforced CSP and HSTS at the HTTPS edge. Rendering SHALL prevent stored, reflected and DOM XSS while retaining supported public, TV, help and control behavior.

#### Scenario: Forged proxy and origin headers

- **WHEN** a direct untrusted client spoofs forwarding headers or an unapproved origin
- **THEN** it cannot bypass HTTPS policy, rate limits, client-IP attribution or credentialed origin restrictions

#### Scenario: Browser executes untrusted content

- **WHEN** malicious names, aliases, module text, URL parameters or uploaded content reach public/control/TV/help output
- **THEN** no injected script executes and CSP violations are observable without leaking secrets
- **AND** static, SSR, error and event responses retain applicable headers

### Requirement: Server input and storage boundary safety

The server SHALL validate request bodies, parameters, queries and upload content before side effects. Database values SHALL be parameterized and dynamic identifiers allowlisted. Database and private object-storage interfaces SHALL require authorized least-privilege access and remain inaccessible through public deployment interfaces.

#### Scenario: Injection and mass assignment

- **WHEN** a client submits SQL metacharacters, unexpected privileged fields or malformed identifiers to read/write routes
- **THEN** the input is safely bound or rejected before side effects and cannot expand authority

#### Scenario: Upload evades browser restrictions

- **WHEN** a direct API client submits oversized, malformed, MIME-spoofed, path-traversing or resource-exhausting media or module assets
- **THEN** server limits reject it and no unvalidated object becomes publicly executable or available

#### Scenario: Runtime database principal

- **WHEN** runtime services connect with shipped production credentials
- **THEN** public clients cannot connect to database/storage administration ports
- **AND** runtime roles cannot perform migration or administrative actions beyond documented needs

### Requirement: Server-authoritative financial verification when applicable

Any discovered pricing or payment flow SHALL derive payable amounts, currency, entitlement and order identity from trusted server state. Payment completion SHALL require verified provider evidence, bound to that order, with replay-safe processing. Client-supplied prices or success redirects SHALL not grant paid status.

#### Scenario: Tampered amount or replayed payment

- **WHEN** a client alters amount/currency/order, fabricates success, or repeats an invalid or already processed provider notification
- **THEN** no incorrect charge, duplicate entitlement or false paid state is recorded

### Requirement: Production configuration and resource safety

Production readiness SHALL reject missing or placeholder required secrets, unsafe public URLs, exposed debug interfaces and invalid security limits. Public runtime configuration SHALL contain only explicitly public values. Distributed request limits SHALL cover authentication, anonymous reads, sensitive writes, events and uploads according to documented budgets.

#### Scenario: Unsafe production settings

- **WHEN** production starts with placeholder credentials, debug exposure, insecure public endpoints or invalid configured security limits
- **THEN** startup or readiness fails with redacted diagnostics naming affected settings
- **AND** explicit isolated local-development configuration remains usable

#### Scenario: Rate-limit evasion across replicas

- **WHEN** a source exceeds its documented budget through multiple replicas or spoofed forwarding headers
- **THEN** excess requests are bounded and receive the documented retry response without exhausting unbounded shared state

### Requirement: Security monitoring and response evidence

Security failures and suspicious patterns SHALL produce structured, redacted telemetry with correlation, outcome and attributable context. The release evidence SHALL demonstrate that a configured alert reaches a test receiver and identifies an operational owner and response procedure. Logging SHALL exclude passwords, credentials, sensitive payloads and recovery links.

#### Scenario: Repeated security failures trigger a response

- **WHEN** a bounded test generates repeated failed authentication or unauthorized admin access
- **THEN** a documented threshold triggers a deduplicated alert at the test receiver
- **AND** the evidence links redacted events, alert outcome and response owner

### Requirement: Dependency and artifact hygiene

Security review SHALL inspect direct/transitive application dependencies and shipped image packages, unused dependency candidates, public files and built artifacts. Confirmed unnecessary packages SHALL be removed after checking dynamic/build-time use. Exposed credentials, backups, configuration and debug artifacts SHALL block approval; reviewed public artifacts SHALL remain available.

#### Scenario: False unused dependency or intended public artifact

- **WHEN** a tool flags a dynamically loaded dependency or the reviewed public OpenAPI document
- **THEN** review records a narrow reason and evidence instead of deleting a required feature or suppressing an entire scan

#### Scenario: Public file probe

- **WHEN** probes request environment files, Git metadata, backups, internal manifests and nonpublic source maps through supported deployment paths
- **THEN** no private content is returned, including through encoded traversal paths

### Requirement: Historical secret incidents are resolved

Secret detection SHALL inspect tracked content, candidate artifacts and all available Git refs/history, recording scope without secret values. A confirmed compromised credential SHALL remain blocking until revocation, replacement and verification are evidenced. Historical matches SHALL remain identifiable after remediation without requiring history rewriting.

#### Scenario: Secret was deleted from current tree

- **WHEN** a confirmed credential is present only in an earlier reachable commit
- **THEN** it is reported with redacted location and fingerprint
- **AND** deletion alone cannot close the incident

#### Scenario: Provider operation is unavailable

- **WHEN** the implementation cannot verify provider-side revocation or deploy the replacement safely
- **THEN** it records the required operator action and leaves the incident blocked
- **AND** no report claims rotation completed

### Requirement: Reviewable findings and deterministic verdict

The gate SHALL emit machine-readable and Markdown reports identifying revision, image digests, tool/rule versions, timestamps, control evidence, findings, fixes and retest results. Unresolved critical/high findings, confirmed active secret incidents and failed/blocked mandatory controls SHALL fail. Exceptions SHALL be narrow, owner-approved, time-bounded and rejected when expired or mismatched.

#### Scenario: Fixed finding regresses

- **WHEN** a previously fixed issue recurs or its regression test fails
- **THEN** the report reopens it and the gate fails

#### Scenario: Accepted lower-risk issue

- **WHEN** a medium/low finding has documented owner approval, rationale, mitigation and unexpired deadline
- **THEN** the report retains it as accepted risk and can pass only if all mandatory controls pass
- **AND** exceptions cannot waive active compromised credentials or critical/high findings

#### Scenario: Review delivered

- **WHEN** the scoped security review completes
- **THEN** a Spanish report lists every requested control, inspected surfaces, reproducible redacted evidence, severity, fixes, tests, remaining risks, operational actions and final release decision
- **AND** it identifies limits of the review without claiming absence of all vulnerabilities
