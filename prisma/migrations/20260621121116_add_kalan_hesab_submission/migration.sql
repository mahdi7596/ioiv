-- AlterEnum
ALTER TYPE "OtpPurpose" ADD VALUE 'KALAN_HESAB_VERIFICATION';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'KALAN_HESAB_ADMIN';

-- CreateTable
CREATE TABLE "KalanHesabSubmission" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "positionOther" TEXT,
    "teamSize" TEXT NOT NULL,
    "mainConcern" TEXT NOT NULL,
    "concernOther" TEXT,
    "mobile" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KalanHesabSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KalanHesabSubmission_createdAt_idx" ON "KalanHesabSubmission"("createdAt");

-- CreateIndex
CREATE INDEX "KalanHesabSubmission_mobile_idx" ON "KalanHesabSubmission"("mobile");
