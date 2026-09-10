-- Additive M5 evidence rows retain logical slot references, not replaceable bytes.
CREATE TABLE "FacilitiesApplicationEvidence" (
  "id" TEXT NOT NULL, "applicationId" TEXT NOT NULL, "bindingId" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "year" INTEGER, "officerId" TEXT, "employeeCount" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FacilitiesApplicationEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacilitiesApplicationEvidence_employee_count_check" CHECK ("employeeCount" IS NULL OR "employeeCount" >= 0),
  CONSTRAINT "FacilitiesApplicationEvidence_year_check" CHECK ("year" IS NULL OR "year" BETWEEN 1400 AND 1500)
);
CREATE UNIQUE INDEX "FacilitiesApplicationEvidence_bindingId_key" ON "FacilitiesApplicationEvidence"("bindingId");
CREATE UNIQUE INDEX "FacilitiesApplicationEvidence_applicationId_kind_year_key" ON "FacilitiesApplicationEvidence"("applicationId", "kind", "year") NULLS NOT DISTINCT;
CREATE INDEX "FacilitiesApplicationEvidence_applicationId_kind_idx" ON "FacilitiesApplicationEvidence"("applicationId", "kind");
ALTER TABLE "FacilitiesApplicationEvidence" ADD CONSTRAINT "FacilitiesApplicationEvidence_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "FacilitiesApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FacilitiesApplicationEvidence" ADD CONSTRAINT "FacilitiesApplicationEvidence_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "FacilitiesFileBinding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE FUNCTION enforce_facilities_application_evidence_binding() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "FacilitiesFileBinding" b WHERE b."id" = NEW."bindingId" AND b."scope" = 'APPLICATION' AND b."applicationId" = NEW."applicationId") THEN RAISE EXCEPTION 'facilities evidence binding must belong to its application'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "FacilitiesApplicationEvidence_binding_integrity" BEFORE INSERT OR UPDATE ON "FacilitiesApplicationEvidence" FOR EACH ROW EXECUTE FUNCTION enforce_facilities_application_evidence_binding();
