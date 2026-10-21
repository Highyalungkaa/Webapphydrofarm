-- Manual upgrade from migration 033 or later. No need to run 034 separately.
-- Preserves historical orders/estimates; new ordering has no kilogram inventory.
BEGIN;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS own_qty_kg NUMERIC(10,2) CHECK(own_qty_kg>=0);
ALTER TABLE public.planting_rounds ADD COLUMN IF NOT EXISTS purchase_limit_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.plant_losses ALTER COLUMN plants_per_kg DROP NOT NULL, ALTER COLUMN estimated_loss_kg DROP NOT NULL;
ALTER TABLE public.round_unsold_items ALTER COLUMN plants_per_kg DROP NOT NULL,
  ALTER COLUMN farm_yield_kg DROP NOT NULL, ALTER COLUMN unsold_estimated_kg DROP NOT NULL;
ALTER TABLE public.round_unsold_items ADD COLUMN IF NOT EXISTS unsold_actual_kg NUMERIC(10,2) CHECK(unsold_actual_kg>=0);
DROP TRIGGER IF EXISTS snapshot_planting_rate ON public.round_items;
ALTER TABLE public.round_items ALTER COLUMN estimated_qty_kg SET DEFAULT 0, ALTER COLUMN bookable_qty_kg SET DEFAULT 0;

-- Historical estimates remain in storage; no booking capacity is derived from them.
CREATE OR REPLACE FUNCTION public.round_item_booking_limit(bookable NUMERIC,actual NUMERIC,remaining NUMERIC,additional NUMERIC DEFAULT 0)
RETURNS NUMERIC LANGUAGE SQL IMMUTABLE AS $$ SELECT NULL::NUMERIC $$;

CREATE OR REPLACE FUNCTION public.set_round_purchase_limits(p_actor_id UUID,p_round_id UUID,p_enabled BOOLEAN,p_items JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor_email TEXT; r RECORD; input JSONB; cap NUMERIC; n INTEGER;
BEGIN
  SELECT u.email INTO actor_email FROM auth.users u JOIN public.admin_users a ON lower(a.email)=lower(u.email) WHERE u.id=p_actor_id;
  IF actor_email IS NULL THEN RAISE EXCEPTION 'ไม่มีสิทธิ์กำหนดจำนวนการซื้อ'; END IF;
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'กรุณาระบุเปิดหรือปิดการจำกัดจำนวน'; END IF;
  PERFORM 1 FROM public.round_items WHERE round_id=p_round_id ORDER BY id FOR UPDATE;
  SELECT * INTO r FROM public.planting_rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบรอบปลูก'; END IF;
  IF r.status::TEXT IN ('completed','cancelled') OR r.closure_reason IS NOT NULL THEN RAISE EXCEPTION 'รอบสิ้นสุดแล้ว ไม่สามารถแก้การจำกัดจำนวน'; END IF;
  IF p_enabled THEN
    SELECT count(*) INTO n FROM public.round_items WHERE round_id=p_round_id;
    IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)<>n OR n=0
      OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_items))<>n THEN
      RAISE EXCEPTION 'กรุณากำหนดจำนวนสูงสุดให้ครบทุกชนิดผักอย่างละหนึ่งรายการ'; END IF;
    FOR input IN SELECT value FROM jsonb_array_elements(p_items) LOOP
      cap:=(input->>'max_qty_per_order_kg')::NUMERIC;
      IF cap IS NULL OR cap<0.5 OR cap>99999999 OR round(cap,2)<>cap THEN RAISE EXCEPTION 'จำนวนสูงสุดต่อออเดอร์ต้องอย่างน้อย 0.5 กก. และมีทศนิยมไม่เกิน 2 ตำแหน่ง'; END IF;
      UPDATE public.round_items SET max_qty_per_order_kg=cap WHERE id=(input->>'id')::UUID AND round_id=p_round_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'ผักที่เลือกไม่อยู่ในรอบนี้'; END IF;
    END LOOP;
  END IF;
  UPDATE public.planting_rounds SET purchase_limit_enabled=p_enabled,updated_at=now() WHERE id=p_round_id;
  INSERT INTO public.audit_logs(actor_id,actor_email,entity_type,entity_id,action,old_data,new_data)
    VALUES(p_actor_id,actor_email,'planting_rounds',p_round_id::TEXT,'update',jsonb_build_object('purchase_limit_enabled',r.purchase_limit_enabled),
      jsonb_build_object('purchase_limit_enabled',p_enabled,'limits',p_items));
  RETURN jsonb_build_object('round_id',p_round_id,'purchase_limit_enabled',p_enabled);
END $$;
REVOKE ALL ON FUNCTION public.set_round_purchase_limits(UUID,UUID,BOOLEAN,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_round_purchase_limits(UUID,UUID,BOOLEAN,JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.check_plant_loss_booking_capacity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE enabled BOOLEAN; cap NUMERIC;
BEGIN
  IF TG_OP='UPDATE' AND NEW.qty_kg<=OLD.qty_kg AND NEW.round_item_id=OLD.round_item_id AND NEW.order_id=OLD.order_id THEN RETURN NEW; END IF;
  SELECT r.purchase_limit_enabled,i.max_qty_per_order_kg INTO enabled,cap FROM public.round_items i
    JOIN public.planting_rounds r ON r.id=i.round_id WHERE i.id=NEW.round_item_id FOR UPDATE OF i;
  IF enabled AND cap IS NOT NULL AND NEW.qty_kg>cap THEN RAISE EXCEPTION 'รอบนี้จำกัดจำนวน ผักชนิดนี้สั่งได้สูงสุด % กก. ต่อออเดอร์',cap; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.check_restored_order_loss_capacity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN RETURN NEW; END $$;

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


-- Keep all account, booking window, payment and allocation validation. Remove
-- checks against projected kilograms from the two order creation entry points.
DO $$
DECLARE definition TEXT; target REGPROCEDURE;
BEGIN
  target:='public.create_order(uuid,uuid,jsonb,fulfillment_method,text,uuid,character varying,text,boolean)'::REGPROCEDURE;
  SELECT pg_get_functiondef(target) INTO definition;
  definition:=replace(definition,'IF v_round_item.max_qty_per_order_kg IS NOT NULL','IF v_round.purchase_limit_enabled AND v_round_item.max_qty_per_order_kg IS NOT NULL');
  definition:=regexp_replace(definition,'IF v_item_qty > v_available_kg THEN[\s\S]*?END IF;','', 'g');
  EXECUTE definition;
  target:='public.create_admin_chat_order(uuid,uuid,jsonb)'::REGPROCEDURE;
  SELECT pg_get_functiondef(target) INTO definition;
  definition:=replace(definition,'IF ri.max_qty_per_order_kg IS NOT NULL','IF r.purchase_limit_enabled AND ri.max_qty_per_order_kg IS NOT NULL');
  definition:=regexp_replace(definition,'IF qty>public.round_item_booking_limit[\s\S]*?END IF;','', 'g');
  definition:=regexp_replace(definition,'IF qty>LEAST[\s\S]*?END IF;','', 'g');
  EXECUTE definition;
  target:='public.record_plant_loss(uuid,uuid,uuid,uuid,date,integer,text,uuid,text,text,uuid)'::REGPROCEDURE;
  SELECT pg_get_functiondef(target) INTO definition;
  definition:=regexp_replace(definition,'  SELECT COALESCE\(ri.loss_plants_per_kg[\s\S]*?  before_kg := floor[^;]*;',
    '  baseline := COALESCE(ri.loss_baseline_plant_count,ri.plant_count); IF baseline IS NULL OR baseline<=0 THEN RAISE EXCEPTION ''กรุณาระบุจำนวนต้นที่ปลูกก่อนบันทึกผักเสียหาย''; END IF; rate := NULL; before_kg := NULL;');
  definition:=regexp_replace(definition,'after_kg := floor[^;]*;','after_kg := NULL;','g');
  definition:=replace(definition,'loss_plants_per_kg = rate, remaining_estimated_qty_kg = after_kg','loss_plants_per_kg = ri.loss_plants_per_kg, remaining_estimated_qty_kg = ri.remaining_estimated_qty_kg');
  EXECUTE definition;
END $$;

REVOKE ALL ON FUNCTION public.create_order(UUID,UUID,JSONB,fulfillment_method,TEXT,UUID,VARCHAR,TEXT,BOOLEAN) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(UUID,UUID,JSONB,fulfillment_method,TEXT,UUID,VARCHAR,TEXT,BOOLEAN) TO service_role;
REVOKE ALL ON FUNCTION public.create_admin_chat_order(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_admin_chat_order(UUID,UUID,JSONB) TO service_role;

-- Old clients must not add artificial kilogram inventory to the new model.
DO $$ BEGIN
  IF to_regprocedure('public.add_round_weighed_stock(uuid,uuid,uuid,uuid,numeric,numeric,text,boolean)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.add_round_weighed_stock(UUID,UUID,UUID,UUID,NUMERIC,NUMERIC,TEXT,BOOLEAN) FROM PUBLIC,anon,authenticated,service_role;
  END IF;
END $$;

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
    SELECT i.*,c.name AS crop_name
      INTO ri FROM public.round_items i JOIN public.crops c ON c.id=i.crop_id
      WHERE i.id=(input->>'round_item_id')::UUID AND i.round_id=r.id;
    rate:=NULL;
    remaining_count:=GREATEST(0,COALESCE(ri.loss_baseline_plant_count,ri.plant_count,0)-ri.lost_plant_count);
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
    yield_kg:=NULL;
    SELECT COALESCE(sum(COALESCE(oi.own_qty_kg,GREATEST(0,oi.qty_kg-CASE WHEN oi.fulfillment_source='substitute' THEN COALESCE(oi.fulfilled_qty_kg,0) ELSE 0 END))),0)
      INTO delivered FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id
      WHERE oi.round_item_id=ri.id AND o.status::TEXT='completed';
    unsold_kg:=COALESCE((input->>'unsold_qty_kg')::NUMERIC,0);
    IF unsold_kg<0 OR round(unsold_kg,2)<>unsold_kg THEN RAISE EXCEPTION 'น้ำหนักผักขายไม่ออกต้องมาจากการชั่ง ไม่ติดลบ และมีทศนิยมไม่เกินสองตำแหน่ง'; END IF;
    total_unsold:=total_unsold+count_unsold;
    INSERT INTO public.round_unsold_items(round_id,round_item_id,crop_name,remaining_plant_count,plants_per_kg,
      farm_yield_kg,delivered_own_kg,other_sales_kg,unsold_plant_count,unsold_estimated_kg,unsold_actual_kg,disposition,note)
    VALUES(r.id,ri.id,ri.crop_name,remaining_count,rate,yield_kg,delivered,other_kg,count_unsold,NULL,unsold_kg,
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


NOTIFY pgrst,'reload schema';
COMMIT;
