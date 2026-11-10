# platform/web-content-security-policy Specification

## Purpose
Defines the Content Security Policy the web application enforces on every page, so script, style, font,
image, connection and framing sources are restricted to the application's own origin plus the configured
identity origin, limiting what injected markup can load or send.

## Requirements

### Requirement: Every page of the web origin enforces one strict Content Security Policy

Every HTML response of the application origin, prerendered or server-rendered, SHALL enforce a Content Security Policy
in which scripts run only from the origin or by build-time hash, with no `unsafe-inline` or `unsafe-eval` for scripts,
and in which `connect-src`, `frame-src` and `form-action` allow only the origin and, when configured, the identity
provider's origin. `object-src` SHALL be `'none'` and `frame-ancestors` SHALL be `'self'`. No report-only stage SHALL
exist.

#### Scenario: Injected inline script

- **WHEN** a page contains an inline script that the build did not emit
- **THEN** the browser refuses to run it and reports a `script-src` violation

#### Scenario: Script sends data to another server

- **WHEN** a script on any page calls `fetch` or opens a WebSocket to a host other than the application origin or the
  configured identity provider
- **THEN** the browser blocks the request

#### Scenario: Every surface runs clean

- **WHEN** the e2e suite loads public pages, Control, TV and help under the shipped policy
- **THEN** no `securitypolicyviolation` event fires

#### Scenario: Another site frames a page

- **WHEN** a page of another origin embeds an application page in an iframe
- **THEN** the browser refuses to render it, while Control's own same-origin frames still render

### Requirement: The web role sends companion security headers on every response

Every response the web role serves SHALL include `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
`Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy` that disables camera, microphone,
geolocation and payment.

#### Scenario: A prerendered file

- **WHEN** a client requests a prerendered page or a bundled asset from the web role
- **THEN** the response carries all four headers

### Requirement: An external identity provider is allowed by explicit configuration

When external OIDC is configured, the policy SHALL allow the identity provider's origin, taken from
`COPALIBRE_CSP_IDENTITY_ORIGIN`, in `connect-src`, `frame-src` and `form-action`. When it is empty, the policy SHALL
name no origin other than the application's. `copalibre doctor` SHALL report when the issuer's origin differs from the
application origin and is not the configured identity origin.

#### Scenario: Native identity

- **WHEN** the issuer is the application origin and `COPALIBRE_CSP_IDENTITY_ORIGIN` is empty
- **THEN** the policy names no other origin and sign-in and silent renewal work

#### Scenario: External provider without the variable

- **WHEN** the issuer is `https://id.example` and `COPALIBRE_CSP_IDENTITY_ORIGIN` is empty
- **THEN** `copalibre doctor` reports that sign-in will be blocked and names the value to set
