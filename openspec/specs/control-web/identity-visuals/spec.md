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
- **THEN** the view SHALL display the stored abbreviation in a neutral monogram tile, or the shield placeholder when no usable abbreviation exists

### Requirement: A missing emblem renders the entrant's abbreviation, never an invented label
When an entrant has no emblem, or its emblem fails to load, every surface SHALL render a neutral
chrome-ink monogram tile with the abbreviation from `abbreviationOf(team, club)`, in the mono face. It
SHALL NOT derive initials at render time and SHALL NOT truncate. With no abbreviation, or one longer
than six characters, the shield placeholder SHALL render instead.

#### Scenario: Club with a stored abbreviation and no emblem

- **WHEN** Concepción Patín Club has abbreviation "CPC" and no emblem
- **THEN** standings, match cards, bracket and TV show a chrome-ink tile reading "CPC" with the club's
  display name as its accessible name

#### Scenario: No abbreviation stored

- **WHEN** an entrant has neither a team nor a club abbreviation
- **THEN** the shield placeholder renders, and no initials are invented

#### Scenario: Emblem URL fails

- **WHEN** an uploaded emblem returns an error
- **THEN** the frame swaps to the monogram tile without JavaScript on public pages

#### Scenario: Team accent never colours the tile

- **WHEN** the organizer's team accent is set
- **THEN** the monogram tile still renders in chrome ink with structure border and paper text

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
The emblem display atom SHALL render an uploaded emblem in a 1:1 frame, center it, preserve its aspect ratio and alpha silhouette, and keep visible clearance between the foreground and chamfered frame edges. A missing or failed image SHALL retain the existing accessible placeholder behavior.

#### Scenario: Wide or irregular emblem stays inside the chamfer
- **WHEN** an emblem has a wide, tall, or irregular transparent silhouette
- **THEN** the full visible foreground remains inside a padded safe area and is not cut off by the chamfered frame

#### Scenario: Missing emblem keeps its placeholder
- **WHEN** the emblem has no image or its image cannot be loaded
- **THEN** the atom shows its accessible placeholder within the same square frame

### Requirement: Emblem frame scales its cut and padding with its size
The emblem display atom's `size` property SHALL scale frame width and height proportionally, and the frame's chamfer cut and inner padding SHALL scale with it, from a 4 px cut and 1 px padding at the smallest sizes to the full image-frame cut and 8 px padding from 48 CSS px.

#### Scenario: Square emblem display at any supported size
- **WHEN** the emblem atom receives an image and a `size` value
- **THEN** its frame remains 1:1, its width and height scale proportionally from `size`, and the whole emblem is centered without distortion

#### Scenario: A small emblem keeps its image
- **WHEN** the emblem atom renders at 16 CSS px
- **THEN** its frame cuts 4 px at the top-right and bottom-left corners, its padding is 1 px, and the image stays at least 12 px tall

#### Scenario: A large emblem keeps the full cut
- **WHEN** the emblem atom renders at 48 CSS px or larger
- **THEN** its frame cuts at the image-frame chamfer size (the smaller control size on Control) with 8 px padding, as before

### Requirement: Person-photo display preserves the foreground subject
The person-photo display atom SHALL preserve its intended profile-photo shape while centering and containing a background-removed subject with sufficient inset to prevent visible clipping. It SHALL scale proportionally and SHALL NOT stretch the person to fill the frame.

#### Scenario: Person cutout remains fully visible
- **WHEN** a person photo with transparent background is displayed at any supported `size`
- **THEN** the subject remains centered, undistorted, and fully visible within the padded frame

### Requirement: Background removal is proven to produce a cutout
The shipped build SHALL load a background-removal runtime whose JavaScript and WebAssembly come from the same
`onnxruntime-web` version, and an automated browser test SHALL prove that an image with an opaque background
comes out with transparent pixels. A test in which the operator keeps the original image SHALL NOT count as
proof that removal works.

#### Scenario: A real cutout in the production build
- **WHEN** the browser test uploads a fixture image with a uniform opaque background through the emblem flow on a
  production build, served under the production Content Security Policy
- **THEN** the worker reports a result, not an error, and the confirmed PNG contains transparent pixels where
  the fixture's background was

#### Scenario: The worker reports no runtime mismatch
- **WHEN** background removal runs in the browser test
- **THEN** no worker error and no console error mentions a missing runtime function such as
  `_OrtGetInputOutputMetadata`

#### Scenario: The fallback stays a separate path
- **WHEN** processing fails in a test that forces the failure
- **THEN** the operator can keep the original, and that test is separate from the cutout test

### Requirement: Emblems are requested at the size they are shown

Every emblem image on a public, TV or Control surface SHALL offer the listed renditions through `srcset` with a
`sizes` matching its displayed size, so the browser downloads the smallest rendition that is sharp at the screen's
density. Each emblem image SHALL declare its `width` and `height`, and on public and Control surfaces emblems
outside the first screen SHALL load lazily.

#### Scenario: The matches page on a phone

- **WHEN** the matches page loads at 412 CSS pixels wide and a density of 1.75, its club emblems shown at
  24 CSS pixels
- **THEN** each emblem the page downloads is a rendition no wider than 128 pixels, never the original, and the
  emblems requested on load weigh less than 200 KB together

#### Scenario: A large emblem stays sharp

- **WHEN** an emblem is drawn at more device pixels than a rendition is wide, as the hero on a dense screen or
  the TV
- **THEN** the browser picks a wider rendition or the original, never a smaller one stretched

#### Scenario: Emblems below the first screen

- **WHEN** a phone opens the matches page
- **THEN** emblems below the first screen are not requested until the reader scrolls toward them

#### Scenario: The fallback still works

- **WHEN** an emblem request fails
- **THEN** the entrant's abbreviation monogram shows, as it does today

### Requirement: TV emblems load at once

Every emblem image on a TV surface SHALL load at once, never lazily, since nobody scrolls a kiosk toward an emblem
and the TV baseline browser, Chromium 100, does not reliably request a lazy image near the bottom of the screen.

#### Scenario: Every TV emblem loads without scrolling

- **WHEN** a TV kiosk running Chromium 100 shows the standings, with a club row at the bottom edge of the screen
- **THEN** every emblem on the screen is requested and loaded without any scroll
