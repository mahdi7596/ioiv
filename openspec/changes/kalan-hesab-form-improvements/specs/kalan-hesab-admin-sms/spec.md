## MODIFIED Requirements

### Requirement: New submission SMS sent to one number only
When a new `KalanHesabSubmission` is saved, the system SHALL send an admin notification SMS to `09390649614` only. No other number SHALL receive a submission notification SMS.

#### Scenario: New submission triggers single admin SMS
- **WHEN** `POST /api/kalan-hesab/submit` succeeds and saves a submission
- **THEN** exactly one admin SMS is sent, to `09390649614`
- **THEN** no SMS is sent to `09224872163` or any other number

## ADDED Requirements

### Requirement: 09124872163 has admin panel access
The admin account with mobile `09124872163` SHALL exist in the database with role `KALAN_HESAB_ADMIN` and be able to log into `/kalan-hesab/admin` via OTP. This account SHALL NOT receive submission notification SMS.

#### Scenario: 09124872163 logs into admin panel
- **WHEN** `09124872163` requests an OTP at `/kalan-hesab/admin/login` and enters the correct code
- **THEN** the user is authenticated and redirected to `/kalan-hesab/admin`

#### Scenario: 09124872163 does not receive submission SMS
- **WHEN** a new form submission is created
- **THEN** no SMS is sent to `09124872163`
