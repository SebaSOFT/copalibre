## Why

CopaLibre's security model draws a hard line, per
`../chaos-vault/20-knowledge-domains/copalibre-platform-architecture.md` "Security planes": a
participant's authorized scope is "their own records, never another participant's or an operator's
tools," and admin/control-plane actions require stronger scopes and immutable audit. Without an
explicit role taxonomy and an enforced resource-ownership policy, that boundary is just prose. The
A7 "Roles & Permissions" mockup
(`../copalibre-design-system-fixed/a7-roles-permissions/code.html`) already establishes the initial
taxonomy (System Admin / Head Referee / Broadcaster / Observer) and an invite flow; this phase makes
that taxonomy real on both the API and control-UI sides.

## What Changes

- Backend RBAC taxonomy: `admin` / `referee` / `broadcaster` / `viewer` roles, assignable per
  organization, distinct from the match-scoped capability grants used by
  `0017-live-match-console-a4` (a referee role is necessary but not sufficient for a specific match's
  finalize capability — see that phase's authorization model).
- Resource-ownership policy enforcement: a participant-scoped token may only read/act on its own
  registration, roster, and reported results — never another participant's or an operator surface.
- A7 control UI: user table (avatar-initials, per-row role selector, Active/Inactive toggle,
  edit/delete actions), and an "Add Recipient" invite modal (email, role, initial status).
- Invite flow: an invited user is provisioned with the selected role and an initial active/inactive
  status, without requiring a SebaSOFT-hosted account (self-hosted data-ownership principle).

## Capabilities

### New Capabilities
- `roles-permissions`: organization-scoped role assignment (admin/referee/broadcaster/viewer), an
  invite flow, and enforced resource-ownership policy separating participant self-service scope from
  operator/admin scope.

### Modified Capabilities
- `live-match-console` (from `0017-live-match-console-a4`): its match-scoped capability checks (event
  entry, clock control, lineup selection, finalize) now resolve against the role/permission model
  introduced here rather than an assumed generic organizer role. *(Only include this delta if
  `0017-live-match-console-a4` has already landed; otherwise coordinate ordering — this phase's role model
  is a prerequisite for that phase's authorization checks, not the reverse, so implementation order
  should place `0018-roles-permissions-rbac` before or alongside `0017-live-match-console-a4`.)*

## Impact

- **New UI**: `apps/web` `/control/{organization}/roles` route (A7 screen).
- **New API**: role-assignment and invite endpoints in `apps/api`, policy-layer changes affecting
  every authenticated endpoint's authorization check.
- **Security-critical**: this phase's integration tests are explicitly adversarial (authorization
  bypass attempts) because a defect here is a security defect, not a functional one.
