-- AlterTable
ALTER TABLE "User"
ADD COLUMN "companyName" TEXT,
ADD COLUMN "companyContactNationalId" TEXT,
ADD COLUMN "companyContactFullName" TEXT,
ADD COLUMN "companyContactNationalCode" TEXT;

-- AlterTable
ALTER TABLE "Application"
ADD COLUMN "companyName" TEXT,
ADD COLUMN "companyContactNationalId" TEXT,
ADD COLUMN "companyContactFullName" TEXT,
ADD COLUMN "companyContactNationalCode" TEXT;
