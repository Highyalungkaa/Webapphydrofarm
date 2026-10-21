BEGIN;
ALTER TABLE public.planting_rounds ADD COLUMN IF NOT EXISTS closure_reason TEXT
  CHECK (closure_reason IS NULL OR closure_reason = 'unsold');

CREATE TABLE IF NOT EXISTS public.round_unsold_closures (
  round_id UUID PRIMARY KEY REFERENCES public.planting_rounds(id) ON DELETE RESTRICT,
  request_id UUID NOT NULL UNIQUE,
  closed_date DATE NOT NULL,
  note TEXT,
  recorded_by UUID NOT NULL REFERENCES auth.users(id),
  recorded_by_email TEXT NOT NULL,
  request_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.round_unsold_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.round_unsold_closures(round_id) ON DELETE RESTRICT,
  round_item_id UUID NOT NULL REFERENCES public.round_items(id) ON DELETE RESTRICT,
  crop_name TEXT NOT NULL,
  remaining_plant_count INTEGER NOT NULL,
  plants_per_kg NUMERIC NOT NULL,
  farm_yield_kg NUMERIC NOT NULL,
  delivered_own_kg NUMERIC NOT NULL,
  other_sales_kg NUMERIC NOT NULL CHECK (other_sales_kg >= 0),
  unsold_plant_count INTEGER NOT NULL CHECK (unsold_plant_count >= 0),
  unsold_estimated_kg NUMERIC NOT NULL CHECK (unsold_estimated_kg >= 0),
  disposition TEXT CHECK (disposition IN ('discard','donate','consume','process','other')),
  note TEXT,
  UNIQUE(round_id,round_item_id)
);
ALTER TABLE public.round_unsold_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_unsold_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_read_unsold_closures ON public.round_unsold_closures;
CREATE POLICY admin_read_unsold_closures ON public.round_unsold_closures FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS admin_read_unsold_items ON public.round_unsold_items;
CREATE POLICY admin_read_unsold_items ON public.round_unsold_items FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.round_unsold_closures,public.round_unsold_items FROM anon,authenticated;
GRANT SELECT ON public.round_unsold_closures,public.round_unsold_items TO authenticated;
GRANT ALL ON public.round_unsold_closures,public.round_unsold_items TO service_role;

CREATE OR REPLACE FUNCTION public.close_round_unsold(
  p_round_id UUID,p_actor_id UUID,p_request_id UUID,p_closed_date DATE,p_note TEXT,p_items JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r public.planting_rounds%ROWTYPE;
  closure public.round_unsold_closures%ROWTYPE;
  ri RECORD; input JSONB; actor_email TEXT; input_count INTEGER; count_unsold INTEGER;
  remaining_count INTEGER; rate NUMERIC; yield_kg NUMERIC; delivered NUMERIC;
  other_kg NUMERIC; unsold_kg NUMERIC; total_unsold INTEGER := 0;
BEGIN
  SELECT u.email INTO actor_email FROM auth.users u JOIN public.admin_users a
    ON lower(trim(a.email))=lower(trim(u.email)) WHERE u.id=p_actor_id LIMIT 1;
  IF actor_email IS NULL THEN RAISE EXCEPTION 'ไม่มีสิทธิ์สิ้นสุดรอบปลูก'; END IF;
  -- Lock inventory before the round, matching the existing create_order flow.
  PERFORM 1 FROM public.round_items WHERE round_id=p_round_id ORDER BY id FOR UPDATE;
  SELECT * INTO r FROM public.planting_rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบรอบปลูก'; END IF;
  SELECT * INTO closure FROM public.round_unsold_closures WHERE round_id=r.id;
  IF FOUND THEN
    IF closure.request_id=p_request_id AND closure.closed_date=p_closed_date
      AND closure.request_payload=p_items AND closure.note IS NOT DISTINCT FROM nullif(trim(p_note),'') THEN
      RETURN jsonb_build_object('round_id',r.id,'closed_date',closure.closed_date,'closure_reason','unsold');
    END IF;
    RAISE EXCEPTION 'รอบนี้มีบันทึกผักขายไม่ออกและสิ้นสุดแล้ว';
  END IF;
  IF r.status::TEXT NOT IN ('booking_open','booking_closed','harvested') OR r.completed_date IS NOT NULL
    OR r.sold_out_date IS NOT NULL OR r.harvest_sale_date IS NULL OR COALESCE(r.current_step,0)<7 THEN
    RAISE EXCEPTION 'ต้องยืนยันวันที่พร้อมเก็บและขายก่อน และรอบต้องยังไม่ขายหมดหรือสิ้นสุด';
  END IF;
  IF p_closed_date IS NULL OR p_closed_date<r.harvest_sale_date
    OR p_closed_date>(now() AT TIME ZONE 'Asia/Bangkok')::DATE THEN
    RAISE EXCEPTION 'วันที่สิ้นสุดต้องตั้งแต่วันพร้อมเก็บและขาย และไม่เป็นวันในอนาคต';
  END IF;
  PERFORM 1 FROM public.orders WHERE round_id=r.id ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.orders WHERE round_id=r.id AND (
    status::TEXT NOT IN ('completed','cancelled','no_show') OR (status::TEXT='completed' AND payment_status::TEXT<>'paid')
  )) THEN RAISE EXCEPTION 'ยังมีออเดอร์ค้างส่งมอบหรือค้างชำระ กรุณาจัดการออเดอร์ก่อนสิ้นสุดรอบ'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' THEN RAISE EXCEPTION 'กรุณาระบุรายการผัก'; END IF;
  SELECT count(*) INTO input_count FROM public.round_items WHERE round_id=r.id;
  IF input_count=0 OR jsonb_array_length(p_items)<>input_count
    OR (SELECT count(DISTINCT value->>'round_item_id') FROM jsonb_array_elements(p_items))<>input_count
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x WHERE NOT EXISTS(
      SELECT 1 FROM public.round_items WHERE round_id=r.id AND id=(x->>'round_item_id')::UUID)) THEN
    RAISE EXCEPTION 'ต้องระบุผักทุกชนิดในรอบนี้อย่างละหนึ่งรายการ';
  END IF;
  INSERT INTO public.round_unsold_closures(round_id,request_id,closed_date,note,recorded_by,recorded_by_email,request_payload)
    VALUES(r.id,p_request_id,p_closed_date,nullif(trim(p_note),''),p_actor_id,actor_email,p_items);
  FOR input IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    SELECT i.*,c.name AS crop_name,COALESCE(i.loss_plants_per_kg,i.planting_plants_per_kg,c.slots_per_kg) AS rate
      INTO ri FROM public.round_items i JOIN public.crops c ON c.id=i.crop_id
      WHERE i.id=(input->>'round_item_id')::UUID AND i.round_id=r.id;
    rate:=ri.rate;
    IF rate IS NULL OR rate<=0 THEN RAISE EXCEPTION 'กรุณากำหนดจำนวนต้นต่อกิโลกรัมของผักให้ถูกต้อง'; END IF;
    remaining_count:=GREATEST(0,COALESCE(ri.loss_baseline_plant_count,ri.plant_count,round(ri.estimated_qty_kg*rate)::INTEGER)-ri.lost_plant_count);
    count_unsold:=(input->>'unsold_plant_count')::INTEGER;
    IF count_unsold IS NULL OR (input->>'unsold_plant_count')::NUMERIC<>count_unsold OR count_unsold<0 OR count_unsold>remaining_count THEN
      RAISE EXCEPTION 'จำนวนผักขายไม่ออกต้องเป็นจำนวนเต็ม และไม่เกินต้นคงเหลือ: %',ri.crop_name;
    END IF;
    other_kg:=COALESCE((input->>'other_sales_kg')::NUMERIC,0);
    IF other_kg<0 OR round(other_kg,2)<>other_kg THEN RAISE EXCEPTION 'ปริมาณขายช่องทางอื่นต้องไม่ติดลบและมีทศนิยมไม่เกินสองตำแหน่ง'; END IF;
    IF count_unsold>0 AND (input->>'disposition' IS NULL OR input->>'disposition' NOT IN ('discard','donate','consume','process','other')) THEN
      RAISE EXCEPTION 'กรุณาระบุการจัดการผักที่ขายไม่ออก: %',ri.crop_name;
    END IF;
    IF count_unsold>0 AND input->>'disposition'='other' AND length(trim(COALESCE(input->>'note','')))=0 THEN
      RAISE EXCEPTION 'กรุณาระบุรายละเอียดการจัดการผักแบบอื่น';
    END IF;
    yield_kg:=COALESCE(ri.actual_qty_kg,ri.remaining_estimated_qty_kg,ri.estimated_qty_kg);
    SELECT COALESCE(sum(GREATEST(0,oi.qty_kg-CASE WHEN oi.fulfillment_source='substitute' THEN COALESCE(oi.fulfilled_qty_kg,0) ELSE 0 END)),0)
      INTO delivered FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id
      WHERE oi.round_item_id=ri.id AND o.status::TEXT='completed';
    unsold_kg:=floor(count_unsold/rate);
    IF unsold_kg+other_kg>GREATEST(0,yield_kg-delivered) THEN
      RAISE EXCEPTION 'ยอดผักขายไม่ออกและขายช่องทางอื่นเกินผลผลิตคงเหลือ: % กรุณาตรวจสอบจำนวนหรือผลผลิตจริง',ri.crop_name;
    END IF;
    total_unsold:=total_unsold+count_unsold;
    INSERT INTO public.round_unsold_items(round_id,round_item_id,crop_name,remaining_plant_count,plants_per_kg,
      farm_yield_kg,delivered_own_kg,other_sales_kg,unsold_plant_count,unsold_estimated_kg,disposition,note)
    VALUES(r.id,ri.id,ri.crop_name,remaining_count,rate,yield_kg,delivered,other_kg,count_unsold,unsold_kg,
      CASE WHEN count_unsold>0 THEN input->>'disposition' ELSE NULL END,nullif(trim(input->>'note'),''));
  END LOOP;
  IF total_unsold=0 THEN RAISE EXCEPTION 'ต้องมีผักขายไม่ออกอย่างน้อย 1 ต้น หากขายหมดให้ใช้การสิ้นสุดรอบตามปกติ'; END IF;
  UPDATE public.planting_rounds SET status='completed',current_step=8,completed_date=p_closed_date,closure_reason='unsold',
    booking_closes_at=CASE WHEN now()>booking_opens_at THEN now() ELSE NULL END,updated_at=now() WHERE id=r.id;
  INSERT INTO public.audit_logs(actor_id,actor_email,entity_type,entity_id,action,old_data,new_data)
    VALUES(p_actor_id,actor_email,'planting_rounds',r.id::TEXT,'close_with_unsold',to_jsonb(r),
      jsonb_build_object('closure_reason','unsold','closed_date',p_closed_date,'items',p_items));
  RETURN jsonb_build_object('round_id',r.id,'closed_date',p_closed_date,'closure_reason','unsold');
END $$;
REVOKE ALL ON FUNCTION public.close_round_unsold(UUID,UUID,UUID,DATE,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.close_round_unsold(UUID,UUID,UUID,DATE,TEXT,JSONB) TO service_role;

-- A booking that began just before closure must not insert after closure commits.
CREATE OR REPLACE FUNCTION public.guard_unsold_closed_orders()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE reason TEXT;
BEGIN
  SELECT closure_reason INTO reason FROM public.planting_rounds WHERE id=NEW.round_id FOR KEY SHARE;
  IF reason='unsold' AND (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.round_id IS DISTINCT FROM OLD.round_id) THEN
    RAISE EXCEPTION 'รอบนี้บันทึกผักขายไม่ออกและสิ้นสุดแล้ว ไม่สามารถสร้างหรือเปลี่ยนสถานะออเดอร์ได้';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_unsold_closed_orders() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_unsold_closed_orders ON public.orders;
CREATE TRIGGER guard_unsold_closed_orders BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.guard_unsold_closed_orders();

CREATE OR REPLACE FUNCTION public.guard_unsold_closed_items()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE round_id UUID; reason TEXT;
BEGIN
  IF TG_OP='UPDATE' AND NEW.order_id=OLD.order_id AND NEW.round_item_id=OLD.round_item_id
    AND NEW.qty_kg=OLD.qty_kg AND NEW.fulfillment_source IS NOT DISTINCT FROM OLD.fulfillment_source
    AND NEW.fulfilled_qty_kg IS NOT DISTINCT FROM OLD.fulfilled_qty_kg THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.orders o JOIN public.planting_rounds r ON r.id=o.round_id
    WHERE o.id=OLD.order_id AND r.closure_reason='unsold') THEN
    RAISE EXCEPTION 'ไม่สามารถเปลี่ยนปริมาณผักของรอบที่สิ้นสุดพร้อมบันทึกผักขายไม่ออกแล้ว';
  END IF;
  SELECT o.round_id INTO round_id FROM public.orders o WHERE o.id=CASE WHEN TG_OP='DELETE' THEN OLD.order_id ELSE NEW.order_id END;
  SELECT closure_reason INTO reason FROM public.planting_rounds WHERE id=round_id FOR KEY SHARE;
  IF reason='unsold' THEN RAISE EXCEPTION 'ไม่สามารถเปลี่ยนปริมาณผักของรอบที่สิ้นสุดพร้อมบันทึกผักขายไม่ออกแล้ว'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_unsold_closed_items() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_unsold_closed_items ON public.order_items;
CREATE TRIGGER guard_unsold_closed_items BEFORE INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.guard_unsold_closed_items();

CREATE OR REPLACE FUNCTION public.protect_unsold_closed_round()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.closure_reason='unsold' AND (NEW.status::TEXT IS DISTINCT FROM 'completed' OR NEW.current_step IS DISTINCT FROM 8
    OR NEW.closure_reason IS DISTINCT FROM OLD.closure_reason OR NEW.completed_date IS DISTINCT FROM OLD.completed_date
    OR NEW.sold_out_date IS DISTINCT FROM OLD.sold_out_date OR NEW.harvest_sale_date IS DISTINCT FROM OLD.harvest_sale_date) THEN
    RAISE EXCEPTION 'รอบที่บันทึกผักขายไม่ออกและสิ้นสุดแล้วไม่สามารถเปิดใหม่หรือแก้สถานะย้อนหลังได้';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_unsold_closed_round ON public.planting_rounds;
CREATE TRIGGER protect_unsold_closed_round BEFORE UPDATE ON public.planting_rounds
FOR EACH ROW EXECUTE FUNCTION public.protect_unsold_closed_round();
NOTIFY pgrst,'reload schema';
COMMIT;
