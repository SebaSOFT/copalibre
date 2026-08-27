# platform/api-rate-limiting Specification

## Purpose
Protects explicitly security-sensitive API operations with one rate-limit policy shared by all API
replicas in an installation while preserving the ordinary API request path's performance.

## Requirements

### Requirement: Installation-wide security-sensitive rate limits

The system SHALL enforce each explicitly security-sensitive API rate-limit policy across all API
replicas in one installation. Requests that share a policy, route, and tracker identity SHALL
consume the same configured limit regardless of the replica that receives them.

#### Scenario: Requests arrive through different replicas

- **WHEN** requests for one security-sensitive operation arrive through multiple API replicas with
  the same tracker identity during one configured window
- **THEN** the combined request count is evaluated against one configured limit and requests beyond
  that limit receive a 429 response.

#### Scenario: Different tracker identities remain independent

- **WHEN** two tracker identities call the same security-sensitive operation during one window
- **THEN** each identity consumes only its own configured limit.

#### Scenario: Window expires

- **WHEN** the configured rate-limit window expires without an active block
- **THEN** the tracker identity receives a fresh configured allowance.

#### Scenario: Ordinary API route uses the local safety net

- **WHEN** a route has no explicit security-sensitive rate-limit policy
- **THEN** its existing permissive local safety-net behavior remains unchanged and it does not make
  a shared-counter database write.

### Requirement: Shared rate-limit response compatibility

The system SHALL preserve the configured limit, HTTP 429 response, and retry information for a
security-sensitive operation when its enforcement becomes installation-wide.

#### Scenario: Security-sensitive limit exceeded

- **WHEN** a tracker identity exceeds a configured shared limit
- **THEN** the response is HTTP 429 and communicates the remaining block duration using the same
  retry contract as the existing API throttle.

#### Scenario: Authenticated tracker identity

- **WHEN** an authenticated request reaches a security-sensitive operation
- **THEN** its shared limit is keyed by the authenticated principal rather than source IP.

#### Scenario: Unauthenticated tracker identity

- **WHEN** an unauthenticated request reaches a security-sensitive operation
- **THEN** its shared limit is keyed by source IP and does not share an allowance with an
  authenticated principal.
