DO $$
DECLARE
  supplier_count integer;
  programme_count integer;
  intake_count integer;
  template_count integer;
  user_count integer;
  admin_count integer;
BEGIN
  SELECT count(*) INTO supplier_count FROM "FacilitySupplier";
  IF supplier_count <> 4 THEN RAISE EXCEPTION 'expected exactly four approved suppliers, got %', supplier_count; END IF;
  IF EXISTS (
    SELECT 1 FROM "FacilitySupplier"
    WHERE name NOT IN (
      'شرکت ملی نفت ایران',
      'شرکت ملی گاز ایران',
      'شرکت ملی صنایع پتروشیمی ایران',
      'شرکت ملی پالایش و پخش فرآورده‌های نفتی ایران'
    )
  ) THEN RAISE EXCEPTION 'unexpected supplier was provisioned'; END IF;
  SELECT count(*) INTO programme_count FROM "FacilitiesProgramConfiguration";
  SELECT count(*) INTO intake_count FROM "FacilityIntake";
  SELECT count(*) INTO template_count FROM "QuestionnaireTemplateVersion";
  SELECT count(*) INTO user_count FROM "User";
  SELECT count(*) INTO admin_count FROM "Admin";
  IF programme_count <> 0 OR intake_count <> 0 OR template_count <> 0 OR user_count <> 0 OR admin_count <> 0 THEN
    RAISE EXCEPTION 'supplier provisioning created unrelated records';
  END IF;
END $$;
