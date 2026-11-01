BEGIN;
ALTER TABLE public.round_items ADD COLUMN IF NOT EXISTS additional_qty_kg NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK(additional_qty_kg>=0);
CREATE TABLE IF NOT EXISTS public.round_stock_additions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),request_id UUID NOT NULL UNIQUE,
  round_id UUID NOT NULL REFERENCES public.planting_rounds(id) ON DELETE RESTRICT,
  round_item_id UUID NOT NULL REFERENCES public.round_items(id) ON DELETE RESTRICT,
  previous_additional_kg NUMERIC(10,2) NOT NULL,added_qty_kg NUMERIC(10,2) NOT NULL CHECK(added_qty_kg>0),
  note TEXT NOT NULL,recorded_by UUID NOT NULL REFERENCES auth.users(id),recorded_by_email TEXT NOT NULL,
  reopened BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.round_stock_additions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.round_stock_additions FROM anon,authenticated;
GRANT ALL ON public.round_stock_additions TO service_role;
CREATE INDEX IF NOT EXISTS round_stock_additions_round_created_idx ON public.round_stock_additions(round_id,created_at DESC);

-- The same capacity is used by public catalog, checkout, manual orders and amendments.
CREATE OR REPLACE FUNCTION public.booking_stock_kg(p_item_id UUID)
RETURNS NUMERIC LANGUAGE SQL STABLE SET search_path=public AS $$
  SELECT GREATEST(0,CASE WHEN COALESCE(i.planting_plants_per_kg,c.slots_per_kg,0)>0 AND i.plant_count IS NOT NULL
    THEN floor(GREATEST(0,i.plant_count-COALESCE(i.lost_plant_count,0))/COALESCE(i.planting_plants_per_kg,c.slots_per_kg))
    ELSE COALESCE(i.estimated_qty_kg,0) END)+COALESCE(i.additional_qty_kg,0)
  FROM public.round_items i JOIN public.crops c ON c.id=i.crop_id WHERE i.id=p_item_id
$$;

CREATE OR REPLACE FUNCTION public.add_round_weighed_stock(p_actor_id UUID,p_round_id UUID,p_item_id UUID,p_request_id UUID,
  p_previous_additional_kg NUMERIC,p_added_qty_kg NUMERIC,p_note TEXT,p_reopen BOOLEAN DEFAULT FALSE)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor_email TEXT; r RECORD; ri RECORD; history RECORD; metadata JSONB; p RECORD; other_round RECORD;
BEGIN
  SELECT u.email INTO actor_email FROM auth.users u JOIN public.admin_users a ON lower(a.email)=lower(u.email) WHERE u.id=p_actor_id;
  IF actor_email IS NULL THEN RAISE EXCEPTION 'ไม่มีสิทธิ์เพิ่มผลผลิตสำหรับขาย'; END IF;
  IF p_request_id IS NULL OR p_reopen IS NULL OR p_previous_additional_kg IS NULL OR p_previous_additional_kg<0
    OR p_added_qty_kg IS NULL OR p_added_qty_kg<=0 OR p_added_qty_kg>99999999 OR round(p_added_qty_kg,2)<>p_added_qty_kg
    OR length(trim(COALESCE(p_note,'')))=0 OR length(p_note)>1000 THEN
    RAISE EXCEPTION 'กรุณากรอกปริมาณที่เพิ่มมากกว่า 0 ทศนิยมไม่เกิน 2 ตำแหน่ง และระบุเหตุผล';
  END IF;
  PERFORM pg_advisory_xact_lock(450001);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::TEXT,0));
  SELECT * INTO history FROM public.round_stock_additions WHERE request_id=p_request_id;
  IF FOUND THEN
    IF history.recorded_by<>p_actor_id OR history.round_id<>p_round_id OR history.round_item_id<>p_item_id
      OR history.added_qty_kg<>p_added_qty_kg OR history.previous_additional_kg IS DISTINCT FROM p_previous_additional_kg
      OR history.note<>trim(p_note) OR history.reopened IS DISTINCT FROM p_reopen THEN
      RAISE EXCEPTION 'รหัสคำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว';
    END IF;
    RETURN to_jsonb(history);
  END IF;
  PERFORM 1 FROM public.round_items WHERE round_id=p_round_id ORDER BY id FOR UPDATE;
  SELECT * INTO r FROM public.planting_rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบรอบปลูก'; END IF;
  IF r.status::TEXT IN ('completed','cancelled') OR r.closure_reason IS NOT NULL OR r.completed_date IS NOT NULL
    OR COALESCE(r.current_step,0) NOT IN (6,7) THEN
    RAISE EXCEPTION 'เพิ่มผลผลิตได้ตั้งแต่ขั้นพร้อมเก็บและขาย จนก่อนสิ้นสุดรอบ';
  END IF;
  SELECT * INTO ri FROM public.round_items WHERE id=p_item_id AND round_id=p_round_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ผักที่เลือกไม่อยู่ในรอบนี้'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.crops WHERE id=ri.crop_id AND is_active) THEN RAISE EXCEPTION 'ชนิดผักนี้ปิดใช้งานแล้ว'; END IF;
  IF ri.additional_qty_kg IS DISTINCT FROM p_previous_additional_kg THEN
    RAISE EXCEPTION 'ปริมาณถูกเพิ่มจากหน้าหรือผู้ใช้อื่นแล้ว กรุณาโหลดข้อมูลล่าสุด';
  END IF;
  IF ri.additional_qty_kg+p_added_qty_kg>99999999.99 THEN RAISE EXCEPTION 'ปริมาณรวมเกินขนาดที่ระบบรองรับ'; END IF;
  IF NOT p_reopen AND (r.status::TEXT<>'booking_open' OR r.booking_closes_at<=now() OR r.booking_opens_at>now() OR r.sold_out_date IS NOT NULL) THEN
    RAISE EXCEPTION 'รอบนี้ยังไม่เปิดรับจอง กรุณาเลือกเปิดรับจองอีกครั้ง';
  END IF;
  IF p_reopen AND (r.harvest_sale_date IS NULL OR r.harvest_sale_date>(now() AT TIME ZONE 'Asia/Bangkok')::DATE) THEN
    RAISE EXCEPTION 'กรุณาบันทึกวันพร้อมเก็บและขายก่อนเปิดรับจองอีกครั้ง';
  END IF;
  -- Reopening a sold-out round must not reclaim plots already reused by another round.
  IF p_reopen AND r.sold_out_date IS NOT NULL THEN
    BEGIN metadata:=r.notes::JSONB; EXCEPTION WHEN OTHERS THEN metadata:='{}'::JSONB; END;
    FOR p IN SELECT * FROM public.plots LOOP
      IF metadata::TEXT LIKE '%'||p.id::TEXT||'%' OR EXISTS(SELECT 1 FROM public.round_items i WHERE i.round_id=r.id
        AND (p.id=ANY(COALESCE(i.plot_ids,'{}'::UUID[])) OR i.crop_id=p.crop_id OR i.crop_id=ANY(COALESCE(p.crop_ids,'{}'::UUID[])))) THEN
        FOR other_round IN SELECT * FROM public.planting_rounds x WHERE x.id<>r.id
          AND x.status::TEXT NOT IN ('completed','cancelled') AND x.completed_date IS NULL
          AND NOT(x.sold_out_date IS NOT NULL AND COALESCE(x.current_step,1)>=7) LOOP
          IF other_round.notes LIKE '%'||p.id::TEXT||'%' OR EXISTS(SELECT 1 FROM public.round_items i WHERE i.round_id=other_round.id
            AND (p.id=ANY(COALESCE(i.plot_ids,'{}'::UUID[])) OR i.crop_id=p.crop_id OR i.crop_id=ANY(COALESCE(p.crop_ids,'{}'::UUID[])))) THEN
            RAISE EXCEPTION 'แปลงของรอบนี้ถูกใช้ในรอบอื่นแล้ว จึงเปิดรับจองรอบนี้อีกครั้งไม่ได้';
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;
  UPDATE public.round_items SET additional_qty_kg=additional_qty_kg+p_added_qty_kg WHERE id=ri.id;
  UPDATE public.planting_rounds SET
    status=CASE WHEN p_reopen THEN 'booking_open' ELSE status END,
    booking_opens_at=CASE WHEN p_reopen THEN LEAST(COALESCE(booking_opens_at,now()),now()) ELSE booking_opens_at END,
    booking_closes_at=CASE WHEN p_reopen THEN NULL ELSE booking_closes_at END,
    sold_out_date=CASE WHEN p_reopen THEN NULL ELSE sold_out_date END,
    current_step=CASE WHEN p_reopen THEN 7 ELSE current_step END,updated_at=clock_timestamp() WHERE id=r.id;
  INSERT INTO public.round_stock_additions(request_id,round_id,round_item_id,previous_additional_kg,added_qty_kg,note,recorded_by,recorded_by_email,reopened)
    VALUES(p_request_id,r.id,ri.id,ri.additional_qty_kg,p_added_qty_kg,trim(p_note),p_actor_id,actor_email,p_reopen) RETURNING * INTO history;
  INSERT INTO public.audit_logs(actor_id,actor_email,entity_type,entity_id,action,old_data,new_data)
    VALUES(p_actor_id,actor_email,'round_items',ri.id::TEXT,'update',to_jsonb(ri),to_jsonb(history));
  RETURN to_jsonb(history);
END $$;
REVOKE ALL ON FUNCTION public.add_round_weighed_stock(UUID,UUID,UUID,UUID,NUMERIC,NUMERIC,TEXT,BOOLEAN) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.add_round_weighed_stock(UUID,UUID,UUID,UUID,NUMERIC,NUMERIC,TEXT,BOOLEAN) TO service_role;
CREATE OR REPLACE FUNCTION public.guard_surplus_round_stage()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF COALESCE(NEW.current_step,1)<6 AND EXISTS(SELECT 1 FROM public.round_stock_additions WHERE round_id=NEW.id) THEN
    RAISE EXCEPTION 'รอบนี้มีบันทึกเพิ่มผลผลิตสำหรับขายแล้ว จึงย้อนกลับก่อนขั้นพร้อมเก็บและขายไม่ได้';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_surplus_round_stage ON public.planting_rounds;
CREATE TRIGGER guard_surplus_round_stage BEFORE UPDATE OF current_step ON public.planting_rounds
FOR EACH ROW EXECUTE FUNCTION public.guard_surplus_round_stage();
REVOKE ALL ON FUNCTION public.guard_surplus_round_stage() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
