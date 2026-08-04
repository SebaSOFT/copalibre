## MODIFIED Requirements

### Requirement: Resource-ownership policy for participant scope
A participant-scoped identity's authorized scope SHALL be limited to its own registration, team
memberships, and reported results, and SHALL NOT extend to another participant's records or to any
operator/admin tool. A roster is match-scoped and does not grant participant ownership by itself.

#### Scenario: Participant cannot read another participant's private data
- **WHEN** a participant-scoped token requests another participant's registration details
- **THEN** the request is rejected with an authorization error

#### Scenario: Participant cannot access operator tools
- **WHEN** a participant-scoped token requests an operator-only endpoint (e.g. match finalization)
- **THEN** the request is rejected with an authorization error, regardless of tournament membership
