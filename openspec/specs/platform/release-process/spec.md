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

A release SHALL be cut by opening a pull request from `develop` into `main` and merging it once its
CI is green, with no maintainer step beyond bumping the version before opening that pull request. A
pre-release version SHALL be released the same way and marked as a pre-release throughout.

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

#### Scenario: No separate release step

- **WHEN** a maintainer releases a bumped version
- **THEN** no manual tag creation, release step or image publish command is required

#### Scenario: What makes a pre-release

- **WHEN** a version carries a hyphen after its numeric core, for example `0.6.0-preview`
- **THEN** it is treated as a pre-release

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

### Requirement: Container release artifact
The release workflow `.github/workflows/release.yml` SHALL produce multi-architecture container images supporting both `linux/amd64` and `linux/arm64` architectures via QEMU and Docker Buildx, tagged with the active product release version.

#### Scenario: Running release image on ARM64 / Apple Silicon
- **WHEN** an operator pulls `ghcr.io/sebasoft/copalibre:1.2.6` on an Apple Silicon or ARM64 Linux host
- **THEN** Docker selects the native `linux/arm64` manifest without platform mismatch warnings or missing image errors.

### Requirement: Release documentation consistency
Release preparation SHALL review the changelog, product version references, installation and upgrade commands, deployment examples and translated help against the shipping implementation.

#### Scenario: Preparing a release branch
- **WHEN** a maintainer prepares a new product version from develop
- **THEN** all product manifests and deployment release pins agree
- **AND** the changelog covers changes since the preceding release
- **AND** source and binary installation procedures declare their actual prerequisites and working directories
- **AND** translated upgrade procedures preserve persistent data and honor installation version checks

### Requirement: A fresh dependency security audit gates release publication

Before creating a release tag or publishing release images, the release workflow SHALL audit every
workspace's direct and transitive dependencies against current registry and GitHub Dependabot
advisories. An unreviewed open advisory SHALL stop the workflow before any release artifact is
published. A registered unpatched advisory MAY pass only while its fix is unavailable; once one is,
the locked versions and root resolutions SHALL meet the patched floor.

#### Scenario: Vulnerable dependency blocks release publication
- **WHEN** the release workflow is preparing a version that does not have an existing release tag
- **AND** the recursive registry audit reports a security advisory, an open GitHub advisory is not in the reviewed register, or a published fix is not adopted in the lockfile and root resolutions
- **THEN** the workflow fails before creating the tag, pushing images, or creating the GitHub Release

#### Scenario: Reviewed unpatched advisory is recorded before release
- **WHEN** the release workflow finds an open advisory with no upstream patched version
- **AND** the advisory identity, package, dependency path, and runtime blast radius match an explicit reviewed register entry
- **THEN** the workflow records the advisory as reviewed and may continue only if every other security check passes

#### Scenario: Clean dependency graph allows release publication
- **WHEN** the release workflow is preparing a version that does not have an existing release tag
- **AND** the recursive dependency audit reports no security advisories and the GitHub advisory guard reports no unreviewed advisory or unadopted patched floor
- **THEN** the workflow may continue to create the tag and publish its images and GitHub Release

#### Scenario: Existing release tag remains an idempotent no-op
- **WHEN** the version already has a release tag
- **THEN** the release workflow completes as a no-op without auditing or publishing that version again

### Requirement: Each release records a manual screen-reader pass

Each release SHALL record a manual screen-reader pass with TalkBack and Chrome on Android, VoiceOver
and Safari on iOS, and NVDA and Firefox on Windows, over the public overview, match page, live match
console, registration review and login. Each result SHALL be recorded in the release checklist.

#### Scenario: Release without the pass

- **WHEN** a release checklist lacks a screen-reader result for one of the three combinations
- **THEN** the release is not tagged
