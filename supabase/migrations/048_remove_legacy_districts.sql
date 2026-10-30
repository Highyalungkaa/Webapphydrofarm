-- Deploy the application without district joins before running this migration.
-- Addresses remain in profiles.address_detail and orders.delivery_address.
BEGIN;

LOCK TABLE public.profiles, public.orders IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE target_table TEXT; has_references BOOLEAN;
BEGIN
  IF to_regclass('public.districts') IS NOT NULL THEN
    LOCK TABLE public.districts IN ACCESS EXCLUSIVE MODE;
  END IF;
  FOREACH target_table IN ARRAY ARRAY['profiles','orders'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema='public' AND c.table_name=target_table AND c.column_name='district_id') THEN
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE district_id IS NOT NULL)', target_table)
        INTO has_references;
      IF has_references THEN
        RAISE EXCEPTION 'ยังมีข้อมูลใน % ผูกกับเขตจัดส่ง กรุณาย้ายชื่อเขตไปเก็บในที่อยู่ก่อนลบ districts', target_table;
      END IF;
    END IF;
  END LOOP;
END $$;

-- Preserve the current function's booking checks, permissions and signature.
-- The optional p_district_id argument remains for older API clients, but is unused.
DO $$
DECLARE target REGPROCEDURE; definition TEXT; body TEXT;
BEGIN
  target := 'public.create_order(uuid,uuid,jsonb,fulfillment_method,text,uuid,character varying,text,boolean)'::REGPROCEDURE;
  SELECT pg_get_functiondef(target) INTO definition;
  definition := regexp_replace(definition, '\mdistrict_id\M\s*,', '', 'g');
  definition := regexp_replace(definition, '\mp_district_id\M\s*,', '', 'g');
  EXECUTE definition;
  SELECT prosrc INTO body FROM pg_proc WHERE oid=target;
  IF body ~ '\m(p_)?district_id\M' THEN
    RAISE EXCEPTION 'create_order มีรูปแบบที่ไม่รองรับการถอด district_id กรุณาตรวจสอบก่อน';
  END IF;
END $$;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS district_id;
ALTER TABLE public.orders DROP COLUMN IF EXISTS district_id;
-- RESTRICT (the default) aborts instead of deleting any unexpected dependencies.
DROP TABLE IF EXISTS public.districts RESTRICT;

NOTIFY pgrst, 'reload schema';
COMMIT;
