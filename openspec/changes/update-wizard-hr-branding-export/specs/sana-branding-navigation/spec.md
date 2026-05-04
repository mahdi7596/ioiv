## ADDED Requirements

### Requirement: Production service name
The system SHALL display the service name as `سامانه اعتبار سنجی سانا` anywhere the former full service name was used.

#### Scenario: Public surfaces show updated name
- **WHEN** a user views public, applicant, admin, payment, SMS, or metadata-facing service copy
- **THEN** the copy uses `سامانه اعتبار سنجی سانا`
- **AND** the copy does not use `سامانه اعتبارسنجی صندوق پژوهش و فناوری صنعت نفت (سانا)`

### Requirement: Updated visible logo
The system SHALL use the provided `IOIV.png` image for visible application logo surfaces.

#### Scenario: Login pages use updated logo
- **WHEN** an applicant or admin views a login page
- **THEN** the login card uses the provided `IOIV.png` logo asset
- **AND** the logo has meaningful accessible alternative text

#### Scenario: Authenticated shell uses updated logo
- **WHEN** an applicant or admin views an authenticated panel
- **THEN** the shared sidebar brand uses the provided `IOIV.png` logo asset

### Requirement: Updated favicon
The system SHALL use the provided `logo ghatre.png` image for browser icon surfaces.

#### Scenario: Browser loads icon metadata
- **WHEN** the application is loaded in a browser
- **THEN** metadata icon, shortcut icon, and apple icon references use the provided favicon asset

### Requirement: Production logout destination
The system SHALL redirect users to `http://sana.ioiv.ir/` after logout.

#### Scenario: User logs out
- **WHEN** an applicant or admin submits the logout form
- **THEN** the session is cleared
- **AND** the response redirects to `http://sana.ioiv.ir/`
