-- Run in Supabase SQL Editor before using the no-restock option.
-- Requires 042 and 057. Re-running this migration preserves all recorded stock reductions.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.order_item_amendments') IS NULL OR NOT EXISTS(
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='round_items' AND column_name='additional_qty_kg'
  ) THEN RAISE EXCEPTION 'กรุณารัน migration 042 และ 057 ก่อนรัน migration 059'; END IF;
END $$;
ALTER TABLE public.round_items ADD COLUMN IF NOT EXISTS unavailable_qty_kg NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(unavailable_qty_kg>=0);
COMMENT ON COLUMN public.round_items.unavailable_qty_kg IS 'Kilos withheld from sale when reducing an order without returning stock; original forecast is preserved';
CREATE OR REPLACE FUNCTION public.booking_stock_kg(p_item_id UUID)
RETURNS NUMERIC LANGUAGE SQL STABLE SET search_path=public AS $$
  SELECT GREATEST(0,CASE WHEN COALESCE(i.planting_plants_per_kg,c.slots_per_kg,0)>0 AND i.plant_count IS NOT NULL
    THEN floor(GREATEST(0,i.plant_count-COALESCE(i.lost_plant_count,0))/COALESCE(i.planting_plants_per_kg,c.slots_per_kg))
    ELSE COALESCE(i.estimated_qty_kg,0) END+COALESCE(i.additional_qty_kg,0)-COALESCE(i.unavailable_qty_kg,0))
  FROM public.round_items i JOIN public.crops c ON c.id=i.crop_id WHERE i.id=p_item_id
$$;


CREATE OR REPLACE FUNCTION public.amend_order_items_with_stock_choice(p_actor_id UUID,p_order_id UUID,p_request_id UUID,p_payload JSONB,p_preview BOOLEAN DEFAULT TRUE)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor_email TEXT; ord RECORD; previous RECORD; old_items JSONB; input JSONB; src RECORD; line RECORD; quota RECORD;
  plan JSONB:='[]'; row JSONB; remaining NUMERIC; take NUMERIC; capacity NUMERIC; total NUMERIC:=0; discount NUMERIC;
  return_stock BOOLEAN; stock_changes JSONB:='[]'; reduced NUMERIC; blocked NUMERIC;
  anchor UUID; first_date DATE; last_date DATE; result JSONB; version BIGINT; preview_token TEXT;
BEGIN
  SELECT u.email INTO actor_email FROM auth.users u JOIN public.admin_users a ON lower(a.email)=lower(u.email) WHERE u.id=p_actor_id;
  IF actor_email IS NULL THEN RAISE EXCEPTION 'ไม่มีสิทธิ์แก้รายการออเดอร์'; END IF;
  IF p_request_id IS NULL OR p_preview IS NULL THEN RAISE EXCEPTION 'ข้อมูลคำขอไม่ถูกต้อง'; END IF;
  IF p_payload ? 'return_stock' AND jsonb_typeof(p_payload->'return_stock') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'กรุณาเลือกคืนสต็อกหรือไม่คืนสต็อกให้ถูกต้อง';
  END IF;
  return_stock:=COALESCE((p_payload->>'return_stock')::BOOLEAN,TRUE);
  PERFORM pg_advisory_xact_lock(450001);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::TEXT,42));
  SELECT * INTO previous FROM public.order_item_amendments WHERE request_id=p_request_id;
  IF FOUND AND NOT p_preview THEN
    IF previous.order_id<>p_order_id OR previous.actor_id<>p_actor_id OR previous.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'รหัสคำขอถูกใช้กับข้อมูลอื่นแล้ว'; END IF;
    RETURN previous.result;
  END IF;
  IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'กรุณาเลือกผักอย่างน้อยหนึ่งชนิด'; END IF;
  IF (SELECT count(DISTINCT value->>'crop_id') FROM jsonb_array_elements(p_payload->'items'))<>jsonb_array_length(p_payload->'items') THEN RAISE EXCEPTION 'ชนิดผักต้องไม่ซ้ำกัน'; END IF;
  IF length(trim(COALESCE(p_payload->>'reason','')))<1 OR length(p_payload->>'reason')>1000 THEN RAISE EXCEPTION 'กรุณาระบุเหตุผลการแก้ไข'; END IF;
  SELECT * INTO ord FROM public.orders WHERE id=p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบคำสั่งจอง'; END IF;
  PERFORM 1 FROM public.round_items WHERE crop_id IN(SELECT (value->>'crop_id')::UUID FROM jsonb_array_elements(p_payload->'items'))
    OR id IN(SELECT round_item_id FROM public.order_items WHERE order_id=p_order_id) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.planting_rounds WHERE id=ord.round_id OR id IN(SELECT round_id FROM public.round_items
    WHERE crop_id IN(SELECT (value->>'crop_id')::UUID FROM jsonb_array_elements(p_payload->'items'))
      OR id IN(SELECT round_item_id FROM public.order_items WHERE order_id=p_order_id)) ORDER BY id FOR UPDATE;
  SELECT * INTO ord FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF p_payload->>'expected_updated_at' IS NULL OR ord.updated_at IS DISTINCT FROM (p_payload->>'expected_updated_at')::TIMESTAMPTZ THEN RAISE EXCEPTION 'ออเดอร์ถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุด'; END IF;
  IF ord.status::TEXT NOT IN('pending_confirmation','confirmed') OR ord.payment_status::TEXT<>'unpaid' THEN RAISE EXCEPTION 'แก้รายการได้เฉพาะออเดอร์รอยืนยันหรือยืนยันแล้วที่ยังไม่รับชำระเงิน'; END IF;
  IF ord.status::TEXT='pending_confirmation' AND ord.confirmation_expires_at<=now() THEN RAISE EXCEPTION 'หมดเวลารอยืนยันออเดอร์แล้ว กรุณาโหลดข้อมูลล่าสุด'; END IF;
  IF EXISTS(SELECT 1 FROM public.order_items WHERE order_id=ord.id AND (own_qty_kg IS NOT NULL OR COALESCE(fulfilled_qty_kg,0)>0)) THEN RAISE EXCEPTION 'ออเดอร์เริ่มจัดผักแล้ว ไม่สามารถเปลี่ยนชนิดผักหรือจำนวนจอง'; END IF;
  IF EXISTS(SELECT 1 FROM public.order_items oi JOIN public.round_items i ON i.id=oi.round_item_id JOIN public.planting_rounds r ON r.id=i.round_id
    WHERE oi.order_id=ord.id AND (r.closure_reason IS NOT NULL OR r.status::TEXT IN('completed','cancelled'))) THEN RAISE EXCEPTION 'รอบต้นทางสิ้นสุดแล้ว ไม่สามารถแก้รายการ'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(oi)),'[]') INTO old_items FROM public.order_items oi WHERE oi.order_id=ord.id;
  FOR input IN SELECT value FROM jsonb_array_elements(p_payload->'items') ORDER BY value->>'crop_id' LOOP
    remaining:=(input->>'qty_kg')::NUMERIC;
    IF remaining IS NULL OR remaining<0.5 OR remaining>99999999 OR remaining<>round(remaining,2) THEN RAISE EXCEPTION 'จำนวนผักขั้นต่ำ 0.5 กก. และทศนิยมไม่เกิน 2 ตำแหน่ง'; END IF;
    FOR src IN SELECT i.*,c.name AS crop_name,c.is_active,r.status::TEXT AS round_status,r.closure_reason,r.booking_opens_at,r.booking_closes_at,
      r.order_limit_remaining AS round_quota,r.purchase_limit_enabled,own.id AS existing_id,own.qty_kg AS existing_qty,
      own.price_per_kg AS existing_price,own.discount_amount AS existing_discount,
      (SELECT COALESCE(SUM(other.qty_kg),0) FROM public.order_items other JOIN public.orders other_order ON other_order.id=other.order_id
        WHERE other.round_item_id=i.id AND other.order_id<>ord.id AND other_order.status::TEXT<>'cancelled') AS others_booked,
      EXISTS(SELECT 1 FROM public.order_items held JOIN public.round_items held_item ON held_item.id=held.round_item_id WHERE held.order_id=ord.id AND held_item.round_id=i.round_id) AS round_already_used,
      public.booking_harvest_date(r.id,i.crop_id) AS harvest_date
      FROM public.round_items i JOIN public.planting_rounds r ON r.id=i.round_id JOIN public.crops c ON c.id=i.crop_id
      LEFT JOIN public.order_items own ON own.round_item_id=i.id AND own.order_id=ord.id
      WHERE i.crop_id=(input->>'crop_id')::UUID AND r.closure_reason IS NULL AND r.status::TEXT NOT IN('completed','cancelled')
      ORDER BY CASE WHEN NOT return_stock AND own.id IS NOT NULL THEN 0 ELSE 1 END,
        public.booking_harvest_date(r.id,i.crop_id) NULLS LAST,i.id LOOP
      capacity:=GREATEST(0,public.booking_stock_kg(src.id)-src.others_booked,COALESCE(src.existing_qty,0));
      IF NOT src.is_active OR src.round_status<>'booking_open' OR src.booking_opens_at>now() OR src.booking_closes_at<=now() THEN
        capacity:=LEAST(capacity,COALESCE(src.existing_qty,0));
      END IF;
      IF src.order_limit_remaining=0 AND src.existing_id IS NULL THEN CONTINUE; END IF;
      IF src.round_quota=0 AND NOT src.round_already_used THEN CONTINUE; END IF;
      IF src.purchase_limit_enabled AND src.max_qty_per_order_kg IS NOT NULL THEN capacity:=LEAST(capacity,GREATEST(src.max_qty_per_order_kg,COALESCE(src.existing_qty,0))); END IF;
      take:=LEAST(remaining,capacity); IF take<=0 THEN CONTINUE; END IF;
      discount:=LEAST(COALESCE(src.existing_discount,0),round(take*COALESCE(src.existing_price,src.price_per_kg),2));
      plan:=plan||jsonb_build_array(jsonb_build_object('round_item_id',src.id,'round_id',src.round_id,'crop_id',src.crop_id,'crop_name',src.crop_name,
        'existing_id',src.existing_id,'qty_kg',take,'price_per_kg',COALESCE(src.existing_price,src.price_per_kg),'discount_amount',discount,'harvest_date',src.harvest_date));
      total:=total+round(take*COALESCE(src.existing_price,src.price_per_kg),2)-discount;
      remaining:=remaining-take; EXIT WHEN remaining=0;
    END LOOP;
    IF remaining>0 THEN RAISE EXCEPTION 'สต๊อกผักไม่เพียงพอ หรือเกินเพดานรับจอง กรุณาลดจำนวน'; END IF;
  END LOOP;
  -- Preserve already unavailable stock: only withhold the amount that this edit
  -- would actually return to public availability. Existing plant losses are not counted twice.
  FOR line IN SELECT oi.round_item_id,i.round_id,i.crop_id,c.name AS crop_name,oi.qty_kg AS old_qty,
      COALESCE((SELECT sum((x->>'qty_kg')::NUMERIC) FROM jsonb_array_elements(plan) x
        WHERE (x->>'round_item_id')::UUID=i.id),0) AS new_qty,
      public.booking_stock_kg(i.id) AS stock,
      (SELECT COALESCE(sum(b.qty_kg),0) FROM public.order_items b JOIN public.orders o ON o.id=b.order_id
        WHERE b.round_item_id=i.id AND o.status::TEXT<>'cancelled') AS booked
    FROM public.order_items oi JOIN public.round_items i ON i.id=oi.round_item_id
    JOIN public.crops c ON c.id=i.crop_id WHERE oi.order_id=ord.id ORDER BY i.id LOOP
    reduced:=GREATEST(0,line.old_qty-line.new_qty);
    IF reduced>0 THEN
      blocked:=CASE WHEN return_stock THEN 0 ELSE
        GREATEST(0,line.stock-line.booked+reduced)-GREATEST(0,line.stock-line.booked) END;
      stock_changes:=stock_changes||jsonb_build_array(jsonb_build_object(
        'round_item_id',line.round_item_id,'round_id',line.round_id,'crop_id',line.crop_id,'crop_name',line.crop_name,
        'reduced_qty_kg',reduced,'withheld_qty_kg',blocked));
    END IF;
  END LOOP;
  SELECT (value->>'round_id')::UUID INTO anchor FROM jsonb_array_elements(plan) ORDER BY value->>'harvest_date' NULLS LAST,value->>'round_item_id' LIMIT 1;
  SELECT min((value->>'harvest_date')::DATE),max((value->>'harvest_date')::DATE) INTO first_date,last_date FROM jsonb_array_elements(plan);
  result:=jsonb_build_object('order_id',ord.id,'previous_total_amount',ord.total_amount,'total_amount',total,'items',plan,
    'harvest_start_date',first_date,'harvest_end_date',last_date);
  result:=result||jsonb_build_object('return_stock',return_stock,'stock_adjustments',stock_changes);
  preview_token:=md5(result::TEXT);
  result:=result||jsonb_build_object('preview',p_preview,'preview_token',preview_token);
  IF p_preview THEN RETURN result; END IF;
  IF p_payload->>'preview_token' IS DISTINCT FROM preview_token THEN RAISE EXCEPTION 'สต๊อกหรือราคาเปลี่ยนแปลง กรุณาตรวจสอบยอดใหม่ก่อนบันทึก'; END IF;
  UPDATE public.orders SET is_pooled=TRUE WHERE id=ord.id;
  -- Deletes restore only the quota version the old line originally consumed.
  DELETE FROM public.order_items WHERE order_id=ord.id AND round_item_id NOT IN(SELECT (value->>'round_item_id')::UUID FROM jsonb_array_elements(plan));
  FOR row IN SELECT value FROM jsonb_array_elements(plan) ORDER BY value->>'round_item_id' LOOP
    IF row->>'existing_id' IS NOT NULL THEN
      UPDATE public.order_items SET qty_kg=(row->>'qty_kg')::NUMERIC,discount_amount=(row->>'discount_amount')::NUMERIC
        WHERE id=(row->>'existing_id')::UUID AND order_id=ord.id;
    ELSE
      INSERT INTO public.order_items(order_id,round_item_id,qty_kg,price_per_kg,discount_amount,fulfillment_source)
        VALUES(ord.id,(row->>'round_item_id')::UUID,(row->>'qty_kg')::NUMERIC,(row->>'price_per_kg')::NUMERIC,0,'own');
    END IF;
  END LOOP;
  FOR row IN SELECT value FROM jsonb_array_elements(stock_changes) LOOP
    IF (row->>'withheld_qty_kg')::NUMERIC>0 THEN
      UPDATE public.round_items SET unavailable_qty_kg=unavailable_qty_kg+(row->>'withheld_qty_kg')::NUMERIC
        WHERE id=(row->>'round_item_id')::UUID;
    END IF;
  END LOOP;
  -- Move the anchor without consuming an already counted source round twice.
  PERFORM set_config('hydrofarm.edit_order_id',ord.id::TEXT,TRUE);
  UPDATE public.orders SET round_id=anchor,is_pooled=TRUE,
    source_round_ids=ARRAY(SELECT DISTINCT(value->>'round_id')::UUID FROM jsonb_array_elements(plan)),
    harvest_start_date=first_date,harvest_end_date=last_date,total_amount=total,updated_at=now() WHERE id=ord.id;
  PERFORM set_config('hydrofarm.edit_order_id','',TRUE);
  FOR quota IN SELECT * FROM public.order_extra_round_quotas WHERE order_id=ord.id ORDER BY round_id FOR UPDATE LOOP
    IF NOT EXISTS(SELECT 1 FROM public.order_items oi JOIN public.round_items i ON i.id=oi.round_item_id WHERE oi.order_id=ord.id AND i.round_id=quota.round_id) THEN
      UPDATE public.planting_rounds SET order_limit_remaining=order_limit_remaining+1 WHERE id=quota.round_id AND order_limit_version=quota.version AND order_limit_remaining IS NOT NULL;
      DELETE FROM public.order_extra_round_quotas WHERE order_id=ord.id AND round_id=quota.round_id;
    END IF;
  END LOOP;
  result:=jsonb_build_object('order_id',ord.id,'previous_total_amount',ord.total_amount,'total_amount',total,'items',plan,'preview',FALSE,
    'harvest_start_date',first_date,'harvest_end_date',last_date);
  result:=result||jsonb_build_object('return_stock',return_stock,'stock_adjustments',stock_changes);
  INSERT INTO public.order_item_amendments(request_id,order_id,actor_id,payload,result) VALUES(p_request_id,ord.id,p_actor_id,p_payload,result);
  INSERT INTO public.audit_logs(actor_id,actor_email,entity_type,entity_id,action,old_data,new_data)
    VALUES(p_actor_id,actor_email,'orders',ord.id::TEXT,'update',jsonb_build_object('order',to_jsonb(ord),'items',old_items),
      result||jsonb_build_object('reason',p_payload->>'reason'));
  RETURN result;
END $$;


REVOKE ALL ON FUNCTION public.amend_order_items_with_stock_choice(UUID,UUID,UUID,JSONB,BOOLEAN) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.amend_order_items_with_stock_choice(UUID,UUID,UUID,JSONB,BOOLEAN) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
