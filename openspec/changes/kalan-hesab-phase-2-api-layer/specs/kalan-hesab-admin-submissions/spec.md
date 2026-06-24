## ADDED Requirements

### Requirement: GET /api/kalan-hesab/admin/submissions returns all submissions to KALAN_HESAB_ADMIN
The system SHALL require a valid admin session with `role = KALAN_HESAB_ADMIN`, query `KalanHesabSubmission` ordered by `createdAt desc`, and support optional `?search=` filtering across `fullName`, `companyName`, and `mobile`.

#### Scenario: Authenticated KALAN_HESAB_ADMIN gets all submissions
- **GIVEN** a valid session for a `KALAN_HESAB_ADMIN` admin
- **WHEN** GET `/api/kalan-hesab/admin/submissions` is called without search params
- **THEN** the response is `200 { submissions: [...] }` with all rows ordered newest first

#### Scenario: search param filters across fullName, companyName, mobile
- **GIVEN** submissions exist for "رضا احمدی" (شرکت آلفا) and "سارا کریمی" (شرکت بتا)
- **WHEN** GET `/api/kalan-hesab/admin/submissions?search=آلفا` is called
- **THEN** only the "رضا احمدی" submission is returned

#### Scenario: Unauthenticated request returns 401
- **GIVEN** no session cookie is present
- **WHEN** GET `/api/kalan-hesab/admin/submissions` is called
- **THEN** the response is `401 { error: "Unauthorized" }`

#### Scenario: IOIV admin session cannot access this endpoint
- **GIVEN** a valid session for an admin with `role = ADMIN` (IOIV admin)
- **WHEN** GET `/api/kalan-hesab/admin/submissions` is called
- **THEN** the response is `403 { error: "Forbidden" }`

---

### Requirement: GET /api/kalan-hesab/admin/export downloads all submissions as xlsx
The system SHALL require a valid `KALAN_HESAB_ADMIN` session, fetch all `KalanHesabSubmission` rows, build an xlsx workbook with columns matching the admin table spec, and return a file download response.

#### Scenario: Export returns an xlsx file with correct columns
- **GIVEN** a valid `KALAN_HESAB_ADMIN` session
- **WHEN** GET `/api/kalan-hesab/admin/export` is called
- **THEN** the response has `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **AND** `Content-Disposition: attachment; filename=kalan-hesab-submissions.xlsx`
- **AND** the workbook contains columns: نام و نام خانوادگی, نام شرکت, سمت, اندازه تیم, دغدغه, موبایل, تاریخ ثبت

#### Scenario: سایر fields resolve to free-text value in export
- **GIVEN** a submission with `position = "سایر"` and `positionOther = "مشاور"`
- **WHEN** the export is downloaded
- **THEN** the "سمت" column shows `"مشاور"` (not `"سایر"`)

#### Scenario: Unauthenticated export returns 401
- **GIVEN** no session
- **WHEN** GET `/api/kalan-hesab/admin/export` is called
- **THEN** the response is `401 { error: "Unauthorized" }`
