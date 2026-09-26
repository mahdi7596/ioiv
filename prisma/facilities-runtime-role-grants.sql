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
  "FacilitiesPaymentStatus",
  "FacilitiesCorrectionSmsStatus",
  "AuditActorType",
  "AuditOutcome",
  "FacilityType",
  "FacilitiesProgram",
  "StoredFileType",
  "StoredFileScanStatus",
  "FacilitiesFileBindingScope",
  "FacilitiesFileLifecycleStatus",
  "FacilitiesFileFailureReason",
  "FacilitiesFileDeletionStatus",
  "CompanyProfileDocumentKind",
  "FacilitiesApplicationDocumentKind",
  "FacilitiesYearDocumentKind",
  "FacilitiesCreditReportTarget",
  "FacilitiesAuditAction"
TO :"runtime_role";

-- M8 adds FacilitiesAuditAction enum values and read indexes only. PostgreSQL type
-- usage covers new enum values automatically; no broader table privilege is needed.

-- The current legacy application runtime access has been derived from its Prisma
-- calls: user creation/login, OTP consumption, application drafts/uploads/payment,
-- read-only admin lookup, and append-only status/audit history. It intentionally
-- does not authorize seed/admin management, schema migration, or table deletion.
GRANT SELECT, INSERT ON TABLE "User" TO :"runtime_role";
-- Completing the facilities company profile mirrors the company identity onto
-- the legacy User row (completeFacilitiesCompanyProfile). Only those columns
-- and Prisma's @updatedAt are writable; mobile and ids stay read-only.
GRANT UPDATE ("companyName", "companyNationalId", "companyContactFullName", "companyContactNationalCode", "updatedAt")
  ON TABLE "User" TO :"runtime_role";
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
REVOKE DELETE, TRUNCATE ON TABLE "QuestionnaireTemplateVersion" FROM :"runtime_role";
REVOKE DELETE, TRUNCATE ON TABLE "FacilitiesProgramConfiguration", "FacilitySupplier", "FacilityIntake", "FacilityIntakeSupplier" FROM :"runtime_role";
GRANT SELECT, INSERT ON TABLE "QuestionnaireTemplateVersion" TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE ON TABLE
  "Company",
  "CompanyShareholder",
  "CompanyOfficer",
  "CompanyProfileDocument",
  "FacilitiesProgramConfiguration",
  "FacilitySupplier",
  "FacilityIntake",
  "FacilityIntakeSupplier",
  "FacilitiesApplication",
  "FacilitiesApplicationCompanySnapshot",
  "FacilitiesApplicationShareholder",
  "FacilitiesApplicationOfficer",
  "FacilitiesApplicationEvidence",
  "FacilitiesApplicationDocument",
  "FacilitiesYearDocument",
  "FacilitiesHumanResources",
  "FacilitiesTrialBalance",
  "FacilitiesCreditReport",
  "FacilitiesPaymentAttempt",
  "FacilitiesCorrectionRequest"
TO :"runtime_role";

-- Editable profile lists are replaced/removed by saveFacilitiesCompanyDraft.
-- These are not submitted snapshots, audit records, or file lifecycle metadata.
GRANT DELETE ON TABLE "CompanyShareholder", "CompanyOfficer" TO :"runtime_role";
REVOKE TRUNCATE ON TABLE "CompanyShareholder", "CompanyOfficer" FROM :"runtime_role";

-- M2 private-file metadata and lifecycle rows are retained for recovery and
-- audit. The runtime can progress them but must not delete either metadata,
-- bindings, revisions, or retry tombstones directly.
REVOKE DELETE, TRUNCATE ON TABLE
  "FacilitiesFileBinding",
  "FacilitiesFileUploadAttempt",
  "FacilitiesFileUpload",
  "FacilitiesFileDeletionTombstone"
FROM :"runtime_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "StoredFile"
TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE ON TABLE
  "FacilitiesFileBinding",
  "FacilitiesFileUploadAttempt",
  "FacilitiesFileUpload",
  "FacilitiesFileDeletionTombstone"
TO :"runtime_role";

-- R2 durable payment coordination. External outcomes remain append-only.
GRANT SELECT, INSERT, UPDATE ON TABLE "PaymentObligation", "PaymentNotificationIntent" TO :"runtime_role";
GRANT SELECT, INSERT ON TABLE "PaymentOperationResult" TO :"runtime_role";
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "PaymentOperationResult" FROM :"runtime_role";
REVOKE DELETE, TRUNCATE ON TABLE "PaymentObligation", "PaymentNotificationIntent" FROM :"runtime_role";

-- R3 verification accounting; cleanup cannot delete live accounting or any OTP.
GRANT SELECT, INSERT, UPDATE ON TABLE "AuthVerifyBucket" TO :"runtime_role";
REVOKE DELETE, TRUNCATE ON TABLE "AuthVerifyBucket" FROM :"runtime_role";
GRANT EXECUTE ON FUNCTION public.prune_auth_verify_buckets() TO :"runtime_role";
GRANT EXECUTE ON FUNCTION public.lock_active_otp_admin(TEXT) TO :"runtime_role";

REVOKE DELETE, TRUNCATE ON TABLE public."AuthRequestIntent" FROM :"runtime_role";
GRANT SELECT, INSERT, UPDATE ON TABLE public."AuthRequestIntent" TO :"runtime_role";
GRANT EXECUTE ON FUNCTION public.prune_auth_request_intents() TO :"runtime_role";

-- R7 historical lineage repair evidence is migration-owned and append-only.
REVOKE ALL ON TABLE "FacilitiesFileLineageRepair" FROM :"runtime_role";
GRANT SELECT ON TABLE "FacilitiesFileLineageRepair" TO :"runtime_role";

-- R8: exact legacy current pointers and durable cleanup; no ApplicationFile DELETE.
GRANT SELECT, INSERT, UPDATE ON TABLE "LegacyFileBinding", "LegacyFileDeletionIntent" TO :"runtime_role";
GRANT SELECT ON TABLE "LegacyFileBindingRepair" TO :"runtime_role";

GRANT SELECT, INSERT, UPDATE ON TABLE "LegacyUploadCandidate" TO :"runtime_role";

-- R10 historical verification is append-only; existing file identity stays immutable.
GRANT SELECT, INSERT ON TABLE "LegacyFileVerification" TO :"runtime_role";
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "LegacyFileVerification" FROM :"runtime_role";
GRANT USAGE, SELECT ON SEQUENCE "LegacyFileVerification_sequence_seq" TO :"runtime_role";
GRANT EXECUTE ON FUNCTION public.clear_editable_facilities_shareholders(TEXT), public.prune_editable_facilities_officers(TEXT,TEXT[]) TO :"runtime_role";

-- R9: fixed retention, bounded maintenance capability; no arbitrary OTP erasure.
REVOKE DELETE, TRUNCATE ON TABLE "OtpCode" FROM :"runtime_role";
GRANT EXECUTE ON FUNCTION public.prune_expired_otp_codes() TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE ON TABLE "MaintenanceCursor" TO :"runtime_role";
REVOKE DELETE, TRUNCATE ON TABLE "MaintenanceCursor" FROM :"runtime_role";

-- Phase12: serialize authorization with revocation without granting Admin UPDATE.
GRANT EXECUTE ON FUNCTION public.lock_review_admin(TEXT) TO :"runtime_role";
