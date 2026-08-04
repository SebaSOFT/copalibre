## Why

CopaLibre's MVP release gate includes "self-hosted data ownership through reviewed CSV import and
stable-ID exports" as one of six capabilities that must ship together
(`../chaos-vault/50-research/copalibre-market-segment-feature-specification.md` TMS-010, and the
MVP-differentiation thesis in that same file). A self-hosted platform that cannot get bulk data in or
a durable copy of its own data out fails the product's core "self-hosted data ownership" invariant
("Self-hosted installations remain usable without a SebaSOFT-hosted account or a mandatory
third-party payment provider") regardless of how good its live-operations features are.

## What Changes

- **Reviewed CSV import pipeline**: operators upload a CSV up to 4 MiB; every upload is durably
  processed by the worker against the active discipline and tournament's declared import schema.
  That schema selects whether a row represents an individual participant or a team,
  surfaces row-level errors before commit, and requires explicit operator confirmation of the
  reviewed preview — never a silent all-or-nothing blind import.
- **Stable-ID exports**: operators can export tournament data (participants, results, standings) as
  CSV keyed by stable aliases, not raw UUIDs. Participant export is re-importable for correction;
  results and standings exports are read-only records because CopaLibre remains their calculation
  authority.
- Malformed or partially-invalid CSV input is rejected cleanly with actionable, row-level error
  messages — the system never commits a partial import that leaves the tournament in an inconsistent
  state.

## Capabilities

### New Capabilities
- `data-import-export`: reviewed CSV import with row-level validation and operator confirmation, and
  stable-ID CSV export of tournament data, supporting self-hosted data portability without a
  SebaSOFT-hosted account.

### Modified Capabilities
(none)

## Impact

- **New API**: `apps/api` import/export endpoints; every import routes through `apps/worker`,
  consistent with the "asynchronous work is durable" architectural principle.
- **New UI**: import/export actions on the A3 Registration Review and A1 Organization Dashboard
  control surfaces (upload, preview/error review, confirm; export trigger/download).
- **Consumes**: phase 4's persistence/audit layer (import is itself an audited operation), phase 2's
  domain validation rules.
