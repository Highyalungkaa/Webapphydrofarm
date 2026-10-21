-- Orders taken by an administrator from the Facebook page share online stock.
BEGIN;
ALTER TABLE public.orders ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_source TEXT NOT NULL DEFAULT 'website';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source_reference TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS admin_request_id UUID;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS admin_request_payload JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS orders_admin_request_unique ON public.orders(admin_request_id) WHERE admin_request_id IS NOT NULL;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_customer_identity;
ALTER TABLE public.orders ADD CONSTRAINT orders_customer_identity CHECK (
  customer_id IS NOT NULL OR (order_source='facebook_chat' AND length(trim(COALESCE(customer_name,'')))>0 AND created_by IS NOT NULL)
);

CREATE OR REPLACE FUNCTION public.create_admin_chat_order(p_actor_id UUID,p_request_id UUID,p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor_email TEXT; existing RECORD; r RECORD; ri RECORD; profile RECORD; input JSONB;
  ids UUID[]; round_id_value UUID; customer UUID; order_id_value UUID; qty NUMERIC; booked NUMERIC;
  total NUMERIC:=0; total_kg NUMERIC:=0; minimum_kg NUMERIC; no_show_limit NUMERIC;
  customer_name_value TEXT; address_value TEXT;
BEGIN
  SELECT u.email INTO actor_email FROM auth.users u JOIN public.admin_users a ON lower(a.email)=lower(u.email) WHERE u.id=p_actor_id;
  IF actor_email IS NULL THEN RAISE EXCEPTION 'ไม่มีสิทธิ์เพิ่มออเดอร์'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'กรุณาระบุรหัสการบันทึก'; END IF;
  -- Serialize retries before taking stock locks, including simultaneous submissions.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::TEXT,0));
  SELECT * INTO existing FROM public.orders WHERE admin_request_id=p_request_id;
  IF FOUND THEN
    IF existing.created_by<>p_actor_id OR existing.admin_request_payload IS DISTINCT FROM p_payload THEN
      RAISE EXCEPTION 'ข้อมูลการบันทึกซ้ำไม่ตรงกับรายการเดิม';
    END IF;
    RETURN jsonb_build_object('order_id',existing.id,'total_amount',existing.total_amount);
  END IF;
  round_id_value:=(p_payload->>'round_id')::UUID;
  customer:=nullif(p_payload->>'customer_id','')::UUID;
  customer_name_value:=nullif(trim(p_payload->>'customer_name'),'');
  IF customer IS NOT NULL THEN
    SELECT * INTO profile FROM public.profiles WHERE id=customer;
    IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบลูกค้าที่เลือก'; END IF;
    customer_name_value:=COALESCE(customer_name_value,profile.full_name);
    SELECT COALESCE((value->>'value')::NUMERIC,value::NUMERIC,0) INTO no_show_limit FROM public.app_settings WHERE key='no_show_limit';
    IF no_show_limit>0 AND profile.no_show_count>=no_show_limit THEN RAISE EXCEPTION 'ลูกค้ามีประวัติไม่มารับผักถึงจำนวนที่กำหนด'; END IF;
  END IF;
  IF customer_name_value IS NULL OR length(trim(COALESCE(p_payload->>'contact_phone','')))<9 THEN
    RAISE EXCEPTION 'กรุณากรอกชื่อลูกค้าและเบอร์โทรศัพท์';
  END IF;
  IF (p_payload->>'accepted_substitution_terms')::BOOLEAN IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'กรุณายืนยันว่าได้แจ้งเงื่อนไขการทดแทนผักให้ลูกค้าทราบแล้ว';
  END IF;
  IF p_payload->>'fulfillment_method' IS NULL OR p_payload->>'fulfillment_method' NOT IN ('pickup','delivery') THEN RAISE EXCEPTION 'วิธีรับผักไม่ถูกต้อง'; END IF;
  IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items')=0 THEN RAISE EXCEPTION 'กรุณาเลือกผักอย่างน้อยหนึ่งชนิด'; END IF;
  SELECT array_agg((value->>'round_item_id')::UUID) INTO ids FROM jsonb_array_elements(p_payload->'items');
  IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'รายการผักซ้ำกัน'; END IF;
  -- Match the item-before-round lock order used by unsold closure.
  PERFORM 1 FROM public.round_items WHERE round_id=round_id_value ORDER BY id FOR UPDATE;
  SELECT * INTO r FROM public.planting_rounds WHERE id=round_id_value FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบรอบปลูก'; END IF;
  IF r.status::TEXT<>'booking_open' OR r.closure_reason IS NOT NULL OR r.completed_date IS NOT NULL
    OR r.booking_opens_at>now() OR r.booking_closes_at<=now() THEN RAISE EXCEPTION 'รอบนี้ยังไม่เปิดรับจองหรือปิดรับจองแล้ว'; END IF;
  FOR input IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    qty:=(input->>'qty_kg')::NUMERIC;
    IF qty IS NULL OR qty<0.5 OR qty>99999999 OR round(qty,2)<>qty THEN RAISE EXCEPTION 'ปริมาณผักต้องอย่างน้อย 0.5 กก. และมีทศนิยมไม่เกิน 2 ตำแหน่ง'; END IF;
    SELECT * INTO ri FROM public.round_items WHERE id=(input->>'round_item_id')::UUID AND round_id=round_id_value;
    IF NOT FOUND THEN RAISE EXCEPTION 'ผักที่เลือกไม่อยู่ในรอบนี้'; END IF;
    IF ri.max_qty_per_order_kg IS NOT NULL AND qty>ri.max_qty_per_order_kg THEN RAISE EXCEPTION 'ปริมาณเกินจำนวนสูงสุดต่อออเดอร์'; END IF;
    SELECT COALESCE(sum(oi.qty_kg),0) INTO booked FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id
      WHERE oi.round_item_id=ri.id AND o.status::TEXT<>'cancelled';
    IF qty>LEAST(ri.bookable_qty_kg,COALESCE(ri.remaining_estimated_qty_kg,ri.bookable_qty_kg))-booked THEN
      RAISE EXCEPTION 'ผักคงเหลือไม่เพียงพอ กรุณาตรวจสอบปริมาณล่าสุด'; END IF;
    total:=total+qty*ri.price_per_kg; total_kg:=total_kg+qty;
  END LOOP;
  IF p_payload->>'fulfillment_method'='delivery' THEN
    address_value:=nullif(trim(p_payload->>'delivery_address'),'');
    IF address_value IS NULL THEN RAISE EXCEPTION 'กรุณากรอกที่อยู่จัดส่ง'; END IF;
    SELECT COALESCE((value->>'value')::NUMERIC,value::NUMERIC,0) INTO minimum_kg FROM public.app_settings WHERE key='delivery_min_total_kg';
    IF total_kg<minimum_kg THEN RAISE EXCEPTION 'บริการจัดส่งต้องสั่งอย่างน้อย % กก.',minimum_kg; END IF;
  END IF;
  INSERT INTO public.orders(round_id,customer_id,customer_name,order_source,source_reference,created_by,admin_request_id,admin_request_payload,
    fulfillment_method,delivery_address,contact_phone,note,status,payment_status,total_amount,accepted_substitution_terms_at)
    VALUES(round_id_value,customer,customer_name_value,'facebook_chat',nullif(trim(p_payload->>'source_reference'),''),p_actor_id,p_request_id,p_payload,
      (p_payload->>'fulfillment_method')::public.fulfillment_method,address_value,trim(p_payload->>'contact_phone'),nullif(trim(p_payload->>'note'),''),
      'pending_confirmation','unpaid',round(total,2),now()) RETURNING id INTO order_id_value;
  FOR input IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    INSERT INTO public.order_items(order_id,round_item_id,qty_kg,price_per_kg,fulfillment_source)
      SELECT order_id_value,id,(input->>'qty_kg')::NUMERIC,price_per_kg,'own' FROM public.round_items WHERE id=(input->>'round_item_id')::UUID;
  END LOOP;
  -- The normal INSERT trigger keeps website orders pending; the administrator confirms here.
  UPDATE public.orders SET status='confirmed',requires_confirmation=FALSE,confirmed_at=now() WHERE id=order_id_value;
  INSERT INTO public.audit_logs(actor_id,actor_email,entity_type,entity_id,action,new_data)
    VALUES(p_actor_id,actor_email,'orders',order_id_value::TEXT,'create',jsonb_build_object('order_source','facebook_chat','round_id',round_id_value,'total_amount',round(total,2)));
  RETURN jsonb_build_object('order_id',order_id_value,'total_amount',round(total,2),'total_kg',total_kg);
END $$;
REVOKE ALL ON FUNCTION public.create_admin_chat_order(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_admin_chat_order(UUID,UUID,JSONB) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
