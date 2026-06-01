CREATE UNIQUE INDEX "User_companyNationalId_key"
ON "User"("companyNationalId")
WHERE "companyNationalId" IS NOT NULL AND "companyNationalId" <> '';
