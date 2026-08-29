---
title: Import and export
description: Bulk participant CSV import, and CSV/JSON export of participants, results, standings, and tournament configuration.
capabilities:
  - control-web/data-import-export
roles:
  - admin
---

## Import

Participants are bulk-imported by CSV from the
[registration review](/help/control/registration-review) screen. Every row is validated before anything
is written: a row that fails validation is reported with its row number and reason, and no row is
imported until the whole file is either accepted or corrected and re-uploaded — a partially-imported
file is not a state this screen produces. A CSV previously exported from this same installation
re-imports cleanly, so round-tripping a participant list (edit it in a spreadsheet, bring it back) is a
supported path, not an accident.

## Export

- **Participants**: individual or team rosters, by alias — reached from
  [registration review](/help/control/registration-review).
- **Results and standings**: a stage's calculated results and standings table, by alias — reached from
  [standings](/help/control/standings).
- **Tournament configuration**: the full ruleset, overrides, and custom scripts as JSON, from the
  organization dashboard — the same document a fresh installation could re-import to reproduce the
  tournament's rules, not its results.

Every export replaces an internal database identifier with the entity's public alias, so an exported file
never leaks an identifier nothing outside the installation should see.

## What you cannot do here

Importing results or standings is not supported — those are calculated, not entered, and the only way to
change one after the fact is the [audited correction workflow](/help/control/corrections).
