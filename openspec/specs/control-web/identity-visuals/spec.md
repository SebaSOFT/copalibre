# control-web/identity-visuals Specification

## Purpose
Gives an operator a country selector with flags wherever a country is chosen, shows a small flag next
to every person's name the console already displays, and shows a person's photo (or a placeholder) on
their profile — the visual half of recording nationality and portrait/emblem images.

## Requirements

### Requirement: A country selector shows a flag and a localized name per option

Wherever the console lets an operator choose a country, it SHALL render a searchable selector listing
every ISO 3166-1 alpha-2 country, each option showing its flag and its name localized to the console's
active language.

#### Scenario: Operator searches by localized name
- **WHEN** an operator types part of a country's name in the selector, in the console's active language
- **THEN** matching countries are shown, each with its flag

#### Scenario: Selector reflects the console's active language
- **WHEN** the console's active language changes
- **THEN** the selector's country names re-render in the new language without changing the underlying
  stored country code

### Requirement: A person's name is shown with their nationality flag

Everywhere the console renders a person's name to an operator, it SHALL render that person's
nationality flag immediately alongside it, when a nationality is set. A person with no nationality SHALL
render with no flag and no placeholder in its place.

#### Scenario: A registered person's name shows their flag
- **WHEN** the registration review list renders a person who has a nationality set
- **THEN** their flag renders next to their display name

#### Scenario: A roster member's name shows their flag
- **WHEN** the match console's jersey grid renders a roster member who has a nationality set
- **THEN** their flag renders next to their jersey name

#### Scenario: A person with no nationality shows no flag
- **WHEN** a person with no nationality set has their name rendered anywhere in the console
- **THEN** no flag and no flag-shaped placeholder renders next to their name

### Requirement: A person's profile shows their photo or a placeholder

The console SHALL provide a person-profile view showing the person's photo when one is set, or a
placeholder when it is not, alongside their display name and nationality flag. The photo and its
placeholder SHALL both render inside the platform's standard 4:5 framed-image presentation
(`### Requirement: Uploaded images render inside a standard framed presentation`).

#### Scenario: A person with a photo shows it on their profile
- **WHEN** an operator opens the profile of a person who has a photo set
- **THEN** the uploaded photo renders inside the standard framed presentation

#### Scenario: A person with no photo shows a placeholder on their profile
- **WHEN** an operator opens the profile of a person who has no photo set
- **THEN** a placeholder renders in its place, inside the same framed presentation, distinguishable
  from a real photo

### Requirement: A team's jersey grid header shows its club's emblem

The match console's jersey grid SHALL render each team's name and its club's emblem (or a placeholder,
when the entrant has a club with no emblem set) in its team header, in place of a raw entrant identifier.
The emblem and its placeholder SHALL both render inside the platform's standard 4:5 framed-image
presentation.

#### Scenario: A team with a club emblem shows it in the jersey grid header
- **WHEN** the jersey grid renders a team panel for an entrant whose club has an emblem set
- **THEN** the team's name and its club's emblem render in that panel's header, inside the standard
  framed presentation

#### Scenario: A team with no club, or a club with no emblem, shows a placeholder
- **WHEN** the jersey grid renders a team panel for an entrant with no club, or a club with no emblem set
- **THEN** the team's name renders with a placeholder emblem, not a broken image, inside the same framed
  presentation

### Requirement: Clubs are managed from a control-panel screen that drives emblem upload

The control panel SHALL provide a club-management screen listing an organization's clubs and allowing an
authorized organizer to create a club, edit its name, alias and abbreviation, and upload or replace its
emblem. Uploading or replacing an emblem SHALL go through the platform's standard crop-before-upload step
(`### Requirement: An organizer crops and resizes an image before it is uploaded`). A club with no emblem
SHALL render a placeholder, never a broken image or an empty gap.

#### Scenario: Listing and creating clubs
- **WHEN** an authorized organizer opens the club-management screen
- **THEN** the organization's clubs are listed, and a new club can be created with a name, alias and
  abbreviation

#### Scenario: Uploading a club emblem
- **WHEN** an organizer selects an image for a club and confirms a crop
- **THEN** the cropped emblem is stored and rendered for that club wherever clubs are shown

#### Scenario: Replacing an existing emblem
- **WHEN** an organizer selects and crops a second image for a club that already has one
- **THEN** the club's emblem becomes the new cropped image

#### Scenario: A club without an emblem shows a placeholder
- **WHEN** a club with no emblem is rendered
- **THEN** a placeholder is shown

### Requirement: An organization's identity, including its emblem, is editable in the control panel

The control panel's organization settings surface SHALL allow an authorized organizer to edit the
organization's name and to upload or replace its emblem, alongside the existing language and timezone
settings. Uploading or replacing the emblem SHALL go through the platform's standard crop-before-upload
step.

#### Scenario: Uploading an organization emblem
- **WHEN** an authorized organizer selects an image for the organization and confirms a crop
- **THEN** the cropped emblem is stored and rendered for that organization

#### Scenario: An organization without an emblem shows a placeholder
- **WHEN** an organization with no emblem is rendered
- **THEN** a placeholder is shown

#### Scenario: An unauthorized subject cannot change organization identity
- **WHEN** a subject without organizer authorization attempts to change the organization's name or
  emblem
- **THEN** the change is refused

### Requirement: An organizer crops and resizes an image before it is uploaded

Wherever the control panel lets an organizer upload an image for an organization emblem, a club emblem,
or a person's profile picture, selecting a source file SHALL open a crop step before any upload request
is sent. The crop step SHALL let the organizer pan, zoom, and rotate the source image inside a fixed 4:5
(width:height) viewport, and SHALL NOT send an upload until the organizer confirms the crop. Cancelling
the crop step SHALL leave the previously stored image, if any, unchanged.

#### Scenario: An organizer crops an image before it uploads
- **WHEN** an organizer selects a source image for an organization emblem, a club emblem, or a person's
  profile picture
- **THEN** a crop step opens showing the source image inside a fixed 4:5 viewport, before any upload
  request is made

#### Scenario: An organizer adjusts pan, zoom, and rotation
- **WHEN** an organizer pans, zooms, or rotates the source image within the crop step
- **THEN** the crop viewport reflects each adjustment, and the eventual upload reflects the adjusted crop

#### Scenario: Confirming the crop uploads the cropped result
- **WHEN** an organizer confirms the crop step
- **THEN** the platform uploads the cropped, resized image — never the original, unmodified source file

#### Scenario: Cancelling the crop step uploads nothing
- **WHEN** an organizer cancels the crop step instead of confirming
- **THEN** no upload request is sent, and any previously stored image for that organization, club, or
  person is unchanged

### Requirement: A cropped upload is resized to the platform's profile-image dimensions

The crop step's confirmed output SHALL be encoded as a PNG image with a fixed 4:5 (width:height) aspect
ratio and a height of exactly 512 pixels: the selected crop area is scaled up or down as needed to fill
that fixed canvas exactly, regardless of the source image's own resolution. This encoded image, not the
original source file, SHALL be the one uploaded.

#### Scenario: A high-resolution source is downscaled to fit
- **WHEN** an organizer confirms a crop of a source image whose selected crop area exceeds 512 pixels in
  height
- **THEN** the uploaded image is scaled down to exactly 512 pixels in height, at a 4:5 aspect ratio

#### Scenario: A low-resolution source is upscaled to fit
- **WHEN** an organizer confirms a crop of a source image whose selected crop area is smaller than 512
  pixels in height
- **THEN** the uploaded image is scaled up to exactly 512 pixels in height, at a 4:5 aspect ratio

### Requirement: Uploaded images render inside a standard framed presentation

Every organization emblem, club emblem, and person profile picture — and every placeholder shown in
their place — SHALL render inside the platform's standard framed-image presentation: a fixed 4:5
(width:height) box, a bordered chamfered frame consistent with the platform's existing chamfer system,
and `object-fit: cover` scaling so an image whose stored aspect ratio does not exactly match 4:5 (for
example, one stored before this requirement existed) still fills the frame without distortion.

#### Scenario: An image narrower or wider than 4:5 still fills its frame
- **WHEN** an already-stored image whose aspect ratio is not exactly 4:5 is rendered
- **THEN** it fills the standard framed presentation via cropping, not distortion or letterboxing

#### Scenario: The frame renders identically for a real image and its placeholder
- **WHEN** a placeholder renders in place of a missing image
- **THEN** it renders inside the same fixed 4:5 chamfered frame as a real image would

### Requirement: The platform rejects an uploaded image outside the profile-image dimension contract

An image upload request for an organization emblem, a club emblem, or a person's profile picture SHALL
be refused if its decoded pixel dimensions are not exactly 410×512 (within a documented rounding
tolerance). This applies to every caller of the upload endpoint, not only the control panel's own crop
step.

#### Scenario: An upload matching the contract is accepted
- **WHEN** an upload request's decoded image is 410×512 pixels, within tolerance
- **THEN** the upload is accepted and stored

#### Scenario: An upload violating the contract is refused
- **WHEN** an upload request's decoded image does not match 410×512 pixels, outside tolerance
- **THEN** the upload is refused with a message stating the required dimensions, and nothing is stored
