-- Contact person now uses a mobile number instead of a national code; shareholders
-- gain a national/registration id. Additive, nullable columns only.
ALTER TABLE "Company" ADD COLUMN "contactMobile" TEXT;
ALTER TABLE "FacilitiesApplicationCompanySnapshot" ADD COLUMN "contactMobile" TEXT;
ALTER TABLE "CompanyShareholder" ADD COLUMN "nationalId" TEXT;
ALTER TABLE "FacilitiesApplicationShareholder" ADD COLUMN "nationalId" TEXT;
