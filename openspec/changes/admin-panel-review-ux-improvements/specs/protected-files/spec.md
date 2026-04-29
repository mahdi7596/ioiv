## MODIFIED Requirements

### Requirement: Local protected storage
The system SHALL store files under the configured upload directory and serve downloads only through an authorization-checked route, while admin-facing download links SHALL clearly identify the file's submission field context.

#### Scenario: Owner downloads file
- **WHEN** the owning user requests a file from their application
- **THEN** the system returns the file

#### Scenario: Admin downloads file
- **WHEN** an active admin requests a submission file
- **THEN** the system returns the file

#### Scenario: Admin sees contextual download action
- **WHEN** an active admin views uploaded files on a submission detail page
- **THEN** each file has a dedicated download action linked to the protected file route
- **AND** the file row identifies the document field that produced the upload

#### Scenario: Other user downloads file
- **WHEN** a user requests a file belonging to another user's application
- **THEN** the system returns HTTP 403
