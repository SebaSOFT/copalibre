# control-web/descriptor-authoring Specification

## Purpose
Lets an administrator author a discipline descriptor or a tournament profile through a guided surface in
the control panel, producing a module package that installs and contributes upstream through the paths
that already exist, so extending CopaLibre to a new sport does not require hand-writing JSON.

## Requirements

### Requirement: A discipline can be authored without writing a document by hand
The control panel SHALL offer a guided surface that authors a complete discipline descriptor —
participant types, roster constraints, segment types, statistics and their aggregation modes, event
definitions, available formats, scoring inputs and the win condition — and produces a document that
passes the same validation an installed module passes.

Every decision the surface presents SHALL be explained on the terms the authoring-decision contract
already requires: what the choice causes during a competition, not what it is named. A builder that asks
unexplained questions is a document editor with more steps, and the operator who needs the builder is
precisely the one who cannot answer an unexplained question.

Authoring SHALL be installation-level authority: a discipline changes what every organization in the
installation can run.

#### Scenario: An administrator authors a discipline end to end
- **WHEN** a super administrator completes the discipline builder for a sport not in the catalogue
- **THEN** a descriptor document is produced that passes the same validation an installed module passes,
  with no file edited by hand

#### Scenario: Every authored decision is explained
- **WHEN** the builder presents any decision
- **THEN** it shows what that choice causes during a competition, on the same contract the tournament
  authoring wizard follows

#### Scenario: An incomplete discipline is refused with the reason named
- **WHEN** an author declares a statistic with no aggregation mode, or a win condition referencing an
  event the discipline does not declare
- **THEN** the surface refuses to produce the document, naming the offending declaration rather than
  reporting that the document is invalid

#### Scenario: Authoring requires installation authority
- **WHEN** an organization administrator without installation authority opens the discipline builder
- **THEN** access is refused, because authoring a discipline changes what every organization can run

### Requirement: A tournament profile can be authored against an installed discipline
The control panel SHALL offer a guided surface that authors a tournament profile — its stages, each
stage's format, and how each stage qualifies into the next — against a discipline already installed, and
SHALL refuse a stage whose format that discipline does not declare.

#### Scenario: A multi-stage profile is authored
- **WHEN** an administrator authors a profile declaring a group stage feeding a knockout stage
- **THEN** a profile document is produced that validates, and creating a tournament from it pre-creates
  both stages

#### Scenario: A format the discipline does not support is refused
- **WHEN** an author selects a stage format the chosen discipline does not declare
- **THEN** the selection is refused, naming the discipline and the formats it does declare

### Requirement: An authored module carries its authorship, description and translations
The authoring surface SHALL capture a module's author, licence and attribution, a description of what
the module is, and its localized strings. English SHALL be required; every other supported language
SHALL be optional and SHALL fall back rather than block publication.

An authored module SHALL NOT be publishable with attribution the surface invented on the author's
behalf.

#### Scenario: Authorship is authored, never inferred
- **WHEN** an administrator completes a module for publication
- **THEN** the author, licence and attribution are values they supplied, and the surface refuses to
  proceed without them rather than defaulting to the installation's own identity

#### Scenario: A partially translated module publishes
- **WHEN** an author supplies English and two other languages
- **THEN** the module is publishable and renders in those three languages, falling back to English for
  the rest

#### Scenario: English is required
- **WHEN** an author supplies a name or description with no English value
- **THEN** publication is refused, naming English as the required language

### Requirement: An authored module installs and contributes through the existing paths
A module produced by the authoring surface SHALL install through the same code path any other module
installation uses, and SHALL be contributable upstream through the same submission flow the command line
already provides. No separate install or submission mechanism SHALL exist for authored modules.

#### Scenario: An authored module installs through the normal path
- **WHEN** an administrator installs a module they authored
- **THEN** it installs through the same path an externally sourced module uses, and is indistinguishable
  afterward except by its attribution

#### Scenario: An authored module is contributed upstream
- **WHEN** an administrator chooses to contribute an authored module
- **THEN** the existing submission flow opens a pull request against the curated repository, and the
  local package remains installed and usable

#### Scenario: An authored module cannot claim a reserved alias
- **WHEN** an author gives a module an alias the first-party catalogue reserves
- **THEN** the alias is refused at authoring time, naming the reservation, rather than failing later at
  submission

### Requirement: An authored discipline can be revised into a new version
An authored discipline or profile SHALL be revisable into a new version, and a version a started
tournament references SHALL NOT be altered underneath it.

#### Scenario: A revision produces a new version
- **WHEN** an administrator revises an authored discipline
- **THEN** a new version is produced and installed alongside the previous one, which remains readable

#### Scenario: A referenced version is protected
- **WHEN** an administrator attempts to alter a version a started tournament references
- **THEN** the attempt is refused, naming the tournaments holding it, and revising into a new version is
  offered instead
