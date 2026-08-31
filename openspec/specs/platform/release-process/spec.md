# release-process Specification

## Purpose

Defines how CopaLibre's version is tracked and how a maintainer turns a reviewed `develop` branch into
a published, tagged, stable release with pull-able container images — the mechanism that did not exist
before this capability.

## Requirements

### Requirement: One version for the whole product

Every workspace `package.json`, and the repository root's, SHALL carry an identical version string —
there is one product version, not independently versioned packages, since every package ships together
in the same release images.

#### Scenario: Every package.json agrees

- **WHEN** every `package.json` in the repository (root, every `apps/*`, every `packages/*`) is
  inspected
- **THEN** their `version` fields are all identical

### Requirement: Merging to main is how a release is cut

A release SHALL be cut by opening a pull request from `develop` into `main` and merging it once its CI
is green — no separate manual release step, tag creation, or image publish command is required of the
maintainer beyond bumping the version before opening that pull request. When the version carries a
pre-release suffix (any string containing a hyphen after the numeric core, e.g. `0.6.0-preview`), the
release SHALL still be cut the same way, but SHALL be marked as a pre-release rather than a stable
release throughout.

#### Scenario: Merging a version-bumped develop into main publishes a release

- **WHEN** a pull request from `develop` (carrying a version bump not yet tagged) merges into `main`
- **THEN** a `v{version}` git tag is created, `ghcr.io/sebasoft/copalibre` and
  `ghcr.io/sebasoft/copalibre-web` are pushed tagged with the exact version, and a GitHub Release is
  created

#### Scenario: Merging to main without a version bump is a safe no-op

- **WHEN** a pull request merges into `main` and its version matches a `v{version}` tag that already
  exists
- **THEN** no new tag, image, or GitHub Release is created, and the release workflow completes without
  failing

#### Scenario: A pre-release version is marked as such on GitHub

- **WHEN** a version containing a pre-release suffix (e.g. `0.6.0-preview`) is released
- **THEN** the created GitHub Release is marked as a pre-release (`gh release create ... --prerelease`),
  not a stable release

### Requirement: Release images are published to GHCR

The runtime image and the static web image SHALL be published to `ghcr.io/sebasoft/copalibre` and
`ghcr.io/sebasoft/copalibre-web` respectively, each tagged with the exact released version. A stable
version (no pre-release suffix) SHALL additionally be tagged `latest`. A pre-release version SHALL NOT
move the `latest` tag, so a self-hoster pulling `latest` never silently receives a pre-release build.

#### Scenario: A specific version is pullable

- **WHEN** a release for version `0.2.0` has been cut
- **THEN** `ghcr.io/sebasoft/copalibre:0.2.0` and `ghcr.io/sebasoft/copalibre-web:0.2.0` are pullable
  images

#### Scenario: latest tracks the newest release

- **WHEN** a new version is released after a previous one, and the new version is stable (no
  pre-release suffix)
- **THEN** the `latest` tag on both images updates to point at the new version's image

#### Scenario: A pre-release version does not move latest

- **WHEN** a version carrying a pre-release suffix (e.g. `0.6.0-preview`) is released
- **THEN** `ghcr.io/sebasoft/copalibre:0.6.0-preview` and `ghcr.io/sebasoft/copalibre-web:0.6.0-preview`
  are pushed and pullable, but the `latest` tag on both images is left pointing at whatever it pointed
  to before
