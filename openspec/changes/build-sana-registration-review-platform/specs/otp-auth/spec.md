## ADDED Requirements

### Requirement: Mobile OTP login
The system SHALL authenticate users and admins with a 4-digit mobile OTP that expires after 2 minutes.

#### Scenario: Existing user requests OTP
- **WHEN** an existing user submits a valid Iranian mobile number
- **THEN** the system stores a hashed 4-digit OTP, sends it through the SMS adapter, and returns the OTP verification step

#### Scenario: OTP expires
- **WHEN** a submitted OTP is older than 2 minutes
- **THEN** the system rejects verification and does not create a session

### Requirement: User registration after OTP
The system SHALL require company name, company national ID, company contact full name, and company contact national code for new user registration and create the user only after OTP verification succeeds.

#### Scenario: New user verifies with required registration fields
- **WHEN** a mobile number has no existing user and the submitted OTP plus all required registration fields are valid
- **THEN** the system creates the user with `companyName`, `companyNationalId`, `companyContactFullName`, and `companyContactNationalCode`, then starts a user session

#### Scenario: New user omits registration fields
- **WHEN** a mobile number has no existing user and verification omits any required registration field
- **THEN** the system rejects verification

### Requirement: Admin OTP login
The system SHALL allow OTP login only for active manually created admins.

#### Scenario: Active admin requests OTP
- **WHEN** an active admin submits their mobile number for admin login
- **THEN** the system sends an OTP and allows verification

#### Scenario: Non-admin requests admin OTP
- **WHEN** a mobile number does not belong to an active admin
- **THEN** the system rejects the admin OTP request

### Requirement: Signed sessions
The system SHALL create HTTP-only signed sessions that identify the subject and whether the session is for a user or admin.

#### Scenario: User session accesses dashboard
- **WHEN** a verified user visits the dashboard
- **THEN** the system recognizes the user session and allows access

#### Scenario: User session accesses admin area
- **WHEN** a normal user visits an admin route
- **THEN** the system denies access
