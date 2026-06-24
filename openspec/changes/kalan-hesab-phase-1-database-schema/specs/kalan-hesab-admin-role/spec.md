## ADDED Requirements

### Requirement: KALAN_HESAB_ADMIN exists as a valid UserRole enum value
The system SHALL include `KALAN_HESAB_ADMIN` as a value in the `UserRole` PostgreSQL enum and Prisma-generated client, so that `Admin` rows can be assigned this role to distinguish Kalan Hesab admins from IOIV admins (`ADMIN`, `SUPER_ADMIN`, `ENTRY_VIEWER`).

#### Scenario: Enum value is present after migration
- **WHEN** the `add_kalan_hesab_submission` migration is applied
- **THEN** `KALAN_HESAB_ADMIN` is a valid value for `Admin.role`

#### Scenario: Admin row can be created with KALAN_HESAB_ADMIN role
- **WHEN** an `Admin` row is inserted with `role = KALAN_HESAB_ADMIN`
- **THEN** the insert succeeds

#### Scenario: Existing UserRole values are not modified
- **WHEN** the migration is applied
- **THEN** existing `Admin` rows with `role = ADMIN`, `SUPER_ADMIN`, or `ENTRY_VIEWER` remain valid and their role values are unchanged

---

### Requirement: Two KALAN_HESAB_ADMIN admin accounts are seeded
The system SHALL have two `Admin` rows with `role = KALAN_HESAB_ADMIN` and `active = true` after `npm run db:seed` is executed, one for each client admin phone number.

| mobile | name | role | active |
|---|---|---|---|
| `09224872163` | `کالان حساب - مدیر اول` | `KALAN_HESAB_ADMIN` | `true` |
| `09390649614` | `کالان حساب - مدیر دوم` | `KALAN_HESAB_ADMIN` | `true` |

#### Scenario: Seed creates the two admin rows
- **WHEN** `npm run db:seed` is run on a clean database (or one where these mobiles do not yet exist)
- **THEN** both `Admin` rows above are present in the database

#### Scenario: Seed is idempotent — re-running does not error
- **WHEN** `npm run db:seed` is run a second time after the rows already exist
- **THEN** no error is thrown and no duplicate rows are created (`skipDuplicates: true` behavior)

#### Scenario: Seed does not affect existing IOIV admin rows
- **WHEN** `npm run db:seed` is run
- **THEN** any pre-existing `Admin` rows with `role = ADMIN` or `role = SUPER_ADMIN` are unchanged
