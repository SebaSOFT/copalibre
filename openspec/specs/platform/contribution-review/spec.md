# contribution-review Specification

## Purpose

This capability guides contributors in preparing changes and reviewing translations, interface copy and visual changes across CopaLibre's languages.

## Requirements

### Requirement: The repository has a general contributor guide and a translation review ledger

The repository SHALL contain a `CONTRIBUTING.md` covering licence, setup, the change workflow, checks
(linked to `AGENTS.md`), design and copy rules, translation corrections and private security
reporting. It SHALL also contain a translation review ledger with one section per interface language.

#### Scenario: Contributor fixes German

- **WHEN** a contributor corrects German strings
- **THEN** the same pull request updates the German section of the ledger with reviewer, date and
  coverage

#### Scenario: Security report

- **WHEN** a contributor finds a vulnerability
- **THEN** the guide and `SECURITY.md` direct them to GitHub private vulnerability reporting, not a public
  issue

### Requirement: Interface copy and visuals are reviewed by a person on every change

Every pull request that changes catalogue strings SHALL list them (key, language, old and new).
Every pull request that changes UI SHALL include before/after screenshots of each touched screen at
1440×900 and 390×844 (TV 1920×1080), in Spanish on the demo data. A CI check SHALL fail any pull
request that changes catalogue strings when its body omits or misstates them.

#### Scenario: Strings changed without a list

- **WHEN** a pull request changes three catalogue keys and its body omits or misstates them
- **THEN** the changed-strings check fails and prints the expected list
