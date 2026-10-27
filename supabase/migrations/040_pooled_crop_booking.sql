BEGIN;
-- Orders retain an anchor round for compatibility; each order item is the actual stock source.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_pooled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS harvest_start_date DATE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS harvest_end_date DATE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pooled_request_id UUID UNIQUE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pooled_request_payload JSONB;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source_round_ids UUID[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS orders_source_round_ids_idx ON public.orders USING gin(source_round_ids);
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_qty_kg_check;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_qty_kg_check CHECK(qty_kg>0);

CREATE OR REPLACE FUNCTION public.booking_harvest_date(p_round_id UUID,p_crop_id UUID)
RETURNS DATE LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE r RECORD; days INTEGER; metadata JSONB;
BEGIN
  SELECT * INTO r FROM public.planting_rounds WHERE id=p_round_id;
  BEGIN metadata:=r.notes::JSONB; EXCEPTION WHEN OTHERS THEN metadata:='{}'; END;
  BEGIN days:=NULLIF(metadata->'cropGrowingDays'->>p_crop_id::TEXT,'')::INTEGER; EXCEPTION WHEN OTHERS THEN days:=NULL; END;
  SELECT COALESCE(NULLIF(days,0),NULLIF(c.growing_days,0),NULLIF(r.growing_days,0),45) INTO days FROM public.crops c WHERE c.id=p_crop_id;
  RETURN COALESCE(r.harvest_sale_date,r.transplant_date+days,r.expected_harvest_date,r.fulfillment_date);
END $$;

CREATE OR REPLACE FUNCTION public.booking_stock_kg(p_item_id UUID)
RETURNS NUMERIC LANGUAGE SQL STABLE SET search_path=public AS $$
  SELECT GREATEST(0,CASE WHEN COALESCE(i.planting_plants_per_kg,c.slots_per_kg,0)>0 AND i.plant_count IS NOT NULL
    THEN floor(GREATEST(0,i.plant_count-COALESCE(i.lost_plant_count,0))/COALESCE(i.planting_plants_per_kg,c.slots_per_kg))
    ELSE COALESCE(i.estimated_qty_kg,0) END)
  FROM public.round_items i JOIN public.crops c ON c.id=i.crop_id WHERE i.id=p_item_id
$$;

CREATE OR REPLACE VIEW public.booking_sources AS
SELECT i.id,i.round_id,i.crop_id,c.name AS crop_name,c.image_url,i.price_per_kg,i.plant_count,i.planting_plants_per_kg,
  public.booking_stock_kg(i.id) AS estimated_qty_kg,
  COALESCE(b.booked,0) AS booked_qty_kg,
  GREATEST(0,public.booking_stock_kg(i.id)-COALESCE(b.booked,0)) AS available_qty_kg,
  CASE WHEN r.purchase_limit_enabled THEN i.max_qty_per_order_kg END AS max_qty_per_order_kg,
  i.order_limit_remaining,r.order_limit_remaining AS round_order_limit_remaining,
  r.booking_opens_at,public.booking_harvest_date(r.id,i.crop_id) AS harvest_date
FROM public.round_items i JOIN public.planting_rounds r ON r.id=i.round_id JOIN public.crops c ON c.id=i.crop_id
LEFT JOIN LATERAL(SELECT SUM(oi.qty_kg) AS booked FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id
  WHERE oi.round_item_id=i.id AND o.status::TEXT<>'cancelled') b ON TRUE
WHERE r.status::TEXT='booking_open' AND r.closure_reason IS NULL AND c.is_active
  AND (r.booking_opens_at IS NULL OR r.booking_opens_at<=now())
  AND (r.booking_closes_at IS NULL OR r.booking_closes_at>now());
REVOKE ALL ON public.booking_sources FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.booking_sources TO service_role;

-- Enforce the same stock boundary for website, legacy round links and admin chat orders.
CREATE OR REPLACE FUNCTION public.check_booking_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ri RECORD; booked NUMERIC; active BOOLEAN; previous NUMERIC:=0; pooled BOOLEAN;
BEGIN
  IF TG_OP='UPDATE' AND NEW.round_item_id=OLD.round_item_id AND NEW.order_id=OLD.order_id AND NEW.qty_kg<=OLD.qty_kg THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND (NEW.round_item_id<>OLD.round_item_id OR NEW.order_id<>OLD.order_id) THEN RAISE EXCEPTION 'ไม่สามารถย้ายแหล่งสต๊อกของรายการจอง'; END IF;
  SELECT i.*,r.status::TEXT AS round_status,r.booking_opens_at,r.booking_closes_at,r.purchase_limit_enabled INTO ri
    FROM public.round_items i JOIN public.planting_rounds r ON r.id=i.round_id WHERE i.id=NEW.round_item_id FOR UPDATE OF i FOR SHARE OF r;
  SELECT status::TEXT<>'cancelled',is_pooled INTO active,pooled FROM public.orders WHERE id=NEW.order_id;
  IF NOT pooled AND NEW.qty_kg<0.5 THEN RAISE EXCEPTION 'จำนวนผักแต่ละรายการต้องไม่ต่ำกว่า 0.5 กก.'; END IF;
  IF NOT active THEN RETURN NEW; END IF;
  IF ri.round_status<>'booking_open' OR ri.booking_opens_at>now() OR ri.booking_closes_at<=now() THEN RAISE EXCEPTION 'รอบต้นทางปิดรับจองแล้ว กรุณาโหลดสต๊อกล่าสุด'; END IF;
  IF ri.purchase_limit_enabled AND ri.max_qty_per_order_kg IS NOT NULL AND NEW.qty_kg>ri.max_qty_per_order_kg THEN RAISE EXCEPTION 'จำนวนผักเกินเพดานการซื้อของรอบต้นทาง'; END IF;
  SELECT COALESCE(SUM(oi.qty_kg),0) INTO booked FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id
    WHERE oi.round_item_id=NEW.round_item_id AND o.status::TEXT<>'cancelled' AND oi.id<>NEW.id;
  IF booked+NEW.qty_kg>public.booking_stock_kg(NEW.round_item_id) THEN RAISE EXCEPTION 'สต๊อกผักไม่เพียงพอ คงเหลือ % กก. กรุณาปรับจำนวนและลองใหม่',GREATEST(0,public.booking_stock_kg(NEW.round_item_id)-booked); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS check_booking_stock ON public.order_items;
CREATE TRIGGER check_booking_stock BEFORE INSERT OR UPDATE OF qty_kg,round_item_id,order_id ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.check_booking_stock();

-- Whole-round legacy quotas are also consumed once for every additional source round.
CREATE TABLE IF NOT EXISTS public.order_extra_round_quotas(
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  round_id UUID REFERENCES public.planting_rounds(id),version BIGINT,PRIMARY KEY(order_id,round_id)
);
ALTER TABLE public.order_extra_round_quotas ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.consume_extra_round_quota()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source UUID; anchor UUID; active BOOLEAN; v BIGINT;
BEGIN
  SELECT round_id INTO source FROM public.round_items WHERE id=NEW.round_item_id;
  SELECT round_id,status::TEXT<>'cancelled' INTO anchor,active FROM public.orders WHERE id=NEW.order_id;
  IF source=anchor THEN RETURN NEW; END IF;
  INSERT INTO public.order_extra_round_quotas(order_id,round_id) VALUES(NEW.order_id,source) ON CONFLICT DO NOTHING;
  IF NOT FOUND OR NOT active THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.planting_rounds WHERE id=source FOR UPDATE;
  IF (SELECT order_limit_remaining FROM public.planting_rounds WHERE id=source) IS NOT NULL THEN
    UPDATE public.planting_rounds SET order_limit_remaining=order_limit_remaining-1 WHERE id=source AND order_limit_remaining>0 RETURNING order_limit_version INTO v;
    IF NOT FOUND THEN RAISE EXCEPTION 'รอบต้นทางรับออเดอร์ครบจำนวนแล้ว'; END IF;
    UPDATE public.order_extra_round_quotas SET version=v WHERE order_id=NEW.order_id AND round_id=source;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS consume_extra_round_quota ON public.order_items;
CREATE TRIGGER consume_extra_round_quota BEFORE INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.consume_extra_round_quota();

CREATE OR REPLACE FUNCTION public.restore_pooled_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source RECORD; booked NUMERIC; v BIGINT;
BEGIN
  IF OLD.status::TEXT='cancelled' AND NEW.status::TEXT<>'cancelled' THEN
    FOR source IN SELECT i.id,i.round_id,oi.qty_kg FROM public.order_items oi JOIN public.round_items i ON i.id=oi.round_item_id WHERE oi.order_id=NEW.id ORDER BY i.id FOR UPDATE OF i LOOP
      IF EXISTS(SELECT 1 FROM public.planting_rounds WHERE id=source.round_id AND (status::TEXT<>'booking_open' OR closure_reason IS NOT NULL)) THEN RAISE EXCEPTION 'รอบต้นทางปิดแล้ว ไม่สามารถคืนสถานะออเดอร์'; END IF;
      SELECT COALESCE(SUM(oi.qty_kg),0) INTO booked FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id WHERE oi.round_item_id=source.id AND o.id<>NEW.id AND o.status::TEXT<>'cancelled';
      IF booked+source.qty_kg>public.booking_stock_kg(source.id) THEN RAISE EXCEPTION 'สต๊อกผักไม่เพียงพอสำหรับคืนสถานะออเดอร์'; END IF;
    END LOOP;
  END IF;
  FOR source IN SELECT * FROM public.order_extra_round_quotas WHERE order_id=NEW.id ORDER BY round_id FOR UPDATE LOOP
    PERFORM 1 FROM public.planting_rounds WHERE id=source.round_id FOR UPDATE;
    IF OLD.status::TEXT='cancelled' AND NEW.status::TEXT<>'cancelled' THEN
      v:=NULL;
      IF (SELECT order_limit_remaining FROM public.planting_rounds WHERE id=source.round_id) IS NOT NULL THEN
        UPDATE public.planting_rounds SET order_limit_remaining=order_limit_remaining-1 WHERE id=source.round_id AND order_limit_remaining>0 RETURNING order_limit_version INTO v;
        IF NOT FOUND THEN RAISE EXCEPTION 'รอบต้นทางรับออเดอร์ครบจำนวนแล้ว'; END IF;
      END IF;
      UPDATE public.order_extra_round_quotas SET version=v WHERE order_id=NEW.id AND round_id=source.round_id;
    ELSIF OLD.status::TEXT<>'cancelled' AND NEW.status::TEXT='cancelled' THEN
      UPDATE public.planting_rounds SET order_limit_remaining=order_limit_remaining+1 WHERE id=source.round_id AND order_limit_version=source.version AND order_limit_remaining IS NOT NULL;
      UPDATE public.order_extra_round_quotas SET version=NULL WHERE order_id=NEW.id AND round_id=source.round_id;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS restore_pooled_stock ON public.orders;
CREATE TRIGGER restore_pooled_stock AFTER UPDATE OF status ON public.orders FOR EACH ROW WHEN(OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.restore_pooled_stock();

CREATE OR REPLACE FUNCTION public.create_pooled_order(p_customer_id UUID,p_request_id UUID,p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE profile RECORD; previous RECORD; input JSONB; source RECORD; plan JSONB:='[]'; row JSONB; remaining NUMERIC; take NUMERIC;
  total NUMERIC:=0; kg NUMERIC:=0; minimum NUMERIC; no_show_limit INTEGER; anchor UUID; first_date DATE; last_date DATE; order_id UUID;
  address TEXT; method public.fulfillment_method; payload JSONB:=p_payload;
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'ไม่พบรหัสคำขอ'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::TEXT,40));
  SELECT * INTO previous FROM public.orders WHERE pooled_request_id=p_request_id;
  IF FOUND THEN
    IF previous.customer_id IS DISTINCT FROM p_customer_id OR previous.pooled_request_payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'รหัสคำขอถูกใช้กับข้อมูลอื่นแล้ว'; END IF;
    RETURN jsonb_build_object('order_id',previous.id,'total_amount',previous.total_amount,'status',previous.status);
  END IF;
  SELECT * INTO profile FROM public.profiles WHERE id=p_customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบข้อมูลโปรไฟล์ลูกค้า'; END IF;
  IF COALESCE((payload->>'accepted_substitution_terms')::BOOLEAN,FALSE) IS NOT TRUE THEN RAISE EXCEPTION 'กรุณายอมรับเงื่อนไขการทดแทนผัก'; END IF;
  IF length(trim(COALESCE(payload->>'contact_phone','')))<9 THEN RAISE EXCEPTION 'กรุณาระบุเบอร์โทรศัพท์ติดต่อ'; END IF;
  SELECT COALESCE(value->>'value',value::TEXT)::INTEGER INTO no_show_limit FROM public.app_settings WHERE key='no_show_limit';
  IF no_show_limit>0 AND profile.no_show_count>=no_show_limit THEN RAISE EXCEPTION 'ไม่สามารถจองได้เนื่องจากยอดไม่มารับของสะสม กรุณาติดต่อฟาร์ม'; END IF;
  IF jsonb_typeof(payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'items') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'กรุณาเลือกผัก 1 ถึง 100 ชนิด'; END IF;
  IF (SELECT count(DISTINCT value->>'crop_id') FROM jsonb_array_elements(payload->'items'))<>jsonb_array_length(payload->'items') THEN RAISE EXCEPTION 'ชนิดผักต้องไม่ซ้ำกัน'; END IF;
  -- Lock all candidate items before rounds, matching the administrative allocation lock order.
  PERFORM 1 FROM public.round_items WHERE crop_id IN(SELECT (value->>'crop_id')::UUID FROM jsonb_array_elements(payload->'items')) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.planting_rounds WHERE id IN(SELECT round_id FROM public.round_items WHERE crop_id IN(SELECT (value->>'crop_id')::UUID FROM jsonb_array_elements(payload->'items'))) ORDER BY id FOR UPDATE;
  FOR input IN SELECT value FROM jsonb_array_elements(payload->'items') ORDER BY value->>'crop_id' LOOP
    remaining:=(input->>'qty_kg')::NUMERIC;
    IF remaining IS NULL OR remaining<0.5 OR remaining>99999999 OR remaining<>round(remaining,2) THEN RAISE EXCEPTION 'จำนวนผักขั้นต่ำ 0.5 กก. และทศนิยมไม่เกิน 2 ตำแหน่ง'; END IF;
    kg:=kg+remaining;
    FOR source IN SELECT * FROM public.booking_sources WHERE crop_id=(input->>'crop_id')::UUID
      AND available_qty_kg>0 AND COALESCE(order_limit_remaining,1)>0 AND COALESCE(round_order_limit_remaining,1)>0
      ORDER BY harvest_date NULLS LAST,booking_opens_at,id LOOP
      take:=LEAST(remaining,source.available_qty_kg,COALESCE(source.max_qty_per_order_kg,remaining));
      IF take<=0 THEN CONTINUE; END IF;
      plan:=plan||jsonb_build_array(jsonb_build_object('id',source.id,'round_id',source.round_id,'qty',take,'price',source.price_per_kg,'harvest',source.harvest_date));
      remaining:=remaining-take; total:=total+round(take*source.price_per_kg,2);
      EXIT WHEN remaining=0;
    END LOOP;
    IF remaining>0 THEN RAISE EXCEPTION 'สต๊อกผักไม่เพียงพอ หรือเกินจำนวนที่รับจองได้ กรุณาโหลดสต๊อกล่าสุดและปรับจำนวน'; END IF;
  END LOOP;
  SELECT (value->>'round_id')::UUID INTO anchor FROM jsonb_array_elements(plan) ORDER BY value->>'harvest' NULLS LAST,value->>'id' LIMIT 1;
  SELECT min((value->>'harvest')::DATE),max((value->>'harvest')::DATE) INTO first_date,last_date FROM jsonb_array_elements(plan);
  method:=(payload->>'fulfillment_method')::public.fulfillment_method;
  IF method IS NULL THEN RAISE EXCEPTION 'กรุณาเลือกวิธีรับผัก'; END IF;
  IF method='delivery' THEN
    address:=COALESCE(NULLIF(trim(payload->>'delivery_address'),''),NULLIF(trim(profile.address_detail),''));
    IF address IS NULL THEN RAISE EXCEPTION 'กรุณาระบุที่อยู่สำหรับการจัดส่ง'; END IF;
    SELECT COALESCE(value->>'value',value::TEXT)::NUMERIC INTO minimum FROM public.app_settings WHERE key='delivery_min_total_kg';
    IF kg<minimum THEN RAISE EXCEPTION 'ยอดจัดส่งขั้นต่ำ % กก.',minimum; END IF;
  END IF;
  INSERT INTO public.orders(round_id,customer_id,is_pooled,harvest_start_date,harvest_end_date,pooled_request_id,pooled_request_payload,source_round_ids,
    fulfillment_method,delivery_address,contact_phone,note,status,requires_confirmation,payment_status,total_amount,accepted_substitution_terms_at)
  VALUES(anchor,p_customer_id,TRUE,first_date,last_date,p_request_id,payload,ARRAY(SELECT DISTINCT(value->>'round_id')::UUID FROM jsonb_array_elements(plan)),method,address,payload->>'contact_phone',payload->>'note',
    'pending_confirmation',TRUE,'unpaid',total,now()) RETURNING id INTO order_id;
  FOR row IN SELECT value FROM jsonb_array_elements(plan) ORDER BY value->>'id' LOOP
    INSERT INTO public.order_items(order_id,round_item_id,qty_kg,price_per_kg,fulfillment_source)
      VALUES(order_id,(row->>'id')::UUID,(row->>'qty')::NUMERIC,(row->>'price')::NUMERIC,'own');
  END LOOP;
  RETURN jsonb_build_object('order_id',order_id,'total_amount',total,'status','pending_confirmation','requires_confirmation',TRUE);
END $$;
REVOKE ALL ON FUNCTION public.create_pooled_order(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_pooled_order(UUID,UUID,JSONB) TO service_role;

-- Existing close/fulfillment procedures must consider every source round of a pooled order.
DO $$ DECLARE def TEXT;
BEGIN
  SELECT pg_get_functiondef('public.close_round_unsold(uuid,uuid,uuid,date,text,jsonb)'::regprocedure) INTO def;
  def:=replace(def,'FROM public.orders WHERE round_id=r.id','FROM public.orders WHERE (round_id=r.id OR id IN(SELECT src_line.order_id FROM public.order_items src_line JOIN public.round_items src_item ON src_item.id=src_line.round_item_id WHERE src_item.round_id=r.id))');
  EXECUTE def;
  SELECT pg_get_functiondef('public.save_admin_order_allocation(uuid,uuid,jsonb)'::regprocedure) INTO def;
  def:=replace(def,'WHERE round_id=o.round_id ORDER BY id FOR UPDATE','WHERE round_id=o.round_id OR id IN(SELECT round_item_id FROM public.order_items WHERE order_id=o.id) ORDER BY id FOR UPDATE');
  def:=replace(def,'SELECT * INTO r FROM public.planting_rounds WHERE id=o.round_id FOR UPDATE;',
    'PERFORM 1 FROM public.planting_rounds WHERE id=o.round_id OR id IN(SELECT ri.round_id FROM public.order_items oi JOIN public.round_items ri ON ri.id=oi.round_item_id WHERE oi.order_id=o.id) ORDER BY id FOR UPDATE;
     SELECT * INTO r FROM public.planting_rounds WHERE id=o.round_id;
     IF EXISTS(SELECT 1 FROM public.order_items oi JOIN public.round_items ri ON ri.id=oi.round_item_id JOIN public.planting_rounds pr ON pr.id=ri.round_id WHERE oi.order_id=o.id AND (pr.closure_reason IS NOT NULL OR pr.status::TEXT IN (''completed'',''cancelled''))) THEN RAISE EXCEPTION ''รอบต้นทางสิ้นสุดแล้ว ไม่สามารถแก้การจัดผัก''; END IF;');
  def:=replace(def,'sum(qty_kg*price_per_kg-discount_amount)','sum(round(qty_kg*price_per_kg,2)-discount_amount)');
  EXECUTE def;
END $$;

-- A pooled order must be cancelled before its earliest reserved harvest starts.
DO $$ DECLARE def TEXT;
BEGIN
  IF to_regprocedure('public.cancel_order(uuid,uuid,text)') IS NOT NULL THEN
    SELECT pg_get_functiondef('public.cancel_order(uuid,uuid,text)'::regprocedure) INTO def;
    def:=replace(def,'v_round.fulfillment_date::timestamp AT TIME ZONE',
      'COALESCE(v_order.harvest_start_date,v_round.fulfillment_date)::timestamp AT TIME ZONE');
    EXECUTE def;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_unsold_closed_orders()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.round_id=OLD.round_id THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM public.planting_rounds r WHERE r.closure_reason='unsold' AND
    (r.id=NEW.round_id OR r.id IN(SELECT ri.round_id FROM public.order_items oi JOIN public.round_items ri ON ri.id=oi.round_item_id WHERE oi.order_id=NEW.id))) THEN
    RAISE EXCEPTION 'รอบต้นทางบันทึกผักขายไม่ออกและสิ้นสุดแล้ว ไม่สามารถเปลี่ยนสถานะออเดอร์'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.guard_unsold_closed_items()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP<>'INSERT' AND EXISTS(SELECT 1 FROM public.round_items i JOIN public.planting_rounds r ON r.id=i.round_id WHERE i.id=OLD.round_item_id AND r.closure_reason='unsold') THEN
    RAISE EXCEPTION 'ไม่สามารถแก้รายการผักของรอบที่บันทึกผักขายไม่ออกและสิ้นสุดแล้ว'; END IF;
  IF TG_OP<>'DELETE' AND EXISTS(SELECT 1 FROM public.round_items i JOIN public.planting_rounds r ON r.id=i.round_id WHERE i.id=NEW.round_item_id AND r.closure_reason='unsold') THEN
    RAISE EXCEPTION 'ไม่สามารถแก้รายการผักของรอบที่บันทึกผักขายไม่ออกและสิ้นสุดแล้ว'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.check_booking_stock(),public.consume_extra_round_quota(),public.restore_pooled_stock() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
