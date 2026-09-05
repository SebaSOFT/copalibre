# tournament-profile Specification Delta

## ADDED Requirements

### Requirement: Tournament emblem asset management
The tournament profile SHALL support uploading, storing, retrieving, and removing an official tournament emblem.

#### Scenario: Uploading a tournament emblem
- **WHEN** an authorized organizer uploads an image file via POST /organizations/{orgId}/tournaments/{tournamentId}/emblem
- **THEN** the system SHALL validate the file format, store the asset in object storage, and update the tournament record with the emblem reference

#### Scenario: Deleting a tournament emblem
- **WHEN** an authorized organizer sends DELETE /organizations/{orgId}/tournaments/{tournamentId}/emblem
- **THEN** the system SHALL clear the emblem reference from the tournament record and remove the stored asset
