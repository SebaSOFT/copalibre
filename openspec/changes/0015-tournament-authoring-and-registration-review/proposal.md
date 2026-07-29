## Why

This phase delivers the control-web UI for three P0 features from
`../chaos-vault/50-research/copalibre-market-segment-feature-specification.md`: TMS-001 (tournament
authoring/publication), TMS-002 (participants/teams/registration intake), and TMS-003 (check-in and
eligibility lock). Both screens already exist as static mockups —
`../copalibre-design-system-fixed/a2-tournament-setup-wizard/code.html` and
`.../a3-registration-review/code.html` — built on the shared `copalibre-system.css` tokens; this
phase wires them to the real domain model (`0002-domain-model-core`'s `DisciplineDescriptor →
TournamentRuleset → StageConfiguration` hierarchy) and API (`0005-api-auth-jwt-openapi-contract`) instead
of the mockups' static placeholder state.

## What Changes

- Build the **A2 Tournament Setup Wizard**: 4-step stepper (Name → Discipline → Format → Window) with
  a connecting progress bar; the Discipline step selects a versioned `DisciplineDescriptor` and shows
  its supported formats; the Format step is constrained to the 6 MVP formats from
  `../chaos-vault/30-processes/decisions/2026-07-27-copalibre-tournament-engine-mvp-and-result-
  authority.md` (single/double elimination, round robin, league, RR single-leg, RR home-and-away) —
  the wizard SHALL NOT offer a format outside that list; two toggle switches (Public Registration
  Open, Requires Check-in) with helper text; Back/Continue footer actions. On submit, the wizard
  writes a `TournamentRuleset` via the API, applying the `safe`/`requires_rebuild`/
  `blocked_after_results` mutation classification to any edit of an already-published tournament.
- Build the **A3 Registration Review**: sortable/filterable registrations table with breadcrumb-style
  context header, status filter (All/Pending/Accepted/Refused), bulk Approve/Deny/Export actions,
  row-level checkboxes, expandable accordion rows (keyboard-focusable) revealing contact/roster/
  experience detail and Message/Revoke actions, pagination footer.
- Implement the **check-in and eligibility lock** workflow (TMS-003): once a registration is checked
  in and the tournament's check-in window closes, further roster/eligibility edits to that entrant
  are blocked in the UI, consistent with the domain model's mutation-classification contract rather
  than an ad hoc UI-only lock.
- Wire both screens' write operations through the API's audit-producing command path (every mutating
  action carries actor, timestamp, prior state, resulting state per the product invariants).

## Capabilities

### New Capabilities
- `tournament-authoring`: organizers can create and publish a tournament through a guided,
  discipline-and-format-constrained wizard that only exposes the six MVP formats and applies the
  correct mutation classification to later edits.
- `registration-review`: organizers can review, approve, deny, and check in registrations in bulk or
  individually, with eligibility locked once check-in closes.

### Modified Capabilities
(none)

## Impact

- **New files/dirs**: `apps/web/src/control/pages/TournamentSetupWizard.tsx` + step components,
  `apps/web/src/control/pages/RegistrationReview.tsx` + `RegistrationRow`/`RegistrationDetail`
  components.
- **Depends on**: `0014-control-web-shell-and-org-dashboard` (shell, auth, API client),
  `0002-domain-model-core` (DisciplineDescriptor/TournamentRuleset types, mutation classes),
  `0005-api-auth-jwt-openapi-contract` (authoring/registration endpoints), `persistence-postgres-outbox-
  audit` (audit trail behind every write this phase performs).
- **No fixture-generation or seeding logic** — that begins in `tournament-engine-fixtures-mvp-
  formats`; this phase only captures the tournament/registration configuration those later phases
  consume.
