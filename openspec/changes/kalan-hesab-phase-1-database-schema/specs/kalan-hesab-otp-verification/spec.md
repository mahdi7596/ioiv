## ADDED Requirements

### Requirement: KALAN_HESAB_VERIFICATION exists as a valid OtpPurpose enum value
The system SHALL include `KALAN_HESAB_VERIFICATION` as a value in the `OtpPurpose` PostgreSQL enum and Prisma-generated client, so that OTP codes can be issued and consumed exclusively for Kalan Hesab mobile verification without colliding with `USER_LOGIN` or `ADMIN_LOGIN` codes.

#### Scenario: Enum value is present after migration
- **WHEN** the `add_kalan_hesab_submission` migration is applied
- **THEN** `KALAN_HESAB_VERIFICATION` is a valid value for the `purpose` column on `OtpCode`

#### Scenario: OTP code with KALAN_HESAB_VERIFICATION purpose can be inserted
- **WHEN** an `OtpCode` row is inserted with `purpose = KALAN_HESAB_VERIFICATION`
- **THEN** the insert succeeds

#### Scenario: KALAN_HESAB_VERIFICATION codes are isolated from USER_LOGIN codes
- **WHEN** an `OtpCode` row exists for mobile `09123456789` with `purpose = KALAN_HESAB_VERIFICATION`
- **THEN** a lookup for the same mobile with `purpose = USER_LOGIN` returns no matching row (the `(mobile, purpose)` index enforces this separation)

---

### Requirement: Existing OtpPurpose values are not modified
The system SHALL NOT rename, remove, or otherwise alter the existing `USER_LOGIN` and `ADMIN_LOGIN` enum values when the migration is applied.

#### Scenario: USER_LOGIN and ADMIN_LOGIN remain valid after migration
- **WHEN** the migration is applied
- **THEN** existing `OtpCode` rows with `purpose = USER_LOGIN` or `purpose = ADMIN_LOGIN` are still valid and readable
