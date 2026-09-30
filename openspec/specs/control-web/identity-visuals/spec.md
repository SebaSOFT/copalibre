# identity-visuals Specification

## Purpose

Defines how organization identity images are presented across CopaLibre control and public surfaces.

## Requirements

### Requirement: Club and organization emblem image rendering
Uploaded club and organization emblems SHALL render as visible image elements across administrative and public surfaces, rather than falling back to initials-only avatar placeholders when an asset exists.

#### Scenario: Rendering club emblem in control panel
- **WHEN** an authenticated user opens the clubs list or club editor for a club that has an uploaded emblem asset
- **THEN** the view SHALL render the actual image asset rather than an initials fallback avatar

#### Scenario: Rendering organization emblem in shell header
- **WHEN** an authenticated user navigates the control panel for an organization with an uploaded emblem
- **THEN** the organization header SHALL display the uploaded emblem image

#### Scenario: Missing or unuploaded emblem fallback
- **WHEN** a club or organization has no uploaded emblem asset
- **THEN** the view SHALL gracefully display the initials fallback avatar

### Requirement: Uploaded identity images remove their background in the browser
When a user uploads an organization, club, tournament emblem, or person photo, the application SHALL automatically isolate the foreground in the browser before sending the resulting image to CopaLibre. The resulting image SHALL preserve transparent pixels through crop, confirmation, and upload. The original image SHALL NOT be sent to a third-party background-removal service.

#### Scenario: First image uses the background-removal model
- **WHEN** a user selects an emblem or person photo and the required model is not cached
- **THEN** the application shows model-download and processing progress, completes the removal before upload, and presents the transparent result in the existing crop/review flow

#### Scenario: A cached model processes a later image
- **WHEN** a user selects another emblem or person photo after model assets have been cached
- **THEN** the application removes the background in the browser without downloading the model again

#### Scenario: Browser cannot run background removal
- **WHEN** the browser lacks a required capability or processing fails
- **THEN** the application reports the failure and lets the user retry, cancel, or explicitly continue with the original image; it SHALL NOT silently upload the unprocessed image

#### Scenario: Confirmed image is uploaded
- **WHEN** the user confirms the crop/review of a processed image
- **THEN** the application uploads the transparent PNG to the existing CopaLibre media endpoint and sends no source image to a background-removal provider

### Requirement: Emblem display preserves its silhouette inside a square frame
The emblem display atom SHALL render an uploaded emblem in a 1:1 frame, center it, preserve its aspect ratio and alpha silhouette, and keep visible clearance between the foreground and chamfered frame edges. Its `size` property SHALL scale frame width and height proportionally. A missing or failed image SHALL retain the existing accessible placeholder behavior.

#### Scenario: Square emblem display at any supported size
- **WHEN** the emblem atom receives an image and a `size` value
- **THEN** its frame remains 1:1, its width and height scale proportionally from `size`, and the whole emblem is centered without distortion

#### Scenario: Wide or irregular emblem stays inside the chamfer
- **WHEN** an emblem has a wide, tall, or irregular transparent silhouette
- **THEN** the full visible foreground remains inside a padded safe area and is not cut off by the chamfered frame

#### Scenario: Missing emblem keeps its placeholder
- **WHEN** the emblem has no image or its image cannot be loaded
- **THEN** the atom shows its accessible placeholder within the same square frame

### Requirement: Person-photo display preserves the foreground subject
The person-photo display atom SHALL preserve its intended profile-photo shape while centering and containing a background-removed subject with sufficient inset to prevent visible clipping. It SHALL scale proportionally and SHALL NOT stretch the person to fill the frame.

#### Scenario: Person cutout remains fully visible
- **WHEN** a person photo with transparent background is displayed at any supported `size`
- **THEN** the subject remains centered, undistorted, and fully visible within the padded frame
