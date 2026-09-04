# identity-visuals Specification Delta

## ADDED Requirements

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
