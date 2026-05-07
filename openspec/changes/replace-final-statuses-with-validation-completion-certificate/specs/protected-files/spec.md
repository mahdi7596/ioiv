## ADDED Requirements

### Requirement: Protected validation certificate file
The system SHALL store validation certificate PDFs as protected application files and serve them only through authorization-checked download routes.

#### Scenario: Owner downloads certificate
- **WHEN** the owning user requests the validation certificate PDF for their application
- **THEN** the system returns the file

#### Scenario: Active admin downloads certificate
- **WHEN** an active admin requests a validation certificate PDF
- **THEN** the system returns the file

#### Scenario: Other user downloads certificate
- **WHEN** a user requests a validation certificate PDF belonging to another user's application
- **THEN** the system returns HTTP 403

#### Scenario: Inactive admin downloads certificate
- **WHEN** an inactive admin requests a validation certificate PDF
- **THEN** the system returns HTTP 403
