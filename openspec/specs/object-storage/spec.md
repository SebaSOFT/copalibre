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
- **WHEN** the adapter is configured against Garage, AWS S3, Cloudflare R2, Backblaze B2, or another S3-compatible provider
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
public object kind, distinct from the default: every other stored object remains reachable only
through its owning capability's own authorized path, never through an unauthenticated read. A
discipline background SHALL use `GET /objects/discipline-background-image?key=...`, and that
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

#### Scenario: Declared public kinds

- **WHEN** a capability declares person photos, club emblems or discipline background images as
  public
- **THEN** each is readable through its own reference-checked endpoint

#### Scenario: An undeclared module asset stays private

- **WHEN** an anonymous client requests a module asset its module did not declare public, through
  the public-serve path
- **THEN** the request is rejected, as report evidence is

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

### Requirement: An unreferenced stored object can be deleted
The system SHALL let an authorized operator delete a stored object that no entity currently references,
freeing its storage and removing its metadata record. An object still referenced by an entity — an
organization's current emblem, a person's current photo — SHALL NOT be deletable while that reference
stands; deletion SHALL be refused, naming what still references it.

#### Scenario: An unused upload is deleted
- **WHEN** an operator deletes an object that no entity currently references — for example, an emblem
  that was replaced and is no longer the organization's current one
- **THEN** the object is removed from storage and its metadata record no longer appears in the
  organization's storage usage

#### Scenario: A referenced object cannot be deleted
- **WHEN** an operator attempts to delete an object that is an entity's current emblem or photo
- **THEN** the deletion is refused, naming the entity that still references it

#### Scenario: Storage usage reflects a deletion
- **WHEN** an unreferenced object is deleted
- **THEN** the organization's storage usage total decreases by that object's size

### Requirement: A served discipline background belongs to its own module namespace
Serving a discipline background image SHALL require both that an installed descriptor references the
requested key and that the key sits under that descriptor's own `modules/<alias>/<version>/`
namespace. This holds independently of install-time validation, so a descriptor row written outside
the validated install paths cannot cause one discipline's imagery to be served for another's.

#### Scenario: A mis-attributed key is refused
- **WHEN** an installed descriptor references a background key naming a different module's
  `modules/<alias>/<version>/` namespace, and that key is requested
- **THEN** the request is refused as not found, and the stored bytes are not served

#### Scenario: A correctly attributed key is still served
- **WHEN** a descriptor references a background key under its own module namespace
- **THEN** the image is served normally

### Requirement: Emblem renditions are derived from the original and never authoritative

A raster emblem SHALL be servable at each width of a fixed list (64, 128 and 256 pixels) as a WebP rendition
derived from its stored original. The original SHALL stay the only source of truth: a rendition SHALL be
regenerated from it whenever missing, SHALL never be served once its original is replaced, and SHALL leave storage
together with its original. Without a width, the original SHALL be served unchanged.

#### Scenario: A list asks for a small emblem

- **WHEN** a client requests a club emblem with `width=128`
- **THEN** the response is a WebP image 128 pixels wide, keeping the original's aspect ratio and transparency,
  with the same immutable cache header the original carries

#### Scenario: No width asked

- **WHEN** a client requests an emblem without `width`
- **THEN** the response is the stored original, byte for byte, as before

#### Scenario: A width outside the list

- **WHEN** a client requests an emblem with a width that is not 64, 128 or 256
- **THEN** the response is 400 and names the accepted widths, and nothing is generated or stored

#### Scenario: The emblem is replaced

- **WHEN** an administrator uploads a new emblem for a club that had one
- **THEN** every rendition request returns a rendition of the new image, never of the old one

#### Scenario: The original is deleted

- **WHEN** an operator deletes a stored emblem that no entity references any more
- **THEN** its renditions are deleted from storage with it; like the existing thumbnail, they have no metadata
  record of their own

#### Scenario: A vector or animated emblem

- **WHEN** a client requests an SVG or GIF emblem with `width`
- **THEN** the response is the stored original, since it has no raster rendition

### Requirement: Renditions are made once, by the worker for new uploads and on first request for older ones

After its malware scan passes, the worker SHALL store every listed rendition of a new raster emblem. When a
requested rendition is missing, the serving route SHALL generate it once from the original, store it and serve it;
later requests SHALL read the stored rendition. A pending or failed original SHALL get no rendition.

#### Scenario: An emblem uploaded before renditions existed

- **WHEN** the first request for its 64-pixel rendition arrives
- **THEN** the rendition is generated, stored next to the original and served, and a second request reads the
  stored file without generating it again

#### Scenario: A new upload

- **WHEN** a new club emblem passes its malware scan
- **THEN** its three renditions exist in storage before any page requests them

#### Scenario: An emblem still being scanned

- **WHEN** a client requests a rendition of an emblem whose scan has not finished
- **THEN** the response is the same 202 the original returns while pending, and no rendition is generated
