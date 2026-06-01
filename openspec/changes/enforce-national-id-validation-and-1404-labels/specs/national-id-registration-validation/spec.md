## ADDED Requirements

### Requirement: National ID length validation
The system SHALL accept `شناسه ملی شرکت` only when the normalized value contains exactly 10 or 11 digits.

#### Scenario: Ten digit national ID is valid
- **WHEN** a registering user enters a `شناسه ملی شرکت` containing 10 digits
- **THEN** the registration validation accepts the value

#### Scenario: Eleven digit national ID is valid
- **WHEN** a registering user enters a `شناسه ملی شرکت` containing 11 digits
- **THEN** the registration validation accepts the value

#### Scenario: Short national ID is rejected inline
- **WHEN** a registering user enters a `شناسه ملی شرکت` containing fewer than 10 normalized digits
- **THEN** the frontend shows an inline error beside the registration form field
- **AND** the user cannot complete registration with that value

#### Scenario: Long national ID is rejected inline
- **WHEN** a registering user enters a `شناسه ملی شرکت` containing more than 11 normalized digits
- **THEN** the frontend shows an inline error beside the registration form field
- **AND** the user cannot complete registration with that value

#### Scenario: Persian digits are normalized
- **WHEN** a registering user enters Persian or Arabic digits for `شناسه ملی شرکت`
- **THEN** the system validates and stores the equivalent ASCII digit value

### Requirement: National ID uniqueness
The system SHALL prevent more than one registered user from using the same normalized `شناسه ملی شرکت`.

#### Scenario: Unique national ID creates registration
- **WHEN** a new user completes OTP verification with a valid national ID that is not assigned to another user
- **THEN** the system creates the user with that normalized national ID

#### Scenario: Duplicate national ID is rejected
- **WHEN** a new user completes OTP verification with a valid national ID that is already assigned to another user
- **THEN** the system does not create a new user
- **AND** the frontend shows a Persian error explaining that the national ID has already been registered

#### Scenario: Concurrent duplicate registration is rejected
- **WHEN** two registration attempts submit the same normalized national ID at nearly the same time
- **THEN** at most one user is created with that national ID
- **AND** the losing registration receives the duplicate-national-ID error

#### Scenario: Existing duplicate records are detected before enforcement
- **WHEN** the implementation prepares to add a database uniqueness constraint for `User.companyNationalId`
- **THEN** existing repeated national ID values are identified for review or cleanup before the constraint is applied
