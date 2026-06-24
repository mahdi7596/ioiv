## ADDED Requirements

### Requirement: KalanHesabSubmission model exists in the database
The system SHALL have a `KalanHesabSubmission` table in PostgreSQL, created via a Prisma migration, with the following columns:

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | String (cuid) | No | Primary key |
| `fullName` | String | No | |
| `companyName` | String | No | |
| `position` | String | No | Persian label stored as-is |
| `positionOther` | String | Yes | Set only when `position = "سایر"` |
| `teamSize` | String | No | Persian label stored as-is |
| `mainConcern` | String | No | Persian label stored as-is |
| `concernOther` | String | Yes | Set only when `mainConcern = "سایر"` |
| `mobile` | String | No | |
| `createdAt` | DateTime | No | Defaults to `now()` |

#### Scenario: Migration creates the table
- **WHEN** `npm run db:migrate` is run with migration name `add_kalan_hesab_submission`
- **THEN** the `KalanHesabSubmission` table exists in the database with all columns above

#### Scenario: Optional fields are nullable
- **WHEN** a row is inserted with `positionOther = null` and `concernOther = null`
- **THEN** the insert succeeds and both columns store NULL

#### Scenario: createdAt defaults to current timestamp
- **WHEN** a row is inserted without specifying `createdAt`
- **THEN** `createdAt` is set to the time of the insert

---

### Requirement: KalanHesabSubmission table has indexes on createdAt and mobile
The system SHALL have a `@@index([createdAt])` and a `@@index([mobile])` on the `KalanHesabSubmission` model to support admin panel list queries (ordered by date) and mobile-based lookups.

#### Scenario: Index on createdAt is present
- **WHEN** the migration is applied
- **THEN** a database index exists on `KalanHesabSubmission.createdAt`

#### Scenario: Index on mobile is present
- **WHEN** the migration is applied
- **THEN** a database index exists on `KalanHesabSubmission.mobile`

---

### Requirement: Submission rows persist all form field values including سایر overrides
The system SHALL persist `positionOther` when `position = "سایر"` and `concernOther` when `mainConcern = "سایر"`, and MUST leave both as NULL when the primary field is not `"سایر"`.

#### Scenario: سایر position stores free-text override
- **WHEN** a row is inserted with `position = "سایر"` and `positionOther = "مشاور"`
- **THEN** both columns are stored and retrievable exactly as inserted

#### Scenario: Non-سایر position leaves positionOther null
- **WHEN** a row is inserted with `position = "مدیرعامل"` and no `positionOther`
- **THEN** `positionOther` is NULL in the stored row
