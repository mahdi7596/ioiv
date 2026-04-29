## ADDED Requirements

### Requirement: Upload validation
The system SHALL accept only `.pdf`, `.doc`, `.docx`, and `.zip` uploads up to 20MB per file.

#### Scenario: Valid upload
- **WHEN** an authenticated user uploads an allowed file under 20MB for their application
- **THEN** the system stores the file and creates file metadata

#### Scenario: Oversized upload
- **WHEN** an uploaded file exceeds 20MB
- **THEN** the system rejects the upload

#### Scenario: Disallowed upload type
- **WHEN** an uploaded file has an unsupported extension or MIME type
- **THEN** the system rejects the upload

### Requirement: Local protected storage
The system SHALL store files under the configured upload directory and serve downloads only through an authorization-checked route.

#### Scenario: Owner downloads file
- **WHEN** the owning user requests a file from their application
- **THEN** the system returns the file

#### Scenario: Admin downloads file
- **WHEN** an active admin requests a submission file
- **THEN** the system returns the file

#### Scenario: Other user downloads file
- **WHEN** a user requests a file belonging to another user's application
- **THEN** the system returns HTTP 403
