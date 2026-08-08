# module-distribution Specification

## Purpose

Lets the community author disciplines and tournament profiles and lets operators install them by name
from a curated, reviewed source — safely, and without the project accepting executable code.

## Requirements

### Requirement: Module package format
A module SHALL be a directory containing a manifest declaring its kind (`discipline` or
`tournament-profile`), the artifact document, and optionally media assets.

#### Scenario: A discipline module is recognised
- **WHEN** a directory containing a manifest of kind `discipline` and a descriptor document is inspected
- **THEN** it is identified as a discipline module with its attribution and version

#### Scenario: A malformed manifest is rejected
- **WHEN** a directory lacks a manifest or declares an unknown kind
- **THEN** it is rejected as not a valid module

### Requirement: Installation names a module, not a location
The CLI SHALL install a module by alias and version, resolved against the project's curated module
repository, and an operator SHALL NOT need to know where a module is hosted to install it.

#### Scenario: A published module installs by name
- **WHEN** an operator runs the module-add command with a module alias
- **THEN** the module is resolved against the curated repository, fetched, validated and imported, and
  appears in the installed module list

#### Scenario: A version range resolves to the highest satisfying release
- **WHEN** an operator installs an alias with a semver range rather than an exact version
- **THEN** the highest published version satisfying that range is installed

#### Scenario: An invalid module is refused without partial import
- **WHEN** a fetched module fails any validation check
- **THEN** the import is refused and no artifact, asset or database row from that module remains

### Requirement: An alternate source is opt-in and explicit
Installing from any source other than the curated repository SHALL require an explicit per-invocation
flag or a configured allow-list entry, and SHALL never be the default or an implicit fallback.

#### Scenario: An unconfigured alternate source is refused
- **WHEN** an operator names a source that is neither the curated repository nor allow-listed, without
  the explicit flag
- **THEN** the installation is refused, stating that an alternate source must be opted into

#### Scenario: A private module installs from an allow-listed source
- **WHEN** an organization allow-lists its internal module repository and installs a module from it
- **THEN** the module is fetched from that source and passes exactly the validation a curated module
  passes

#### Scenario: The source of an installed module is recorded
- **WHEN** installed modules are listed
- **THEN** each one states whether it came from the curated repository or an alternate source

### Requirement: Reserved aliases cannot be claimed or shadowed
A submission to the curated repository SHALL be refused when it claims an alias reserved by the
first-party catalogue, and installation SHALL be refused when the alias is already held by a module of
different attribution.

#### Scenario: A submission claiming a reserved alias fails review
- **WHEN** a pull request proposes a module whose alias the first-party catalogue reserves
- **THEN** the repository workflow fails naming the reserved alias, and the module is never published

#### Scenario: An alternate-source module cannot shadow an installed one
- **WHEN** an operator installs a module from an allow-listed source under an alias already held by a
  module of different attribution
- **THEN** the installation is refused, naming the alias and the attribution of the module holding it,
  and the installed module is left untouched

### Requirement: Validation is identical at import and in review
The same validation SHALL run when importing a module and when a pull request proposes one: manifest
and artifact schema, registry references, ruleset compilation, and asset limits.

#### Scenario: A pull request proposing an uncompilable descriptor fails review
- **WHEN** a proposed discipline parses but produces an invalid effective ruleset
- **THEN** the module-repository workflow fails, naming the compilation error

#### Scenario: A module referencing unregistered vocabulary is rejected
- **WHEN** a module references an action, condition or parameter absent from the published registry
- **THEN** validation fails identifying the unregistered identifier

#### Scenario: Assets exceeding declared limits are rejected
- **WHEN** a module includes an asset outside the permitted formats, dimensions or size
- **THEN** validation fails identifying the offending asset

### Requirement: Core version compatibility is declared and enforced
A module SHALL declare the CopaLibre versions it supports as a semver range, and installation SHALL
be refused when the running version does not satisfy it. The same compatibility check SHALL be
reusable against a version the installation is not yet running, so a pre-upgrade check and
post-install re-verification evaluate compatibility identically to installation itself.

#### Scenario: A module needing a newer core is refused
- **WHEN** a module declares a range the running CopaLibre version does not satisfy
- **THEN** installation is refused, naming the required range and the running version

#### Scenario: A range is resolved to the highest satisfying published tag
- **WHEN** an operator installs a module specifying a semver range rather than an exact tag
- **THEN** the highest published tag satisfying that range is installed

#### Scenario: The same check evaluates a not-yet-running target version
- **WHEN** a caller evaluates an installed module's declared range against a target CopaLibre
  version that is not the version currently running
- **THEN** it reports the same incompatibility (or compatibility) that installation, `module verify`,
  and a pre-upgrade check would each report for that pairing of module and version

### Requirement: Assets are imported into object storage
Media assets SHALL be stored through the object-storage adapter, with the database holding references.

#### Scenario: Assets survive a restore
- **WHEN** an installation is restored from backup
- **THEN** imported module assets are present and referenced correctly

#### Scenario: Assets are reachable from every replica
- **WHEN** a second application replica serves a request for a module asset
- **THEN** it resolves without requiring the module directory on that host

### Requirement: Unsatisfied capabilities are reported at install
Installing a profile whose required capabilities no installed discipline provides SHALL report them and
allow an explicit override.

#### Scenario: A profile installs ahead of its discipline
- **WHEN** an operator installs a profile with unsatisfied required capabilities and confirms the override
- **THEN** the profile is installed and the unsatisfied requirements are recorded

### Requirement: Installed modules can be re-verified and retired
The CLI SHALL re-run validation against installed modules and report versions no started tournament
references.

#### Scenario: Drift against the registry is detected
- **WHEN** an installed module references an identifier removed from the registry by a core upgrade
- **THEN** the verify command reports it

#### Scenario: A version in use is not offered for retirement
- **WHEN** a started tournament references a discipline version
- **THEN** that version is excluded from the retirable list

### Requirement: A module can be scaffolded, validated, and run locally before submission

`copalibre module scaffold <kind> <alias>` SHALL produce a module package (`manifest.json`,
`artifact.json`, an `assets/` directory) that passes the same validation `module add`/`module
verify` apply, packaged as a tagged local Git repository in the layout `fetchModule` already expects
(`<kind-plural>/<alias>/`, tag `<alias>@<version>`). `copalibre module validate-local <path>` SHALL
run that same validation directly against a local directory, without fetching anything.

#### Scenario: A scaffolded module validates without modification

- **WHEN** `copalibre module scaffold` produces a module package
- **THEN** `copalibre module validate-local` run against that package reports it valid, with no
  edits made to the generated files

#### Scenario: A scaffolded module installs through the existing install path

- **WHEN** an operator runs `copalibre module add <alias> --source
  file:///path/to/a/scaffolded/module` against an allow-listed local source
- **THEN** the module installs into the local database through the same code path any other module
  installation uses — no separate local-install mechanism exists

### Requirement: A local module can be submitted to copalibre-modules as a pull request

`copalibre module submit <path>` SHALL fork `copalibre-modules`, copy the local module package into
the fork under `disciplines/<alias>/` or `profiles/<alias>/` on a new branch, push it, and open a
pull request against the upstream repository.

#### Scenario: Submission never modifies the local module package

- **WHEN** `copalibre module submit` runs against a local module package
- **THEN** the local package's `manifest.json`/`artifact.json`/`assets/` are copied, not moved or
  edited, and remain usable for a further local `module add --source` install afterward
