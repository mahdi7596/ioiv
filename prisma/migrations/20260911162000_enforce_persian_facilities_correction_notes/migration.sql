-- Existing M6 corrections remain readable. The NOT VALID constraint is enforced
-- for all new and changed rows without making deployment depend on legacy text.
ALTER TABLE "FacilitiesCorrectionRequest"
  ADD CONSTRAINT "FacilitiesCorrectionRequest_note_persian_check"
  CHECK ("note" ~ '[ء-ی]') NOT VALID;
