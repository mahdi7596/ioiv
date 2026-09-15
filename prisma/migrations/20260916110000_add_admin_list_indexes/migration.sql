-- Indexes for the paginated admin lists and per-user lookups. Additive only.
CREATE INDEX "Application_userId_idx" ON "Application"("userId");
CREATE INDEX "Application_createdAt_id_idx" ON "Application"("createdAt", "id");
CREATE INDEX "Payment_applicationId_idx" ON "Payment"("applicationId");
CREATE INDEX "FacilitiesApplication_updatedAt_id_idx" ON "FacilitiesApplication"("updatedAt", "id");
