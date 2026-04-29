## ADDED Requirements

### Requirement: Reproducible local PostgreSQL
The project SHALL provide a documented local PostgreSQL setup that matches the app's development `DATABASE_URL`.

#### Scenario: Developer starts local database
- **WHEN** a developer runs the documented local database command
- **THEN** PostgreSQL is available with the configured database, username, password, and port

### Requirement: Local migration and seed
The project SHALL support running Prisma migration and seed commands against the local database.

#### Scenario: Developer migrates and seeds
- **WHEN** the local database is running and the developer runs migration and seed commands
- **THEN** the schema is created and an active admin exists for admin OTP login

### Requirement: Real local upload persistence
The application SHALL persist uploads and file metadata to the local database during normal development.

#### Scenario: User uploads after local setup
- **WHEN** a logged-in user with a draft application uploads an allowed file
- **THEN** the file is stored locally and an `ApplicationFile` row is created without database authentication errors
