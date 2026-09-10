-- Run this after the M1 migration with psql, supplying an already-created role:
--   psql "$DATABASE_URL" -v runtime_role=your_runtime_role -f prisma/facilities-runtime-role-grants.sql
-- It deliberately creates no role and contains no credential. `:"runtime_role"`
-- is a psql identifier variable, not interpolated SQL text.

GRANT USAGE ON SCHEMA public TO :"runtime_role";
-- Existing application enum values are bound by Prisma in runtime queries and
-- writes. The facilities enum values are included below for the M1 tables.
GRANT USAGE ON TYPE
  "UserRole",
  "OtpPurpose",
  "ApplicationStatus",
  "PaymentStatus",
  "AuditActorType",
  "AuditOutcome",
  "FacilityType",
  "FacilitiesProgram",
  "StoredFileType",
  "StoredFileScanStatus",
  "CompanyProfileDocumentKind",
  "FacilitiesApplicationDocumentKind",
  "FacilitiesYearDocumentKind",
  "FacilitiesCreditReportTarget",
  "FacilitiesAuditAction"
TO :"runtime_role";

-- The current legacy application runtime access has been derived from its Prisma
-- calls: user creation/login, OTP consumption, application drafts/uploads/payment,
-- read-only admin lookup, and append-only status/audit history. It intentionally
-- does not authorize seed/admin management, schema migration, or table deletion.
GRANT SELECT, INSERT ON TABLE "User" TO :"runtime_role";
GRANT SELECT ON TABLE "Admin" TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE ON TABLE "OtpCode" TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE ON TABLE "Application" TO :"runtime_role";
GRANT SELECT, INSERT ON TABLE "ApplicationFile" TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE ON TABLE "Payment" TO :"runtime_role";

-- History and audit rows are evidence, not mutable application state. AuditLog
-- also has the pre-existing owner-level append-only trigger as defense in depth.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE
  "StatusHistory",
  "AuditLog",
  "FacilitiesStatusHistory",
  "FacilitiesAuditLog"
FROM :"runtime_role";
GRANT SELECT, INSERT ON TABLE
  "StatusHistory",
  "AuditLog",
  "FacilitiesStatusHistory",
  "FacilitiesAuditLog"
TO :"runtime_role";

-- All remaining facilities tables are mutable operational data. Their UI/API
-- flows are introduced in later milestones, but M1 provides the least necessary
-- table-level contract; audit and history tables remain excluded above.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "Company",
  "CompanyShareholder",
  "CompanyOfficer",
  "StoredFile",
  "CompanyProfileDocument",
  "FacilitiesProgramConfiguration",
  "FacilitySupplier",
  "FacilityIntake",
  "FacilityIntakeSupplier",
  "QuestionnaireTemplateVersion",
  "FacilitiesApplication",
  "FacilitiesApplicationCompanySnapshot",
  "FacilitiesApplicationShareholder",
  "FacilitiesApplicationOfficer",
  "FacilitiesApplicationDocument",
  "FacilitiesYearDocument",
  "FacilitiesHumanResources",
  "FacilitiesTrialBalance",
  "FacilitiesCreditReport",
  "FacilitiesPaymentAttempt",
  "FacilitiesCorrectionRequest"
TO :"runtime_role";
