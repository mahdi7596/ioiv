-- Include the full Arabic/Persian Unicode block (not only Arabic base letters).
ALTER TABLE "FacilitiesCorrectionRequest"
  DROP CONSTRAINT "FacilitiesCorrectionRequest_note_persian_check";

ALTER TABLE "FacilitiesCorrectionRequest"
  ADD CONSTRAINT "FacilitiesCorrectionRequest_note_persian_check"
  CHECK ("note" ~ U&'[\0600-\06FF]') NOT VALID;
