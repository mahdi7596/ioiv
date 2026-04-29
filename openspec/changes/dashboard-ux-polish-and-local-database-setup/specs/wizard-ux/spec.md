## ADDED Requirements

### Requirement: Sticky wizard controls
The application wizard SHALL keep progress and primary navigation controls visible while users complete long forms.

#### Scenario: User scrolls a long step
- **WHEN** the user scrolls within a long wizard step
- **THEN** progress context and previous/save/next or payment actions remain accessible

### Requirement: Upload progress and recovery
Upload controls SHALL show progress, success, failure, retry path, and clear file constraints.

#### Scenario: User uploads file
- **WHEN** a user selects an allowed file
- **THEN** the UI shows upload progress and then a success state with the uploaded file name

#### Scenario: Upload fails
- **WHEN** upload fails because of file type, file size, network, or server error
- **THEN** the UI shows a non-technical error and a retry path without losing the rest of the form data

### Requirement: Year picker
Year fields SHALL use a constrained year picker rather than free text.

#### Scenario: User selects tax declaration year
- **WHEN** the user activates a year field
- **THEN** the UI presents valid year choices and stores the selected year

### Requirement: Field error states
Required field errors SHALL visibly mark the complete field group and provide recovery guidance.

#### Scenario: User attempts final submission with missing required uploads
- **WHEN** required wizard fields are incomplete
- **THEN** the relevant field groups show red error styling and clear helper text

### Requirement: Toast feedback
The app SHALL show toast feedback for important global success and failure events.

#### Scenario: Draft saves successfully
- **WHEN** a draft save completes
- **THEN** the user sees a concise success toast

#### Scenario: User logs in or registers
- **WHEN** OTP verification succeeds
- **THEN** the user sees a success toast or equivalent transition feedback before or during navigation
