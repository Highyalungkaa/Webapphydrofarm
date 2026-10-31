BEGIN;
-- These are schedules, not confirmed dates, while returning to pre-booking steps.
ALTER TABLE public.planting_rounds ALTER COLUMN booking_opens_at DROP NOT NULL;
ALTER TABLE public.planting_rounds ALTER COLUMN planted_at DROP NOT NULL;
ALTER TABLE public.planting_rounds ALTER COLUMN expected_harvest_date DROP NOT NULL;
ALTER TABLE public.planting_rounds ALTER COLUMN fulfillment_date DROP NOT NULL;
CREATE OR REPLACE FUNCTION public.rollback_planting_step(
  p_actor_id UUID,p_round_id UUID,p_expected_updated_at TIMESTAMPTZ
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.planting_rounds%ROWTYPE; target INTEGER; actor_email TEXT;
  metadata JSONB; old_value JSONB; result JSONB; p RECORD; other_round RECORD;
BEGIN
  SELECT u.email INTO actor_email FROM auth.users u JOIN public.admin_users a ON lower(a.email)=lower(u.email) WHERE u.id=p_actor_id;
  IF actor_email IS NULL THEN RAISE EXCEPTION 'ไม่มีสิทธิ์ย้อนสถานะรอบปลูก'; END IF;
  PERFORM pg_advisory_xact_lock(450001);
  SELECT * INTO r FROM public.planting_rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบรอบปลูก'; END IF;
  IF p_expected_updated_at IS NULL OR r.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'ข้อมูลรอบเปลี่ยนแปลงแล้ว กรุณาโหลดหน้าใหม่ก่อนย้อนสถานะ'; END IF;
  IF r.status::TEXT IN ('completed','cancelled') OR r.completed_date IS NOT NULL OR r.closure_reason IS NOT NULL THEN
    RAISE EXCEPTION 'รอบนี้สิ้นสุดแล้ว ไม่สามารถย้อนสถานะได้'; END IF;
  target:=CASE WHEN r.sold_out_date IS NOT NULL THEN 7 ELSE COALESCE(r.current_step,1)-1 END;
  IF target<1 OR target>7 THEN RAISE EXCEPTION 'ไม่มีขั้นตอนก่อนหน้าให้ย้อนกลับ'; END IF;
  IF target<=5 AND EXISTS(SELECT 1 FROM public.orders o WHERE o.round_id=r.id OR EXISTS(
    SELECT 1 FROM public.order_items oi JOIN public.round_items i ON i.id=oi.round_item_id
      WHERE oi.order_id=o.id AND i.round_id=r.id)) THEN
    RAISE EXCEPTION 'รอบนี้มีคำสั่งจองแล้ว จึงย้อนกลับก่อนการเปิดรับจองไม่ได้'; END IF;
  IF target<=4 AND EXISTS(SELECT 1 FROM public.plant_losses WHERE round_id=r.id AND voided_at IS NULL) THEN
    RAISE EXCEPTION 'รอบนี้มีบันทึกผักเสียหายแล้ว จึงย้อนกลับก่อนยืนยันวันปลูกจริงไม่ได้'; END IF;
  IF target=6 AND EXISTS(SELECT 1 FROM public.orders o WHERE o.status::TEXT IN ('ready','completed','no_show')
    AND (o.round_id=r.id OR EXISTS(SELECT 1 FROM public.order_items oi JOIN public.round_items i ON i.id=oi.round_item_id
      WHERE oi.order_id=o.id AND i.round_id=r.id))) THEN
    RAISE EXCEPTION 'รอบนี้มีออเดอร์ที่จัดเตรียมหรือส่งมอบแล้ว จึงย้อนวันพร้อมเก็บและขายไม่ได้'; END IF;
  BEGIN metadata:=r.notes::JSONB; EXCEPTION WHEN OTHERS THEN metadata:=jsonb_build_object('note',r.notes); END;
  IF metadata IS NULL OR jsonb_typeof(metadata)<>'object' THEN metadata:='{}'::JSONB; END IF;
  -- Sold-out rounds released their plots. Do not reopen them over another round.
  IF r.sold_out_date IS NOT NULL THEN
    FOR p IN SELECT * FROM public.plots LOOP
      IF metadata::TEXT LIKE '%'||p.id::TEXT||'%' OR EXISTS(SELECT 1 FROM public.round_items i WHERE i.round_id=r.id
        AND (p.id=ANY(COALESCE(i.plot_ids,'{}'::UUID[])) OR i.crop_id=p.crop_id OR i.crop_id=ANY(COALESCE(p.crop_ids,'{}'::UUID[])))) THEN
        FOR other_round IN SELECT * FROM public.planting_rounds x WHERE x.id<>r.id
          AND x.status::TEXT NOT IN ('completed','cancelled') AND x.completed_date IS NULL
          AND NOT(x.sold_out_date IS NOT NULL AND COALESCE(x.current_step,1)>=7) LOOP
          IF other_round.notes LIKE '%'||p.id::TEXT||'%' OR EXISTS(SELECT 1 FROM public.round_items i WHERE i.round_id=other_round.id
            AND (p.id=ANY(COALESCE(i.plot_ids,'{}'::UUID[])) OR i.crop_id=p.crop_id OR i.crop_id=ANY(COALESCE(p.crop_ids,'{}'::UUID[])))) THEN
            RAISE EXCEPTION 'แปลงของรอบนี้ถูกใช้ในรอบอื่นแล้ว จึงย้อนสถานะขายหมดไม่ได้';
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;
  old_value:=to_jsonb(r);
  IF target<=5 THEN metadata:=metadata||jsonb_build_object('bookingCreated',false); END IF;
  UPDATE public.planting_rounds SET
    current_step=target,
    seed_date=CASE WHEN target<=1 THEN NULL ELSE seed_date END,
    fertilizing_date=CASE WHEN target<=2 THEN NULL ELSE fertilizing_date END,
    planting_start_date=CASE WHEN target<=3 THEN NULL ELSE planting_start_date END,
    transplant_date=CASE WHEN target<=4 THEN NULL ELSE transplant_date END,
    planted_at=CASE WHEN target<=4 THEN NULL ELSE planted_at END,
    expected_harvest_date=CASE WHEN target<=4 THEN NULL ELSE expected_harvest_date END,
    fulfillment_date=CASE WHEN target<=4 THEN NULL ELSE fulfillment_date END,
    booking_opens_at=CASE WHEN target<=5 THEN NULL ELSE booking_opens_at END,
    booking_closes_at=NULL,
    harvest_sale_date=CASE WHEN target<=6 THEN NULL ELSE harvest_sale_date END,
    sold_out_date=NULL,completed_date=NULL,
    status=CASE WHEN target<=4 THEN 'draft'::public.round_status WHEN target=5 THEN 'growing'::public.round_status
      WHEN r.status::TEXT='booking_closed' AND r.sold_out_date IS NOT NULL THEN 'booking_open'::public.round_status ELSE r.status END,
    notes=metadata::TEXT,updated_at=clock_timestamp()
    WHERE id=r.id RETURNING to_jsonb(planting_rounds.*) INTO result;
  INSERT INTO public.audit_logs(actor_id,actor_email,entity_type,entity_id,action,old_data,new_data)
    VALUES(p_actor_id,actor_email,'planting_rounds',r.id::TEXT,'update',old_value,result);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.rollback_planting_step(UUID,UUID,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_planting_step(UUID,UUID,TIMESTAMPTZ) TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
