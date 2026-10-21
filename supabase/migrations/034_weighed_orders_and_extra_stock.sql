BEGIN;

-- Record the weight actually packed for an order. Estimates stay unchanged;
-- weighed surplus is added separately and each addition has immutable history.
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS own_qty_kg NUMERIC(10,2) CHECK (own_qty_kg>=0);
ALTER TABLE public.round_items ADD COLUMN IF NOT EXISTS additional_qty_kg NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (additional_qty_kg>=0);
CREATE TABLE IF NOT EXISTS public.round_stock_additions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), request_id UUID NOT NULL UNIQUE,
  round_id UUID NOT NULL REFERENCES public.planting_rounds(id) ON DELETE RESTRICT,
  round_item_id UUID NOT NULL REFERENCES public.round_items(id) ON DELETE RESTRICT,
  previous_additional_kg NUMERIC(10,2) NOT NULL, added_qty_kg NUMERIC(10,2) NOT NULL CHECK(added_qty_kg>0),
  note TEXT NOT NULL, recorded_by UUID NOT NULL REFERENCES auth.users(id), recorded_by_email TEXT NOT NULL,
  reopened BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.round_stock_additions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_additions_admin_read ON public.round_stock_additions;
CREATE POLICY stock_additions_admin_read ON public.round_stock_additions FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.round_stock_additions FROM anon,authenticated;
GRANT SELECT ON public.round_stock_additions TO authenticated;
GRANT ALL ON public.round_stock_additions TO service_role;

CREATE OR REPLACE FUNCTION public.round_item_booking_limit(bookable NUMERIC,actual NUMERIC,remaining NUMERIC,additional NUMERIC DEFAULT 0)
RETURNS NUMERIC LANGUAGE SQL IMMUTABLE AS $$ SELECT LEAST(bookable,COALESCE(actual,remaining,bookable))+COALESCE(additional,0) $$;
CREATE OR REPLACE FUNCTION public.order_item_farm_reserved_kg(qty NUMERIC,source TEXT,substitute NUMERIC,status TEXT,own NUMERIC DEFAULT NULL)
RETURNS NUMERIC LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE WHEN status IN ('cancelled','no_show') THEN 0 ELSE GREATEST(0,COALESCE(own,0),qty-CASE WHEN source='substitute' THEN COALESCE(substitute,0) ELSE 0 END) END
$$;
CREATE OR REPLACE FUNCTION public.order_item_farm_allocated_kg(own NUMERIC,qty NUMERIC,source TEXT,substitute NUMERIC,status TEXT)
RETURNS NUMERIC LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE WHEN status IN ('cancelled','no_show') THEN 0 ELSE COALESCE(own,CASE WHEN status='completed' THEN public.order_item_farm_reserved_kg(qty,source,substitute,status) ELSE 0 END) END
$$;

CREATE OR REPLACE FUNCTION public.add_round_weighed_stock(p_actor_id UUID,p_round_id UUID,p_item_id UUID,p_request_id UUID,
  p_previous_additional_kg NUMERIC,p_added_qty_kg NUMERIC,p_note TEXT,p_reopen BOOLEAN DEFAULT FALSE)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor_email TEXT; r RECORD; ri RECORD; history RECORD;
BEGIN
  SELECT u.email INTO actor_email FROM auth.users u JOIN public.admin_users a ON lower(a.email)=lower(u.email) WHERE u.id=p_actor_id;
  IF actor_email IS NULL THEN RAISE EXCEPTION 'ไม่มีสิทธิ์เพิ่มปริมาณผัก'; END IF;
  IF p_request_id IS NULL OR p_added_qty_kg IS NULL OR p_added_qty_kg<=0 OR p_added_qty_kg>99999999 OR round(p_added_qty_kg,2)<>p_added_qty_kg
    OR length(trim(COALESCE(p_note,'')))=0 THEN RAISE EXCEPTION 'กรุณากรอกน้ำหนักผักส่วนที่ชั่งได้เพิ่มและเหตุผล น้ำหนักต้องมากกว่า 0 และมีทศนิยมไม่เกิน 2 ตำแหน่ง'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::TEXT,0));
  SELECT * INTO history FROM public.round_stock_additions WHERE request_id=p_request_id;
  IF FOUND THEN
    IF history.recorded_by<>p_actor_id OR history.round_id<>p_round_id OR history.round_item_id<>p_item_id
      OR history.added_qty_kg<>p_added_qty_kg OR history.previous_additional_kg IS DISTINCT FROM p_previous_additional_kg
      OR history.note<>trim(p_note) OR history.reopened IS DISTINCT FROM p_reopen THEN RAISE EXCEPTION 'ข้อมูลบันทึกซ้ำไม่ตรงกับรายการเดิม'; END IF;
    RETURN to_jsonb(history);
  END IF;
  PERFORM 1 FROM public.round_items WHERE round_id=p_round_id ORDER BY id FOR UPDATE;
  SELECT * INTO r FROM public.planting_rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบรอบปลูก'; END IF;
  IF r.status::TEXT IN ('completed','cancelled') OR r.closure_reason IS NOT NULL OR r.completed_date IS NOT NULL
    OR COALESCE(r.current_step,0)<6 THEN RAISE EXCEPTION 'เพิ่มผักได้ตั้งแต่ขั้นพร้อมเก็บและขาย และรอบต้องยังไม่สิ้นสุด'; END IF;
  SELECT * INTO ri FROM public.round_items WHERE id=p_item_id AND round_id=p_round_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ผักที่เลือกไม่อยู่ในรอบนี้'; END IF;
  IF ri.additional_qty_kg IS DISTINCT FROM p_previous_additional_kg THEN RAISE EXCEPTION 'ปริมาณถูกเพิ่มจากหน้าหรือผู้ใช้อื่นแล้ว กรุณาโหลดข้อมูลล่าสุด'; END IF;
  IF p_reopen AND (r.harvest_sale_date IS NULL OR r.harvest_sale_date>(now() AT TIME ZONE 'Asia/Bangkok')::DATE) THEN
    RAISE EXCEPTION 'กรุณายืนยันวันพร้อมเก็บและขายก่อนเปิดรับจองส่วนที่เหลือ'; END IF;
  UPDATE public.round_items SET additional_qty_kg=additional_qty_kg+p_added_qty_kg WHERE id=ri.id;
  IF p_reopen THEN
    UPDATE public.planting_rounds SET status='booking_open',booking_opens_at=LEAST(COALESCE(booking_opens_at,now()),now()),
      booking_closes_at=NULL,sold_out_date=NULL,current_step=7,updated_at=now() WHERE id=r.id;
  END IF;
  INSERT INTO public.round_stock_additions(request_id,round_id,round_item_id,previous_additional_kg,added_qty_kg,note,recorded_by,recorded_by_email,reopened)
    VALUES(p_request_id,r.id,ri.id,ri.additional_qty_kg,p_added_qty_kg,trim(p_note),p_actor_id,actor_email,p_reopen) RETURNING * INTO history;
  INSERT INTO public.audit_logs(actor_id,actor_email,entity_type,entity_id,action,old_data,new_data)
    VALUES(p_actor_id,actor_email,'round_items',ri.id::TEXT,'update',to_jsonb(ri),to_jsonb(history));
  RETURN to_jsonb(history);
END $$;
REVOKE ALL ON FUNCTION public.add_round_weighed_stock(UUID,UUID,UUID,UUID,NUMERIC,NUMERIC,TEXT,BOOLEAN) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.add_round_weighed_stock(UUID,UUID,UUID,UUID,NUMERIC,NUMERIC,TEXT,BOOLEAN) TO service_role;

-- Shared guards cover online orders, chat orders, direct admin updates and restoration.
CREATE OR REPLACE FUNCTION public.check_plant_loss_booking_capacity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ri RECORD; booked NUMERIC; order_status TEXT;
BEGIN
  IF TG_OP='UPDATE' AND NEW.qty_kg<=OLD.qty_kg AND NEW.round_item_id=OLD.round_item_id AND NEW.order_id=OLD.order_id
    AND public.order_item_farm_reserved_kg(NEW.qty_kg,NEW.fulfillment_source::TEXT,NEW.fulfilled_qty_kg,'confirmed',NEW.own_qty_kg)
      <=public.order_item_farm_reserved_kg(OLD.qty_kg,OLD.fulfillment_source::TEXT,OLD.fulfilled_qty_kg,'confirmed',OLD.own_qty_kg) THEN RETURN NEW; END IF;
  SELECT * INTO ri FROM public.round_items WHERE id=NEW.round_item_id FOR UPDATE;
  SELECT status::TEXT INTO order_status FROM public.orders WHERE id=NEW.order_id;
  IF order_status IN ('cancelled','no_show') THEN RETURN NEW; END IF;
  SELECT COALESCE(sum(public.order_item_farm_reserved_kg(oi.qty_kg,oi.fulfillment_source::TEXT,oi.fulfilled_qty_kg,o.status::TEXT,oi.own_qty_kg)),0)
    INTO booked FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id WHERE oi.round_item_id=ri.id AND oi.id<>NEW.id;
  IF booked+public.order_item_farm_reserved_kg(NEW.qty_kg,NEW.fulfillment_source::TEXT,NEW.fulfilled_qty_kg,order_status,NEW.own_qty_kg)
    >public.round_item_booking_limit(ri.bookable_qty_kg,ri.actual_qty_kg,ri.remaining_estimated_qty_kg,ri.additional_qty_kg) THEN
    RAISE EXCEPTION 'ผลผลิตคงเหลือไม่เพียงพอ กรุณาตรวจสอบน้ำหนักจริงหรือผักทดแทน'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.check_restored_order_loss_capacity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ri RECORD; reserved NUMERIC;
BEGIN
  IF OLD.status::TEXT NOT IN ('cancelled','no_show') OR NEW.status::TEXT IN ('cancelled','no_show') THEN RETURN NEW; END IF;
  FOR ri IN SELECT * FROM public.round_items WHERE id IN (SELECT round_item_id FROM public.order_items WHERE order_id=NEW.id) ORDER BY id FOR UPDATE LOOP
    SELECT COALESCE(sum(public.order_item_farm_reserved_kg(oi.qty_kg,oi.fulfillment_source::TEXT,oi.fulfilled_qty_kg,
      CASE WHEN o.id=NEW.id THEN NEW.status::TEXT ELSE o.status::TEXT END,oi.own_qty_kg)),0) INTO reserved
      FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id WHERE oi.round_item_id=ri.id;
    IF reserved>public.round_item_booking_limit(ri.bookable_qty_kg,ri.actual_qty_kg,ri.remaining_estimated_qty_kg,ri.additional_qty_kg) THEN
      RAISE EXCEPTION 'ไม่สามารถคืนสถานะออเดอร์ได้ ผลผลิตคงเหลือไม่เพียงพอ'; END IF;
  END LOOP;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_farm_allocation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ri RECORD; r RECORD; o RECORD; allocated NUMERIC; sub NUMERIC;
BEGIN
  IF TG_OP='UPDATE' AND NEW.own_qty_kg IS NOT DISTINCT FROM OLD.own_qty_kg AND NEW.qty_kg=OLD.qty_kg
    AND NEW.fulfilled_qty_kg IS NOT DISTINCT FROM OLD.fulfilled_qty_kg AND NEW.fulfillment_source IS NOT DISTINCT FROM OLD.fulfillment_source
    AND NEW.order_id=OLD.order_id AND NEW.round_item_id=OLD.round_item_id THEN RETURN NEW; END IF;
  SELECT * INTO ri FROM public.round_items WHERE id=NEW.round_item_id FOR UPDATE;
  SELECT * INTO o FROM public.orders WHERE id=NEW.order_id;
  SELECT * INTO r FROM public.planting_rounds WHERE id=ri.round_id;
  IF TG_OP='UPDATE' AND (NEW.own_qty_kg IS DISTINCT FROM OLD.own_qty_kg) AND (r.status::TEXT IN ('completed','cancelled') OR r.closure_reason IS NOT NULL) THEN
    RAISE EXCEPTION 'รอบสิ้นสุดแล้ว ไม่สามารถแก้น้ำหนักที่จัดให้ออเดอร์'; END IF;
  sub:=CASE WHEN NEW.fulfillment_source::TEXT='substitute' THEN COALESCE(NEW.fulfilled_qty_kg,0) ELSE 0 END;
  IF NEW.own_qty_kg<0 OR sub<0 OR sub>NEW.qty_kg THEN RAISE EXCEPTION 'น้ำหนักผักต้องไม่ติดลบ และผักทดแทนต้องไม่เกินยอดสั่งจอง'; END IF;
  IF o.status::TEXT IN ('ready','completed') AND (NEW.own_qty_kg IS NULL OR NEW.own_qty_kg+sub<NEW.qty_kg) THEN
    RAISE EXCEPTION 'กรุณาจัดผักฟาร์มและผักทดแทนให้ครบยอดสั่งก่อนพร้อมรับหรือส่งมอบ'; END IF;
  SELECT COALESCE(sum(public.order_item_farm_allocated_kg(oi.own_qty_kg,oi.qty_kg,oi.fulfillment_source::TEXT,oi.fulfilled_qty_kg,ord.status::TEXT)),0)
    INTO allocated FROM public.order_items oi JOIN public.orders ord ON ord.id=oi.order_id WHERE oi.round_item_id=ri.id AND oi.id<>NEW.id;
  IF allocated+public.order_item_farm_allocated_kg(NEW.own_qty_kg,NEW.qty_kg,NEW.fulfillment_source::TEXT,NEW.fulfilled_qty_kg,o.status::TEXT)
    >COALESCE(ri.actual_qty_kg,ri.remaining_estimated_qty_kg,ri.estimated_qty_kg)+ri.additional_qty_kg THEN
    RAISE EXCEPTION 'ผักฟาร์มคงเหลือไม่พอจัดออเดอร์ กรุณากรอกผักทดแทนหรือเพิ่มน้ำหนักเก็บจริง'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_farm_allocation ON public.order_items;
CREATE TRIGGER guard_farm_allocation BEFORE INSERT OR UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.guard_farm_allocation();
REVOKE ALL ON FUNCTION public.guard_farm_allocation() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.require_complete_farm_allocation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.status::TEXT IN ('ready','completed') AND OLD.status IS DISTINCT FROM NEW.status AND EXISTS(
    SELECT 1 FROM public.order_items oi WHERE oi.order_id=NEW.id AND (oi.own_qty_kg IS NULL OR
      oi.own_qty_kg+CASE WHEN oi.fulfillment_source::TEXT='substitute' THEN COALESCE(oi.fulfilled_qty_kg,0) ELSE 0 END<oi.qty_kg)
  ) THEN RAISE EXCEPTION 'กรุณากรอกน้ำหนักจัดจริงและผักทดแทนให้ครบก่อนเปลี่ยนเป็นพร้อมรับหรือสำเร็จ'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS require_complete_farm_allocation ON public.orders;
CREATE TRIGGER require_complete_farm_allocation BEFORE UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.require_complete_farm_allocation();
REVOKE ALL ON FUNCTION public.require_complete_farm_allocation() FROM PUBLIC,anon,authenticated;

-- Save allocations, substitute costs, discounts, payment and order status together.
CREATE OR REPLACE FUNCTION public.save_admin_order_allocation(p_actor_id UUID,p_order_id UUID,p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor_email TEXT; o RECORD; r RECORD; input JSONB; item RECORD; own NUMERIC; sub NUMERIC; cost NUMERIC; discount NUMERIC; n INTEGER; updated public.orders%ROWTYPE;
BEGIN
  SELECT u.email INTO actor_email FROM auth.users u JOIN public.admin_users a ON lower(a.email)=lower(u.email) WHERE u.id=p_actor_id;
  IF actor_email IS NULL THEN RAISE EXCEPTION 'ไม่มีสิทธิ์จัดผักให้ออเดอร์'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบออเดอร์'; END IF;
  PERFORM 1 FROM public.round_items WHERE round_id=o.round_id ORDER BY id FOR UPDATE;
  SELECT * INTO r FROM public.planting_rounds WHERE id=o.round_id FOR UPDATE;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF r.closure_reason IS NOT NULL OR r.status::TEXT IN ('completed','cancelled') THEN RAISE EXCEPTION 'รอบสิ้นสุดแล้ว ไม่สามารถแก้การจัดผัก'; END IF;
  IF p_payload->>'expected_updated_at' IS NOT NULL AND o.updated_at IS DISTINCT FROM (p_payload->>'expected_updated_at')::TIMESTAMPTZ THEN
    RAISE EXCEPTION 'ออเดอร์ถูกแก้ไขจากหน้าอื่นแล้ว กรุณาโหลดข้อมูลล่าสุด'; END IF;
  -- A cancellation/no-show releases its stock inside the same transaction.
  -- Moving back to a preparation state also allows a partial allocation.
  IF p_payload->>'status' IS NOT NULL AND p_payload->>'status' NOT IN ('ready','completed') THEN
    UPDATE public.orders SET status=(p_payload->>'status')::public.order_status WHERE id=o.id;
  END IF;
  SELECT count(*) INTO n FROM public.order_items WHERE order_id=o.id;
  IF jsonb_typeof(p_payload->'allocation_items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'allocation_items')<>n
    OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_payload->'allocation_items'))<>n THEN RAISE EXCEPTION 'กรุณาระบุการจัดผักให้ครบทุกชนิดอย่างละหนึ่งรายการ'; END IF;
  FOR input IN SELECT value FROM jsonb_array_elements(p_payload->'allocation_items') LOOP
    SELECT * INTO item FROM public.order_items WHERE id=(input->>'id')::UUID AND order_id=o.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'รายการผักไม่อยู่ในออเดอร์นี้'; END IF;
    own:=(input->>'own_qty_kg')::NUMERIC; sub:=(input->>'substitute_qty_kg')::NUMERIC; cost:=(input->>'substitute_total_cost')::NUMERIC;
    discount:=(input->>'discount_amount')::NUMERIC;
    IF sub IS NULL OR cost IS NULL OR discount IS NULL OR own<0 OR sub<0 OR cost<0 OR discount<0
      OR round(own,2)<>own OR round(sub,2)<>sub OR round(cost,2)<>cost OR round(discount,2)<>discount
      OR sub>item.qty_kg OR (sub=0 AND cost>0) OR discount>item.qty_kg*item.price_per_kg THEN
      RAISE EXCEPTION 'น้ำหนักจัดจริง ผักทดแทน ต้นทุน หรือส่วนลดไม่ถูกต้อง'; END IF;
    UPDATE public.order_items SET own_qty_kg=own,fulfilled_qty_kg=CASE WHEN sub>0 THEN sub ELSE NULL END,
      fulfillment_source=CASE WHEN sub>0 THEN 'substitute'::public.fulfillment_source ELSE 'own'::public.fulfillment_source END,
      substitute_total_cost=CASE WHEN sub>0 THEN cost ELSE NULL END,
      substitute_cost_per_kg=CASE WHEN sub>0 THEN round(cost/sub,2) ELSE NULL END,discount_amount=discount WHERE id=item.id;
    INSERT INTO public.audit_logs(actor_id,actor_email,entity_type,entity_id,action,old_data,new_data)
      VALUES(p_actor_id,actor_email,'order_items',item.id::TEXT,'update',to_jsonb(item),input);
  END LOOP;
  UPDATE public.orders SET
    status=COALESCE((p_payload->>'status')::public.order_status,status),
    confirmed_at=CASE WHEN p_payload->>'status'='confirmed' AND status::TEXT='pending_confirmation' THEN now() ELSE confirmed_at END,
    payment_status=COALESCE((p_payload->>'payment_status')::public.payment_status,payment_status),
    payment_method=CASE WHEN COALESCE(p_payload->>'payment_status',payment_status::TEXT)='paid' THEN COALESCE((p_payload->>'payment_method')::public.payment_method,payment_method) ELSE NULL END,
    paid_at=CASE WHEN COALESCE(p_payload->>'payment_status',payment_status::TEXT)='paid' THEN COALESCE(paid_at,now()) ELSE NULL END,
    cancelled_at=CASE WHEN p_payload->>'status'='cancelled' THEN COALESCE(cancelled_at,now()) ELSE cancelled_at END,
    cancel_reason=CASE WHEN p_payload->>'status'='cancelled' THEN p_payload->>'cancel_reason' ELSE cancel_reason END,
    note=CASE WHEN p_payload ? 'note' THEN p_payload->>'note' ELSE note END,
    total_amount=(SELECT COALESCE(sum(qty_kg*price_per_kg-discount_amount),0) FROM public.order_items WHERE order_id=o.id),updated_at=now()
    WHERE id=o.id RETURNING * INTO updated;
  IF updated.status::TEXT='no_show' AND o.status::TEXT<>'no_show' AND o.customer_id IS NOT NULL THEN
    UPDATE public.profiles SET no_show_count=no_show_count+1,updated_at=now() WHERE id=o.customer_id;
  END IF;
  INSERT INTO public.audit_logs(actor_id,actor_email,entity_type,entity_id,action,old_data,new_data)
    VALUES(p_actor_id,actor_email,'orders',o.id::TEXT,'update',to_jsonb(o),to_jsonb(updated));
  RETURN to_jsonb(updated);
END $$;
REVOKE ALL ON FUNCTION public.save_admin_order_allocation(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_admin_order_allocation(UUID,UUID,JSONB) TO service_role;

-- Update the existing booking entry points without changing their signatures.
DO $$
DECLARE definition TEXT; original TEXT; target REGPROCEDURE;
BEGIN
  target:='public.create_order(uuid,uuid,jsonb,fulfillment_method,text,uuid,character varying,text,boolean)'::REGPROCEDURE;
  SELECT pg_get_functiondef(target) INTO definition; original:=definition;
  definition:=replace(definition,'COALESCE(SUM(oi.qty_kg), 0)','COALESCE(SUM(public.order_item_farm_reserved_kg(oi.qty_kg,oi.fulfillment_source::TEXT,oi.fulfilled_qty_kg,o.status::TEXT,oi.own_qty_kg)),0)');
  definition:=replace(definition,'v_round_item.bookable_qty_kg - v_booked_kg','public.round_item_booking_limit(v_round_item.bookable_qty_kg,v_round_item.actual_qty_kg,v_round_item.remaining_estimated_qty_kg,v_round_item.additional_qty_kg) - v_booked_kg');
  IF definition=original AND position('round_item_booking_limit' IN definition)=0 THEN RAISE EXCEPTION 'create_order definition is incompatible with migration 034'; END IF;
  EXECUTE definition;
  target:='public.create_admin_chat_order(uuid,uuid,jsonb)'::REGPROCEDURE;
  SELECT pg_get_functiondef(target) INTO definition; original:=definition;
  definition:=replace(definition,'COALESCE(sum(oi.qty_kg),0)','COALESCE(sum(public.order_item_farm_reserved_kg(oi.qty_kg,oi.fulfillment_source::TEXT,oi.fulfilled_qty_kg,o.status::TEXT,oi.own_qty_kg)),0)');
  definition:=replace(definition,'LEAST(ri.bookable_qty_kg,COALESCE(ri.remaining_estimated_qty_kg,ri.bookable_qty_kg))','public.round_item_booking_limit(ri.bookable_qty_kg,ri.actual_qty_kg,ri.remaining_estimated_qty_kg,ri.additional_qty_kg)');
  IF definition=original AND position('round_item_booking_limit' IN definition)=0 THEN RAISE EXCEPTION 'chat order definition is incompatible with migration 034'; END IF;
  EXECUTE definition;
  target:='public.close_round_unsold(uuid,uuid,uuid,date,text,jsonb)'::REGPROCEDURE;
  SELECT pg_get_functiondef(target) INTO definition;
  definition:=replace(definition,'yield_kg:=COALESCE(ri.actual_qty_kg,ri.remaining_estimated_qty_kg,ri.estimated_qty_kg);','yield_kg:=COALESCE(ri.actual_qty_kg,ri.remaining_estimated_qty_kg,ri.estimated_qty_kg)+ri.additional_qty_kg;');
  IF position('COALESCE(oi.own_qty_kg' IN definition)=0 THEN
  definition:=replace(definition,'GREATEST(0,oi.qty_kg-CASE WHEN oi.fulfillment_source=''substitute'' THEN COALESCE(oi.fulfilled_qty_kg,0) ELSE 0 END)',
    'COALESCE(oi.own_qty_kg,GREATEST(0,oi.qty_kg-CASE WHEN oi.fulfillment_source=''substitute'' THEN COALESCE(oi.fulfilled_qty_kg,0) ELSE 0 END))');
  END IF;
  EXECUTE definition;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
