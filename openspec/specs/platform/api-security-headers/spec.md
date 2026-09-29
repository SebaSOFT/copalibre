# platform/api-security-headers Specification

## Purpose
Sets baseline HTTP security response headers on every `apps/api` response, independent of any
single endpoint's own behavior, as defense-in-depth against MIME-sniffing, clickjacking, and
referrer leakage.

## Requirements

### Requirement: API responses carry baseline security headers
Every response `apps/api` serves, success or error, SHALL include `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, and `Referrer-Policy: strict-origin-when-cross-origin`.

#### Scenario: A successful API response carries the baseline headers
- **WHEN** a client makes any request to `apps/api` that returns a 2xx response
- **THEN** the response includes `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and
  `Referrer-Policy: strict-origin-when-cross-origin`

#### Scenario: An error response also carries the baseline headers
- **WHEN** a client makes a request that `apps/api` rejects with a 4xx or 5xx response
- **THEN** the response still includes `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  and `Referrer-Policy: strict-origin-when-cross-origin`
