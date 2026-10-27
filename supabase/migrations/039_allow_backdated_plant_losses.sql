BEGIN;
-- Allow the actual discovery date to precede the recorded start/creation date.
-- Preserve the existing authorization, count limits, audit history and future-date check.
DO $$
DECLARE definition TEXT; target REGPROCEDURE;
BEGIN
  target:='public.record_plant_loss(uuid,uuid,uuid,uuid,date,integer,text,uuid,text,text,uuid)'::REGPROCEDURE;
  SELECT pg_get_functiondef(target) INTO definition;
  definition:=replace(definition,'OR p_loss_date < COALESCE(r.seed_date, r.created_at::DATE)','');
  definition:=replace(definition,'วันที่พบต้องไม่ก่อนวันเริ่มรอบและไม่เป็นวันในอนาคต','กรุณาระบุวันที่พบผักเสียหายไม่เกินวันนี้ สามารถบันทึกย้อนหลังได้');
  IF position('p_loss_date < COALESCE' IN definition)>0 OR position('p_loss_date > (now() AT TIME ZONE ''Asia/Bangkok'')::DATE' IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected plant-loss date validation; migration aborted';
  END IF;
  EXECUTE definition;
END $$;
COMMIT;
