-- M3 is additive and deliberately does not read or change legacy company data.
ALTER TABLE "Company"
  ADD COLUMN "profileVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "profileCompletedAt" TIMESTAMP(3);

ALTER TABLE "Company"
  ADD CONSTRAINT "Company_profile_version_positive" CHECK ("profileVersion" >= 0);

CREATE UNIQUE INDEX "Company_one_chief_executive_per_company"
  ON "CompanyOfficer" ("companyId") WHERE "isChiefExecutive";

-- Company-profile documents are represented by immutable M2 COMPANY_PROFILE
-- bindings. The four company slots are deterministic; officer slots include
-- the server-owned officer id and are validated in the application service.
