-- M1 facilities foundation. This migration is deliberately additive: it does not
-- alter, backfill, or relink any legacy validation application data.

CREATE TYPE "FacilityType" AS ENUM ('FIXED_CAPITAL', 'WORKING_CAPITAL');
CREATE TYPE "FacilitiesProgram" AS ENUM ('VALIDATION', 'FACILITIES');
CREATE TYPE "StoredFileType" AS ENUM ('PDF', 'DOC', 'DOCX', 'XLS', 'XLSX', 'CSV', 'ZIP');
CREATE TYPE "StoredFileScanStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED');
CREATE TYPE "CompanyProfileDocumentKind" AS ENUM ('INCORPORATION_NOTICE', 'ARTICLES_OF_ASSOCIATION', 'BOARD_CHANGES_GAZETTE', 'CAPITAL_INCREASE_GAZETTE', 'OFFICER_IDENTITY_PACKAGE');
CREATE TYPE "FacilitiesApplicationDocumentKind" AS ENUM ('INCORPORATION_NOTICE', 'ARTICLES_OF_ASSOCIATION', 'BOARD_CHANGES_GAZETTE', 'CAPITAL_INCREASE_GAZETTE', 'INSURANCE_LIST', 'GENERAL_LEDGER_TRIAL_BALANCE', 'SUBSIDIARY_LEDGER_TRIAL_BALANCE', 'COMPANY_CREDIT_REPORT', 'CEO_CREDIT_REPORT', 'BOARD_MEMBER_CREDIT_REPORT', 'COMPLETED_QUESTIONNAIRE', 'QUESTIONNAIRE_ATTACHMENT', 'LICENCES_AND_CERTIFICATES', 'ACTIVE_CONTRACTS');
CREATE TYPE "FacilitiesYearDocumentKind" AS ENUM ('TAX_DECLARATION', 'AUDITED_FINANCIAL_STATEMENT', 'VAT_DECLARATION');
CREATE TYPE "FacilitiesCreditReportTarget" AS ENUM ('COMPANY', 'CEO', 'BOARD_MEMBER');
CREATE TYPE "FacilitiesAuditAction" AS ENUM ('COMPANY_CREATED', 'COMPANY_UPDATED', 'COMPANY_DOCUMENT_REPLACED', 'INTAKE_CONFIGURED', 'SUPPLIER_CONFIGURED', 'QUESTIONNAIRE_TEMPLATE_CONFIGURED', 'APPLICATION_CREATED', 'APPLICATION_UPDATED', 'APPLICATION_SUBMITTED', 'PAYMENT_INITIATED', 'PAYMENT_VERIFIED', 'PAYMENT_FAILED', 'CORRECTION_REQUESTED', 'CORRECTION_SUBMITTED', 'STATUS_CHANGED', 'FILE_ATTACHED', 'FILE_REPLACED');

CREATE TABLE "Company" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "name" TEXT, "nationalId" TEXT,
  "registrationNumber" TEXT, "registrationPlace" TEXT, "registrationDate" TIMESTAMP(3),
  "registeredCapitalRial" DECIMAL(65,30), "contactFullName" TEXT, "contactNationalCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Company_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Company_national_id_format_check" CHECK ("nationalId" IS NULL OR "nationalId" ~ '^[0-9]{11}$'),
  CONSTRAINT "Company_registered_capital_nonnegative_check" CHECK ("registeredCapitalRial" IS NULL OR "registeredCapitalRial" >= 0)
);
CREATE TABLE "CompanyShareholder" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "fullName" TEXT NOT NULL,
  "ownershipPercentage" DECIMAL(65,30) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "CompanyShareholder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompanyShareholder_percentage_range_check" CHECK ("ownershipPercentage" >= 0 AND "ownershipPercentage" <= 100)
);
CREATE TABLE "CompanyOfficer" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "fullName" TEXT NOT NULL, "position" TEXT NOT NULL,
  "isChiefExecutive" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "CompanyOfficer_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StoredFile" (
  "id" TEXT NOT NULL, "storageKey" TEXT NOT NULL, "originalName" TEXT NOT NULL,
  "fileType" "StoredFileType" NOT NULL, "detectedMimeType" TEXT NOT NULL, "byteSize" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL, "scanStatus" "StoredFileScanStatus" NOT NULL DEFAULT 'PENDING',
  "scannedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoredFile_byte_size_check" CHECK ("byteSize" > 0 AND "byteSize" <= 26214400),
  CONSTRAINT "StoredFile_sha256_format_check" CHECK ("sha256" ~ '^[A-Fa-f0-9]{64}$')
);
CREATE TABLE "CompanyProfileDocument" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "officerId" TEXT,
  "kind" "CompanyProfileDocumentKind" NOT NULL, "storedFileId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyProfileDocument_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FacilitiesProgramConfiguration" (
  "program" "FacilitiesProgram" NOT NULL, "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FacilitiesProgramConfiguration_pkey" PRIMARY KEY ("program")
);
CREATE TABLE "FacilitySupplier" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "FacilitySupplier_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FacilityIntake" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "maximumAmountRial" DECIMAL(65,30) NOT NULL DEFAULT 500000000000,
  "paymentEnabled" BOOLEAN NOT NULL DEFAULT true, "paymentAmountToman" INTEGER NOT NULL DEFAULT 3000000,
  "paymentTermsVersion" TEXT, "paymentTermsText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FacilityIntake_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacilityIntake_maximum_amount_nonnegative_check" CHECK ("maximumAmountRial" >= 0),
  CONSTRAINT "FacilityIntake_payment_amount_nonnegative_check" CHECK ("paymentAmountToman" >= 0)
);
CREATE TABLE "FacilityIntakeSupplier" (
  "id" TEXT NOT NULL, "intakeId" TEXT NOT NULL, "supplierId" TEXT NOT NULL, "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "questionnaireTemplateVersionId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "FacilityIntakeSupplier_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "QuestionnaireTemplateVersion" (
  "id" TEXT NOT NULL, "supplierId" TEXT NOT NULL, "versionLabel" TEXT NOT NULL, "storedFileId" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3), "retiredAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuestionnaireTemplateVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuestionnaireTemplateVersion_dates_check" CHECK ("retiredAt" IS NULL OR "publishedAt" IS NULL OR "retiredAt" >= "publishedAt")
);
CREATE TABLE "FacilitiesApplication" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "companyId" TEXT NOT NULL, "intakeId" TEXT NOT NULL,
  "intakeSupplierId" TEXT NOT NULL, "questionnaireTemplateVersionId" TEXT NOT NULL,
  "facilityType" "FacilityType" NOT NULL, "requestedAmountRial" DECIMAL(65,30) NOT NULL,
  "maximumAmountRialSnapshot" DECIMAL(65,30) NOT NULL, "paymentEnabledSnapshot" BOOLEAN NOT NULL,
  "paymentAmountTomanSnapshot" INTEGER, "paymentTermsVersionSnapshot" TEXT,
  "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT', "currentStep" INTEGER NOT NULL DEFAULT 1,
  "submittedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "FacilitiesApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacilitiesApplication_requested_amount_range_check" CHECK ("requestedAmountRial" >= 0 AND "requestedAmountRial" <= "maximumAmountRialSnapshot"),
  CONSTRAINT "FacilitiesApplication_maximum_amount_nonnegative_check" CHECK ("maximumAmountRialSnapshot" >= 0),
  CONSTRAINT "FacilitiesApplication_payment_snapshot_check" CHECK ((NOT "paymentEnabledSnapshot" AND "paymentAmountTomanSnapshot" IS NULL) OR ("paymentEnabledSnapshot" AND "paymentAmountTomanSnapshot" IS NOT NULL AND "paymentAmountTomanSnapshot" >= 0))
);
CREATE TABLE "FacilitiesApplicationCompanySnapshot" (
  "id" TEXT NOT NULL, "applicationId" TEXT NOT NULL, "name" TEXT, "nationalId" TEXT, "registrationNumber" TEXT,
  "registrationPlace" TEXT, "registrationDate" TIMESTAMP(3), "registeredCapitalRial" DECIMAL(65,30),
  "contactFullName" TEXT, "contactNationalCode" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilitiesApplicationCompanySnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacilitiesApplicationCompanySnapshot_national_id_format_check" CHECK ("nationalId" IS NULL OR "nationalId" ~ '^[0-9]{11}$'),
  CONSTRAINT "FacilitiesApplicationCompanySnapshot_capital_nonnegative_check" CHECK ("registeredCapitalRial" IS NULL OR "registeredCapitalRial" >= 0)
);
CREATE TABLE "FacilitiesApplicationShareholder" (
  "id" TEXT NOT NULL, "applicationId" TEXT NOT NULL, "fullName" TEXT NOT NULL,
  "ownershipPercentage" DECIMAL(65,30) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilitiesApplicationShareholder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacilitiesApplicationShareholder_percentage_range_check" CHECK ("ownershipPercentage" >= 0 AND "ownershipPercentage" <= 100)
);
CREATE TABLE "FacilitiesApplicationOfficer" (
  "id" TEXT NOT NULL, "applicationId" TEXT NOT NULL, "fullName" TEXT NOT NULL, "position" TEXT NOT NULL,
  "isChiefExecutive" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilitiesApplicationOfficer_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FacilitiesApplicationDocument" (
  "id" TEXT NOT NULL, "applicationId" TEXT NOT NULL, "kind" "FacilitiesApplicationDocumentKind" NOT NULL,
  "storedFileId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilitiesApplicationDocument_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FacilitiesYearDocument" (
  "id" TEXT NOT NULL, "applicationId" TEXT NOT NULL, "kind" "FacilitiesYearDocumentKind" NOT NULL,
  "year" INTEGER NOT NULL, "storedFileId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilitiesYearDocument_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FacilitiesHumanResources" (
  "id" TEXT NOT NULL, "applicationId" TEXT NOT NULL, "employeeCount" INTEGER NOT NULL, "insuranceFileId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FacilitiesHumanResources_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacilitiesHumanResources_employee_count_nonnegative_check" CHECK ("employeeCount" >= 0)
);
CREATE TABLE "FacilitiesTrialBalance" (
  "id" TEXT NOT NULL, "applicationId" TEXT NOT NULL, "year" INTEGER NOT NULL DEFAULT 1405,
  "generalLedgerFileId" TEXT NOT NULL, "subsidiaryLedgerFileId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FacilitiesTrialBalance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacilitiesTrialBalance_year_check" CHECK ("year" = 1405)
);
CREATE TABLE "FacilitiesCreditReport" (
  "id" TEXT NOT NULL, "applicationId" TEXT NOT NULL, "target" "FacilitiesCreditReportTarget" NOT NULL,
  "officerSnapshotId" TEXT, "storedFileId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilitiesCreditReport_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FacilitiesPaymentAttempt" (
  "id" TEXT NOT NULL, "applicationId" TEXT NOT NULL, "amountToman" INTEGER NOT NULL, "gateway" TEXT NOT NULL,
  "authority" TEXT, "referenceId" TEXT, "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
  "safeMetadata" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "FacilitiesPaymentAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacilitiesPaymentAttempt_amount_nonnegative_check" CHECK ("amountToman" >= 0)
);
CREATE TABLE "FacilitiesCorrectionRequest" (
  "id" TEXT NOT NULL, "applicationId" TEXT NOT NULL, "sequence" INTEGER NOT NULL, "reviewerId" TEXT NOT NULL,
  "note" TEXT NOT NULL, "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "FacilitiesCorrectionRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacilitiesCorrectionRequest_sequence_positive_check" CHECK ("sequence" > 0)
);
CREATE TABLE "FacilitiesStatusHistory" (
  "id" TEXT NOT NULL, "applicationId" TEXT NOT NULL, "previousStatus" "ApplicationStatus",
  "newStatus" "ApplicationStatus" NOT NULL, "actorType" "AuditActorType" NOT NULL, "actorId" TEXT,
  "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilitiesStatusHistory_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FacilitiesAuditLog" (
  "id" TEXT NOT NULL, "applicationId" TEXT, "actorType" "AuditActorType" NOT NULL, "actorId" TEXT,
  "action" "FacilitiesAuditAction" NOT NULL, "outcome" "AuditOutcome" NOT NULL DEFAULT 'SUCCEEDED',
  "entityType" TEXT NOT NULL, "entityId" TEXT, "metadata" JSONB NOT NULL DEFAULT '{}', "requestId" TEXT,
  "ipAddress" TEXT, "userAgent" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilitiesAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Company_userId_key" ON "Company"("userId");
CREATE UNIQUE INDEX "Company_nationalId_key" ON "Company"("nationalId");
CREATE INDEX "CompanyShareholder_companyId_idx" ON "CompanyShareholder"("companyId");
CREATE INDEX "CompanyOfficer_companyId_idx" ON "CompanyOfficer"("companyId");
CREATE UNIQUE INDEX "StoredFile_storageKey_key" ON "StoredFile"("storageKey");
CREATE INDEX "CompanyProfileDocument_companyId_kind_idx" ON "CompanyProfileDocument"("companyId", "kind");
CREATE INDEX "CompanyProfileDocument_officerId_idx" ON "CompanyProfileDocument"("officerId");
CREATE INDEX "CompanyProfileDocument_storedFileId_idx" ON "CompanyProfileDocument"("storedFileId");
CREATE UNIQUE INDEX "FacilitySupplier_name_key" ON "FacilitySupplier"("name");
CREATE UNIQUE INDEX "FacilityIntake_name_key" ON "FacilityIntake"("name");
CREATE INDEX "FacilityIntake_isEnabled_idx" ON "FacilityIntake"("isEnabled");
CREATE UNIQUE INDEX "FacilityIntakeSupplier_intakeId_supplierId_key" ON "FacilityIntakeSupplier"("intakeId", "supplierId");
CREATE INDEX "FacilityIntakeSupplier_supplierId_idx" ON "FacilityIntakeSupplier"("supplierId");
CREATE INDEX "FacilityIntakeSupplier_questionnaireTemplateVersionId_idx" ON "FacilityIntakeSupplier"("questionnaireTemplateVersionId");
CREATE UNIQUE INDEX "QuestionnaireTemplateVersion_supplierId_versionLabel_key" ON "QuestionnaireTemplateVersion"("supplierId", "versionLabel");
CREATE INDEX "QuestionnaireTemplateVersion_storedFileId_idx" ON "QuestionnaireTemplateVersion"("storedFileId");
CREATE UNIQUE INDEX "FacilitiesApplication_companyId_intakeId_key" ON "FacilitiesApplication"("companyId", "intakeId");
CREATE INDEX "FacilitiesApplication_userId_idx" ON "FacilitiesApplication"("userId");
CREATE INDEX "FacilitiesApplication_intakeId_status_submittedAt_idx" ON "FacilitiesApplication"("intakeId", "status", "submittedAt");
CREATE INDEX "FacilitiesApplication_intakeSupplierId_idx" ON "FacilitiesApplication"("intakeSupplierId");
CREATE INDEX "FacilitiesApplication_questionnaireTemplateVersionId_idx" ON "FacilitiesApplication"("questionnaireTemplateVersionId");
CREATE UNIQUE INDEX "FacilitiesApplicationCompanySnapshot_applicationId_key" ON "FacilitiesApplicationCompanySnapshot"("applicationId");
CREATE INDEX "FacilitiesApplicationShareholder_applicationId_idx" ON "FacilitiesApplicationShareholder"("applicationId");
CREATE INDEX "FacilitiesApplicationOfficer_applicationId_idx" ON "FacilitiesApplicationOfficer"("applicationId");
CREATE INDEX "FacilitiesApplicationDocument_applicationId_kind_idx" ON "FacilitiesApplicationDocument"("applicationId", "kind");
CREATE INDEX "FacilitiesApplicationDocument_storedFileId_idx" ON "FacilitiesApplicationDocument"("storedFileId");
CREATE UNIQUE INDEX "FacilitiesYearDocument_applicationId_kind_year_key" ON "FacilitiesYearDocument"("applicationId", "kind", "year");
CREATE INDEX "FacilitiesYearDocument_storedFileId_idx" ON "FacilitiesYearDocument"("storedFileId");
CREATE UNIQUE INDEX "FacilitiesHumanResources_applicationId_key" ON "FacilitiesHumanResources"("applicationId");
CREATE INDEX "FacilitiesHumanResources_insuranceFileId_idx" ON "FacilitiesHumanResources"("insuranceFileId");
CREATE UNIQUE INDEX "FacilitiesTrialBalance_applicationId_key" ON "FacilitiesTrialBalance"("applicationId");
CREATE INDEX "FacilitiesTrialBalance_generalLedgerFileId_idx" ON "FacilitiesTrialBalance"("generalLedgerFileId");
CREATE INDEX "FacilitiesTrialBalance_subsidiaryLedgerFileId_idx" ON "FacilitiesTrialBalance"("subsidiaryLedgerFileId");
CREATE UNIQUE INDEX "FacilitiesCreditReport_applicationId_target_key" ON "FacilitiesCreditReport"("applicationId", "target");
CREATE INDEX "FacilitiesCreditReport_officerSnapshotId_idx" ON "FacilitiesCreditReport"("officerSnapshotId");
CREATE INDEX "FacilitiesCreditReport_storedFileId_idx" ON "FacilitiesCreditReport"("storedFileId");
CREATE INDEX "FacilitiesPaymentAttempt_applicationId_createdAt_idx" ON "FacilitiesPaymentAttempt"("applicationId", "createdAt");
CREATE INDEX "FacilitiesPaymentAttempt_authority_idx" ON "FacilitiesPaymentAttempt"("authority");
CREATE INDEX "FacilitiesPaymentAttempt_referenceId_idx" ON "FacilitiesPaymentAttempt"("referenceId");
CREATE UNIQUE INDEX "FacilitiesCorrectionRequest_applicationId_sequence_key" ON "FacilitiesCorrectionRequest"("applicationId", "sequence");
CREATE INDEX "FacilitiesCorrectionRequest_reviewerId_idx" ON "FacilitiesCorrectionRequest"("reviewerId");
CREATE INDEX "FacilitiesStatusHistory_applicationId_createdAt_idx" ON "FacilitiesStatusHistory"("applicationId", "createdAt");
CREATE INDEX "FacilitiesAuditLog_applicationId_createdAt_idx" ON "FacilitiesAuditLog"("applicationId", "createdAt");
CREATE INDEX "FacilitiesAuditLog_actorType_actorId_createdAt_idx" ON "FacilitiesAuditLog"("actorType", "actorId", "createdAt");
CREATE INDEX "FacilitiesAuditLog_entityType_entityId_createdAt_idx" ON "FacilitiesAuditLog"("entityType", "entityId", "createdAt");
CREATE INDEX "FacilitiesAuditLog_requestId_idx" ON "FacilitiesAuditLog"("requestId");

CREATE UNIQUE INDEX "CompanyOfficer_one_chief_executive" ON "CompanyOfficer"("companyId") WHERE "isChiefExecutive";
CREATE UNIQUE INDEX "FacilitiesApplicationOfficer_one_chief_executive" ON "FacilitiesApplicationOfficer"("applicationId") WHERE "isChiefExecutive";
CREATE UNIQUE INDEX "FacilitiesApplicationDocument_one_non_attachment" ON "FacilitiesApplicationDocument"("applicationId", "kind") WHERE "kind" <> 'QUESTIONNAIRE_ATTACHMENT';
CREATE UNIQUE INDEX "FacilitiesPaymentAttempt_one_verified" ON "FacilitiesPaymentAttempt"("applicationId") WHERE "status" = 'VERIFIED';
CREATE UNIQUE INDEX "FacilitiesCorrectionRequest_one_open" ON "FacilitiesCorrectionRequest"("applicationId") WHERE "resolvedAt" IS NULL;

ALTER TABLE "Company" ADD CONSTRAINT "Company_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyShareholder" ADD CONSTRAINT "CompanyShareholder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyOfficer" ADD CONSTRAINT "CompanyOfficer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyProfileDocument" ADD CONSTRAINT "CompanyProfileDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyProfileDocument" ADD CONSTRAINT "CompanyProfileDocument_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "CompanyOfficer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyProfileDocument" ADD CONSTRAINT "CompanyProfileDocument_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilityIntakeSupplier" ADD CONSTRAINT "FacilityIntakeSupplier_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "FacilityIntake"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilityIntakeSupplier" ADD CONSTRAINT "FacilityIntakeSupplier_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "FacilitySupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilityIntakeSupplier" ADD CONSTRAINT "FacilityIntakeSupplier_questionnaireTemplateVersionId_fkey" FOREIGN KEY ("questionnaireTemplateVersionId") REFERENCES "QuestionnaireTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionnaireTemplateVersion" ADD CONSTRAINT "QuestionnaireTemplateVersion_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "FacilitySupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionnaireTemplateVersion" ADD CONSTRAINT "QuestionnaireTemplateVersion_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesApplication" ADD CONSTRAINT "FacilitiesApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesApplication" ADD CONSTRAINT "FacilitiesApplication_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesApplication" ADD CONSTRAINT "FacilitiesApplication_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "FacilityIntake"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesApplication" ADD CONSTRAINT "FacilitiesApplication_intakeSupplierId_fkey" FOREIGN KEY ("intakeSupplierId") REFERENCES "FacilityIntakeSupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesApplication" ADD CONSTRAINT "FacilitiesApplication_questionnaireTemplateVersionId_fkey" FOREIGN KEY ("questionnaireTemplateVersionId") REFERENCES "QuestionnaireTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesApplicationCompanySnapshot" ADD CONSTRAINT "FacilitiesApplicationCompanySnapshot_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "FacilitiesApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesApplicationShareholder" ADD CONSTRAINT "FacilitiesApplicationShareholder_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "FacilitiesApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesApplicationOfficer" ADD CONSTRAINT "FacilitiesApplicationOfficer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "FacilitiesApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesApplicationDocument" ADD CONSTRAINT "FacilitiesApplicationDocument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "FacilitiesApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesApplicationDocument" ADD CONSTRAINT "FacilitiesApplicationDocument_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesYearDocument" ADD CONSTRAINT "FacilitiesYearDocument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "FacilitiesApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesYearDocument" ADD CONSTRAINT "FacilitiesYearDocument_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesHumanResources" ADD CONSTRAINT "FacilitiesHumanResources_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "FacilitiesApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesHumanResources" ADD CONSTRAINT "FacilitiesHumanResources_insuranceFileId_fkey" FOREIGN KEY ("insuranceFileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesTrialBalance" ADD CONSTRAINT "FacilitiesTrialBalance_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "FacilitiesApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesTrialBalance" ADD CONSTRAINT "FacilitiesTrialBalance_generalLedgerFileId_fkey" FOREIGN KEY ("generalLedgerFileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesTrialBalance" ADD CONSTRAINT "FacilitiesTrialBalance_subsidiaryLedgerFileId_fkey" FOREIGN KEY ("subsidiaryLedgerFileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesCreditReport" ADD CONSTRAINT "FacilitiesCreditReport_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "FacilitiesApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesCreditReport" ADD CONSTRAINT "FacilitiesCreditReport_officerSnapshotId_fkey" FOREIGN KEY ("officerSnapshotId") REFERENCES "FacilitiesApplicationOfficer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesCreditReport" ADD CONSTRAINT "FacilitiesCreditReport_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesPaymentAttempt" ADD CONSTRAINT "FacilitiesPaymentAttempt_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "FacilitiesApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesCorrectionRequest" ADD CONSTRAINT "FacilitiesCorrectionRequest_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "FacilitiesApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesCorrectionRequest" ADD CONSTRAINT "FacilitiesCorrectionRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesStatusHistory" ADD CONSTRAINT "FacilitiesStatusHistory_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "FacilitiesApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesAuditLog" ADD CONSTRAINT "FacilitiesAuditLog_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "FacilitiesApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Relationship-scoped checks cannot be expressed by a normal foreign key.
CREATE FUNCTION enforce_company_profile_document_integrity() RETURNS trigger AS $$
BEGIN
  IF NEW."kind" = 'OFFICER_IDENTITY_PACKAGE' THEN
    IF NEW."officerId" IS NULL OR NOT EXISTS (
      SELECT 1 FROM "CompanyOfficer" o WHERE o."id" = NEW."officerId" AND o."companyId" = NEW."companyId"
    ) THEN RAISE EXCEPTION 'officer package must belong to an officer of the same company'; END IF;
    IF NOT EXISTS (SELECT 1 FROM "StoredFile" f WHERE f."id" = NEW."storedFileId" AND f."fileType" = 'ZIP') THEN
      RAISE EXCEPTION 'officer identity package must be a ZIP file';
    END IF;
  ELSIF NEW."officerId" IS NOT NULL THEN
    RAISE EXCEPTION 'only officer identity packages may reference an officer';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "CompanyProfileDocument_integrity" BEFORE INSERT OR UPDATE ON "CompanyProfileDocument" FOR EACH ROW EXECUTE FUNCTION enforce_company_profile_document_integrity();

CREATE FUNCTION enforce_questionnaire_template_integrity() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "StoredFile" f WHERE f."id" = NEW."storedFileId" AND f."fileType" IN ('DOC', 'DOCX')) THEN
    RAISE EXCEPTION 'questionnaire templates must be Word files';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "QuestionnaireTemplateVersion_integrity" BEFORE INSERT OR UPDATE OF "storedFileId" ON "QuestionnaireTemplateVersion" FOR EACH ROW EXECUTE FUNCTION enforce_questionnaire_template_integrity();

CREATE FUNCTION enforce_intake_supplier_template_integrity() RETURNS trigger AS $$
BEGIN
  IF NEW."questionnaireTemplateVersionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "QuestionnaireTemplateVersion" t WHERE t."id" = NEW."questionnaireTemplateVersionId" AND t."supplierId" = NEW."supplierId"
  ) THEN RAISE EXCEPTION 'questionnaire template must belong to the intake supplier'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "FacilityIntakeSupplier_template_integrity" BEFORE INSERT OR UPDATE OF "supplierId", "questionnaireTemplateVersionId" ON "FacilityIntakeSupplier" FOR EACH ROW EXECUTE FUNCTION enforce_intake_supplier_template_integrity();

CREATE FUNCTION enforce_facilities_application_integrity() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Company" c WHERE c."id" = NEW."companyId" AND c."userId" = NEW."userId") THEN
    RAISE EXCEPTION 'facilities application user must own the selected company';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "FacilityIntakeSupplier" isup
    JOIN "QuestionnaireTemplateVersion" t ON t."id" = NEW."questionnaireTemplateVersionId" AND t."supplierId" = isup."supplierId"
    JOIN "FacilityIntake" i ON i."id" = isup."intakeId" AND i."isEnabled"
    JOIN "FacilitiesProgramConfiguration" p ON p."program" = 'FACILITIES' AND p."isEnabled"
    WHERE isup."id" = NEW."intakeSupplierId" AND isup."intakeId" = NEW."intakeId"
      AND isup."isEnabled" AND isup."questionnaireTemplateVersionId" = NEW."questionnaireTemplateVersionId"
  ) THEN RAISE EXCEPTION 'supplier and questionnaire template must be enabled for the selected intake'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "FacilityIntake" i WHERE i."id" = NEW."intakeId"
      AND i."maximumAmountRial" = NEW."maximumAmountRialSnapshot"
      AND i."paymentEnabled" = NEW."paymentEnabledSnapshot"
      AND ((NOT i."paymentEnabled" AND NEW."paymentAmountTomanSnapshot" IS NULL)
        OR (i."paymentEnabled" AND i."paymentAmountToman" = NEW."paymentAmountTomanSnapshot"))
  ) THEN RAISE EXCEPTION 'facilities application configuration snapshots must match the selected intake'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "FacilitiesApplication_integrity" BEFORE INSERT OR UPDATE OF "userId", "companyId", "intakeId", "intakeSupplierId", "questionnaireTemplateVersionId", "maximumAmountRialSnapshot", "paymentEnabledSnapshot", "paymentAmountTomanSnapshot" ON "FacilitiesApplication" FOR EACH ROW EXECUTE FUNCTION enforce_facilities_application_integrity();

CREATE FUNCTION enforce_facilities_application_document_integrity() RETURNS trigger AS $$
DECLARE file_type "StoredFileType";
BEGIN
  SELECT "fileType" INTO file_type FROM "StoredFile" WHERE "id" = NEW."storedFileId";
  IF NEW."kind" = 'COMPLETED_QUESTIONNAIRE' AND file_type NOT IN ('DOC', 'DOCX') THEN RAISE EXCEPTION 'completed questionnaire must be a Word file'; END IF;
  IF NEW."kind" IN ('LICENCES_AND_CERTIFICATES', 'ACTIVE_CONTRACTS') AND file_type <> 'ZIP' THEN RAISE EXCEPTION 'this application document must be a ZIP file'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "FacilitiesApplicationDocument_integrity" BEFORE INSERT OR UPDATE OF "kind", "storedFileId" ON "FacilitiesApplicationDocument" FOR EACH ROW EXECUTE FUNCTION enforce_facilities_application_document_integrity();

CREATE FUNCTION enforce_facilities_year_document_integrity() RETURNS trigger AS $$
BEGIN
  IF NEW."kind" = 'VAT_DECLARATION' AND NEW."year" NOT IN (1402, 1403, 1404) THEN RAISE EXCEPTION 'VAT declaration year is not permitted'; END IF;
  IF NEW."kind" = 'VAT_DECLARATION' AND NOT EXISTS (SELECT 1 FROM "StoredFile" f WHERE f."id" = NEW."storedFileId" AND f."fileType" = 'ZIP') THEN RAISE EXCEPTION 'VAT declaration must be a ZIP file'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "FacilitiesYearDocument_integrity" BEFORE INSERT OR UPDATE OF "kind", "year", "storedFileId" ON "FacilitiesYearDocument" FOR EACH ROW EXECUTE FUNCTION enforce_facilities_year_document_integrity();

CREATE FUNCTION enforce_facilities_credit_report_integrity() RETURNS trigger AS $$
BEGIN
  IF NEW."target" = 'BOARD_MEMBER' AND (NEW."officerSnapshotId" IS NULL OR NOT EXISTS (
    SELECT 1 FROM "FacilitiesApplicationOfficer" o WHERE o."id" = NEW."officerSnapshotId" AND o."applicationId" = NEW."applicationId"
  )) THEN RAISE EXCEPTION 'board-member credit report must reference an officer snapshot on the same application'; END IF;
  IF NEW."target" <> 'BOARD_MEMBER' AND NEW."officerSnapshotId" IS NOT NULL THEN RAISE EXCEPTION 'only board-member credit reports may reference an officer snapshot'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "FacilitiesCreditReport_integrity" BEFORE INSERT OR UPDATE OF "applicationId", "target", "officerSnapshotId" ON "FacilitiesCreditReport" FOR EACH ROW EXECUTE FUNCTION enforce_facilities_credit_report_integrity();

-- A submitted application's ownership and pinned evidence must not be silently
-- altered through a referenced parent row. New versions are created instead.
-- These must be table-specific functions: PL/pgSQL validates every NEW field in
-- a trigger function, even when a branch for another table would be false.
CREATE FUNCTION prevent_referenced_company_owner_mutation() RETURNS trigger AS $$
BEGIN
  IF NEW."userId" IS DISTINCT FROM OLD."userId" AND EXISTS (
    SELECT 1 FROM "FacilitiesApplication" a WHERE a."companyId" = OLD."id"
  ) THEN RAISE EXCEPTION 'company ownership cannot change after a facilities application exists'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE FUNCTION prevent_referenced_company_officer_mutation() RETURNS trigger AS $$
BEGIN
  IF NEW."companyId" IS DISTINCT FROM OLD."companyId" AND EXISTS (
    SELECT 1 FROM "CompanyProfileDocument" d WHERE d."officerId" = OLD."id"
  ) THEN RAISE EXCEPTION 'officer company cannot change while referenced by a profile document'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE FUNCTION prevent_referenced_application_officer_mutation() RETURNS trigger AS $$
BEGIN
  IF NEW."applicationId" IS DISTINCT FROM OLD."applicationId" AND EXISTS (
    SELECT 1 FROM "FacilitiesCreditReport" r WHERE r."officerSnapshotId" = OLD."id"
  ) THEN RAISE EXCEPTION 'officer snapshot application cannot change while referenced by a credit report'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE FUNCTION prevent_referenced_intake_supplier_mutation() RETURNS trigger AS $$
BEGIN
  IF (NEW."intakeId" IS DISTINCT FROM OLD."intakeId" OR NEW."supplierId" IS DISTINCT FROM OLD."supplierId" OR NEW."questionnaireTemplateVersionId" IS DISTINCT FROM OLD."questionnaireTemplateVersionId") AND EXISTS (
    SELECT 1 FROM "FacilitiesApplication" a WHERE a."intakeSupplierId" = OLD."id"
  ) THEN RAISE EXCEPTION 'intake supplier identity cannot change after selection by an application'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE FUNCTION prevent_referenced_questionnaire_template_mutation() RETURNS trigger AS $$
BEGIN
  IF (NEW."supplierId" IS DISTINCT FROM OLD."supplierId" OR NEW."storedFileId" IS DISTINCT FROM OLD."storedFileId" OR NEW."versionLabel" IS DISTINCT FROM OLD."versionLabel") AND (
    EXISTS (SELECT 1 FROM "FacilitiesApplication" a WHERE a."questionnaireTemplateVersionId" = OLD."id") OR
    EXISTS (SELECT 1 FROM "FacilityIntakeSupplier" s WHERE s."questionnaireTemplateVersionId" = OLD."id")
  ) THEN RAISE EXCEPTION 'referenced questionnaire template versions are immutable'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE FUNCTION prevent_referenced_stored_file_mutation() RETURNS trigger AS $$
BEGIN
  IF (NEW."storageKey" IS DISTINCT FROM OLD."storageKey" OR NEW."originalName" IS DISTINCT FROM OLD."originalName" OR NEW."fileType" IS DISTINCT FROM OLD."fileType" OR NEW."detectedMimeType" IS DISTINCT FROM OLD."detectedMimeType" OR NEW."byteSize" IS DISTINCT FROM OLD."byteSize" OR NEW."sha256" IS DISTINCT FROM OLD."sha256") AND (
    EXISTS (SELECT 1 FROM "CompanyProfileDocument" d WHERE d."storedFileId" = OLD."id") OR
    EXISTS (SELECT 1 FROM "QuestionnaireTemplateVersion" t WHERE t."storedFileId" = OLD."id") OR
    EXISTS (SELECT 1 FROM "FacilitiesApplicationDocument" d WHERE d."storedFileId" = OLD."id") OR
    EXISTS (SELECT 1 FROM "FacilitiesYearDocument" d WHERE d."storedFileId" = OLD."id") OR
    EXISTS (SELECT 1 FROM "FacilitiesHumanResources" h WHERE h."insuranceFileId" = OLD."id") OR
    EXISTS (SELECT 1 FROM "FacilitiesTrialBalance" b WHERE b."generalLedgerFileId" = OLD."id" OR b."subsidiaryLedgerFileId" = OLD."id") OR
    EXISTS (SELECT 1 FROM "FacilitiesCreditReport" r WHERE r."storedFileId" = OLD."id")
  ) THEN RAISE EXCEPTION 'referenced stored file identity is immutable'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "Company_referenced_identity_immutable" BEFORE UPDATE OF "userId" ON "Company" FOR EACH ROW EXECUTE FUNCTION prevent_referenced_company_owner_mutation();
CREATE TRIGGER "CompanyOfficer_referenced_identity_immutable" BEFORE UPDATE OF "companyId" ON "CompanyOfficer" FOR EACH ROW EXECUTE FUNCTION prevent_referenced_company_officer_mutation();
CREATE TRIGGER "FacilitiesApplicationOfficer_referenced_identity_immutable" BEFORE UPDATE OF "applicationId" ON "FacilitiesApplicationOfficer" FOR EACH ROW EXECUTE FUNCTION prevent_referenced_application_officer_mutation();
CREATE TRIGGER "FacilityIntakeSupplier_referenced_identity_immutable" BEFORE UPDATE OF "intakeId", "supplierId", "questionnaireTemplateVersionId" ON "FacilityIntakeSupplier" FOR EACH ROW EXECUTE FUNCTION prevent_referenced_intake_supplier_mutation();
CREATE TRIGGER "QuestionnaireTemplateVersion_referenced_identity_immutable" BEFORE UPDATE OF "supplierId", "storedFileId", "versionLabel" ON "QuestionnaireTemplateVersion" FOR EACH ROW EXECUTE FUNCTION prevent_referenced_questionnaire_template_mutation();
CREATE TRIGGER "StoredFile_referenced_identity_immutable" BEFORE UPDATE OF "storageKey", "originalName", "fileType", "detectedMimeType", "byteSize", "sha256" ON "StoredFile" FOR EACH ROW EXECUTE FUNCTION prevent_referenced_stored_file_mutation();

CREATE FUNCTION prevent_facilities_append_only_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION '% records are append-only', TG_TABLE_NAME; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "FacilitiesAuditLog_prevent_mutation" BEFORE UPDATE OR DELETE ON "FacilitiesAuditLog" FOR EACH ROW EXECUTE FUNCTION prevent_facilities_append_only_mutation();
CREATE TRIGGER "FacilitiesStatusHistory_prevent_mutation" BEFORE UPDATE OR DELETE ON "FacilitiesStatusHistory" FOR EACH ROW EXECUTE FUNCTION prevent_facilities_append_only_mutation();

CREATE FUNCTION validate_facilities_audit_metadata() RETURNS trigger AS $$
DECLARE forbidden_key TEXT;
BEGIN
  IF jsonb_typeof(NEW."metadata") <> 'object' OR octet_length(NEW."metadata"::text) > 4096 THEN
    RAISE EXCEPTION 'FacilitiesAuditLog metadata must be a small object';
  END IF;
  SELECT key INTO forbidden_key FROM jsonb_object_keys(NEW."metadata") AS key
    WHERE key <> ALL (ARRAY['reasonCode', 'fieldKeys', 'documentKind', 'fileId', 'intakeId', 'supplierId', 'templateVersionId', 'paymentAttemptId', 'correctionRequestId', 'previousStatus', 'newStatus', 'status', 'changedFields']) LIMIT 1;
  IF forbidden_key IS NOT NULL THEN RAISE EXCEPTION 'FacilitiesAuditLog metadata key % is not permitted', forbidden_key; END IF;
  IF NEW."metadata" ? 'reasonCode' AND (jsonb_typeof(NEW."metadata"->'reasonCode') <> 'string' OR NEW."metadata"->>'reasonCode' !~ '^[A-Z0-9_.-]{1,100}$') THEN
    RAISE EXCEPTION 'FacilitiesAuditLog reasonCode is invalid';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(NEW."metadata") AS item(key, value)
    WHERE item.key IN ('fileId', 'intakeId', 'supplierId', 'templateVersionId', 'paymentAttemptId', 'correctionRequestId')
      AND (jsonb_typeof(item.value) <> 'string' OR item.value #>> '{}' !~ '^[A-Za-z0-9_-]{1,64}$')
  ) THEN RAISE EXCEPTION 'FacilitiesAuditLog identifier metadata is invalid'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(NEW."metadata") AS item(key, value)
    WHERE item.key IN ('previousStatus', 'newStatus', 'status')
      AND (jsonb_typeof(item.value) <> 'string' OR item.value #>> '{}' NOT IN ('DRAFT', 'PENDING_PAYMENT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_EDIT', 'VALIDATION_COMPLETED'))
  ) THEN RAISE EXCEPTION 'FacilitiesAuditLog status metadata is invalid'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(NEW."metadata") AS item(key, value)
    WHERE item.key IN ('fieldKeys', 'changedFields')
      AND (jsonb_typeof(item.value) <> 'array' OR jsonb_array_length(item.value) > 50
        OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(item.value) AS value_text WHERE value_text !~ '^[A-Za-z0-9_.-]{1,100}$'))
  ) THEN RAISE EXCEPTION 'FacilitiesAuditLog field metadata is invalid'; END IF;
  IF NEW."metadata" ? 'documentKind' AND (jsonb_typeof(NEW."metadata"->'documentKind') <> 'string' OR NEW."metadata"->>'documentKind' !~ '^[A-Z_]{1,100}$') THEN
    RAISE EXCEPTION 'FacilitiesAuditLog documentKind is invalid';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "FacilitiesAuditLog_metadata_allow_list" BEFORE INSERT ON "FacilitiesAuditLog" FOR EACH ROW EXECUTE FUNCTION validate_facilities_audit_metadata();
