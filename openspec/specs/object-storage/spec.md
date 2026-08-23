# object-storage Specification

## Purpose

Provides the S3-compatible object-storage adapter, asynchronous media processing, and the real
backup/health checks the architecture doc names as a first-class stateful dependency, so every other
capability that stores a file (evidence, module assets, exports) has one real place to do it.

## Requirements

### Requirement: S3-compatible storage adapter
The system SHALL store binary objects through an S3-compatible adapter, with a Postgres metadata row
per object pointing at its storage location rather than the object's bytes living in the database.

#### Scenario: An uploaded object is retrievable by its metadata reference
- **WHEN** a caller stores an object through the adapter
- **THEN** the object is retrievable by the identifier returned at store time, and no copy of its bytes
  is written into a PostgreSQL column

#### Scenario: The adapter works against any S3-compatible endpoint
- **WHEN** the adapter is configured against MinIO, AWS S3, or another S3-compatible provider
- **THEN** put/get/delete behave identically, with no code path that only works against one provider

### Requirement: Single-node filesystem fallback
A self-hosted, single-node installation SHALL be able to run without a separate object-storage service,
using local filesystem storage as a documented fallback profile.

#### Scenario: Filesystem profile serves the same adapter contract
- **WHEN** an installation is configured for the local-filesystem storage profile instead of an
  S3-compatible endpoint
- **THEN** every caller of the adapter continues to work unchanged, unaware of which profile is active

### Requirement: Asynchronous media processing
Object validation, malware/content scanning, and — where the media type warrants it — thumbnail and
rendition generation SHALL run asynchronously through the durable worker/outbox path, never inline in
the request that accepted the upload.

#### Scenario: Upload response does not wait on processing
- **WHEN** a caller uploads an object
- **THEN** the upload request completes without waiting for validation, scanning, or rendition
  generation to finish

#### Scenario: A failed malware scan is surfaced, not silently dropped
- **WHEN** asynchronous scanning flags an object as unsafe
- **THEN** the object's status reflects the failure and it is not served to any consumer as valid,
  with the failure visible to an operator through the existing audit/notification path

### Requirement: Object-storage health check
`copalibre doctor` SHALL verify object storage with a real write/read/delete round-trip against the
configured endpoint or filesystem profile, not only that the configured URL is reachable.

#### Scenario: Doctor catches a misconfigured bucket or credential before first use
- **WHEN** `copalibre doctor` runs against a configured object-storage endpoint the installation cannot
  actually write to (wrong credentials, missing bucket, read-only mount)
- **THEN** doctor reports a clear failure naming the object-storage check, rather than passing on
  reachability alone

### Requirement: A capability may mark an object kind as publicly servable

An object-storage caller SHALL be able to expose a reference-checked read endpoint for a declared
public object kind (e.g. a person photo, a club emblem, a discipline's background image), distinct from
the default — every other stored object (report evidence, module assets not declared public) remains
reachable only through its owning capability's own authorized path, never through an unauthenticated
read. A discipline background SHALL use `GET /objects/discipline-background-image?key=...`, and that
endpoint SHALL serve only keys referenced by an installed discipline descriptor.

#### Scenario: A publicly servable object is retrievable by reference without authentication
- **WHEN** an anonymous client requests a stored object of a kind marked publicly servable, by its
  storage reference
- **THEN** the object's bytes and content type are returned, with no organization membership or
  capability check

#### Scenario: A non-public object kind refuses the same unauthenticated path
- **WHEN** an anonymous client requests a stored object of a kind not marked publicly servable (e.g.
  report evidence) through the public-serve path
- **THEN** the request is rejected; that object remains reachable only through its own capability's
  authorized endpoint

#### Scenario: A stored but unreferenced object is not public
- **WHEN** an anonymous client supplies a valid storage key that no installed discipline descriptor
  references to the discipline-background endpoint
- **THEN** the endpoint returns not-found without reading or exposing that object

#### Scenario: An unknown or deleted reference returns not-found, not an error
- **WHEN** a public-serve request names a storage reference that does not resolve to a stored object
- **THEN** the response is a not-found result, not a server error

#### Scenario: A discipline's background image is publicly servable
- **WHEN** an anonymous client requests a discipline's background image by its storage reference, on a
  public tournament page for that discipline
- **THEN** the image's bytes and content type are returned without authentication, the same way a club
  emblem or person photo already is

### Requirement: Per-organization storage usage is queryable
The system SHALL be able to report, for a given organization, the total bytes and object count of every
successfully processed stored object belonging to it, without requiring a schema migration beyond the
existing `object_metadata` record.

#### Scenario: Usage reflects only successfully processed objects
- **WHEN** an organization has objects in `pending`, `passed`, and `failed` status
- **THEN** the reported total bytes and object count include only the `passed` objects

#### Scenario: An organization with no stored objects reports zero
- **WHEN** an organization has never had an object stored
- **THEN** the usage report returns zero bytes and zero objects, not an error
