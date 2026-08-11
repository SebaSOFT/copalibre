## Purpose

Lets an authenticated caller discover which organizations they hold an active role in, and what that
role is — a cross-organization lookup other surfaces (starting with the control panel's post-login
landing) build on, distinct from every existing organization route, which requires the organization to
already be known.

## Requirements

### Requirement: An authenticated caller can list organizations they belong to

The API SHALL provide an authenticated endpoint that, given only a verified bearer token, returns every
organization for which the caller holds a non-deleted, active role assignment, together with that role.

#### Scenario: Caller with one active assignment sees exactly that organization

- **WHEN** an authenticated caller with a single active role assignment requests their organization list
- **THEN** the response contains exactly one entry, naming that organization's alias, name, and the
  caller's role in it

#### Scenario: Caller with several active assignments sees all of them

- **WHEN** an authenticated caller holds active role assignments in three different organizations
- **THEN** the response contains exactly those three organizations, each with its own role

#### Scenario: Caller with no assignments sees an empty list

- **WHEN** an authenticated caller holds no role assignment in any organization
- **THEN** the response is an empty list, not an error

#### Scenario: A soft-deleted or inactive assignment is excluded

- **WHEN** a caller's role assignment in an organization has been soft-deleted, or is marked inactive
- **THEN** that organization does not appear in the response

### Requirement: The endpoint requires only a verified subject, no organization context

The API SHALL authorize this endpoint on the strength of a verified bearer token alone; it SHALL NOT
require the caller to already know or supply an organization alias, and SHALL NOT reject a caller solely
for having no organization role assignment yet.

#### Scenario: A freshly authenticated caller with zero memberships can still call it

- **WHEN** a caller presents a valid access token but has no `organization_role_assignments` row at all
- **THEN** the request succeeds with an empty list, rather than being rejected for lacking organization
  context
