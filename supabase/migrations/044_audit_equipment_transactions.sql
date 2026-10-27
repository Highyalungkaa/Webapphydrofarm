BEGIN;
ALTER TABLE public.equipment_orders ADD COLUMN IF NOT EXISTS request_id UUID UNIQUE;
ALTER TABLE public.equipment_orders ADD COLUMN IF NOT EXISTS request_payload JSONB;

-- Retain the existing validated stock/payment implementation behind an idempotent wrapper.
DO $$ BEGIN
  IF to_regprocedure('public.create_equipment_order_impl(uuid,jsonb,text,text,text,text,text)') IS NULL THEN
    ALTER FUNCTION public.create_equipment_order(UUID,JSONB,TEXT,TEXT,TEXT,TEXT,TEXT) RENAME TO create_equipment_order_impl;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.create_equipment_order(
  p_customer_id UUID,p_items JSONB,p_shipping_address TEXT,p_contact_phone TEXT,
  p_payment_method TEXT,p_note TEXT DEFAULT NULL,p_payment_slip_path TEXT DEFAULT NULL,p_request_id UUID DEFAULT NULL,p_expected_total NUMERIC DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing public.equipment_orders%ROWTYPE; order_id UUID; payload JSONB;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'กรุณาเลือกสินค้า 1 ถึง 100 รายการ'; END IF;
  IF (SELECT count(DISTINCT value->>'product_id') FROM jsonb_array_elements(p_items))<>jsonb_array_length(p_items) THEN RAISE EXCEPTION 'สินค้าในออเดอร์ต้องไม่ซ้ำกัน'; END IF;
  payload:=jsonb_build_object('items',p_items,'address',p_shipping_address,'phone',p_contact_phone,'method',p_payment_method,'note',p_note,'slip',p_payment_slip_path,'expected_total',p_expected_total);
  IF p_request_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::TEXT,44));
    SELECT * INTO existing FROM public.equipment_orders WHERE request_id=p_request_id;
    IF FOUND THEN
      IF existing.customer_id<>p_customer_id OR existing.request_payload IS DISTINCT FROM payload THEN RAISE EXCEPTION 'รหัสคำขอสั่งซื้อถูกใช้กับข้อมูลอื่นแล้ว'; END IF;
      RETURN existing.id;
    END IF;
  END IF;
  -- Stable product lock order prevents opposite cart orders from deadlocking.
  PERFORM 1 FROM public.equipment_products WHERE id IN(SELECT (value->>'product_id')::UUID FROM jsonb_array_elements(p_items)) ORDER BY id FOR UPDATE;
  order_id:=public.create_equipment_order_impl(p_customer_id,p_items,p_shipping_address,p_contact_phone,p_payment_method,p_note,p_payment_slip_path);
  IF p_expected_total IS NOT NULL AND (SELECT total_amount FROM public.equipment_orders WHERE id=order_id) IS DISTINCT FROM p_expected_total THEN
    RAISE EXCEPTION 'ราคาสินค้าหรือค่าส่งเปลี่ยนแล้ว กรุณาโหลดตะกร้าใหม่และตรวจยอดก่อนยืนยัน หากโอนแล้วกรุณาติดต่อฟาร์มพร้อมสลิป';
  END IF;
  UPDATE public.equipment_orders SET request_id=p_request_id,request_payload=payload WHERE id=order_id;
  RETURN order_id;
END $$;

CREATE OR REPLACE FUNCTION public.guard_equipment_order_transition()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT(
    (OLD.status='pending_confirmation' AND NEW.status IN('confirmed','cancelled')) OR
    (OLD.status='confirmed' AND NEW.status IN('processing','cancelled')) OR
    (OLD.status='processing' AND NEW.status IN('shipped','cancelled')) OR
    (OLD.status='shipped' AND NEW.status='completed')) THEN RAISE EXCEPTION 'สถานะออเดอร์เปลี่ยนแล้วหรือไม่สามารถเปลี่ยนข้ามขั้นได้ กรุณาโหลดข้อมูลล่าสุด'; END IF;
  IF NEW.status='shipped' AND (length(trim(COALESCE(NEW.tracking_number,'')))=0 OR
    length(trim(COALESCE(NEW.delivery_update_image_url,'')))=0 OR length(trim(COALESCE(NEW.delivery_update_message,'')))=0) THEN
    RAISE EXCEPTION 'กรุณาระบุเลขพัสดุ รูปหลักฐาน และข้อความแจ้งลูกค้าก่อนจัดส่ง';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_equipment_order_transition ON public.equipment_orders;
CREATE TRIGGER guard_equipment_order_transition BEFORE UPDATE ON public.equipment_orders FOR EACH ROW EXECUTE FUNCTION public.guard_equipment_order_transition();

CREATE OR REPLACE FUNCTION public.save_equipment_order(p_actor_id UUID,p_order_id UUID,p_expected_updated_at TIMESTAMPTZ,p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.equipment_orders%ROWTYPE; actor_email TEXT; result public.equipment_orders%ROWTYPE;
BEGIN
  SELECT u.email INTO actor_email FROM auth.users u JOIN public.admin_users a ON lower(a.email)=lower(u.email) WHERE u.id=p_actor_id;
  IF actor_email IS NULL THEN RAISE EXCEPTION 'ไม่มีสิทธิ์แก้ไขคำสั่งซื้ออุปกรณ์'; END IF;
  SELECT * INTO o FROM public.equipment_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบคำสั่งซื้อ'; END IF;
  IF p_expected_updated_at IS NULL OR o.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'ออเดอร์ถูกแก้ไขจากหน้าอื่นแล้ว กรุณาโหลดข้อมูลล่าสุด'; END IF;
  IF p_payload->>'status'='cancelled' AND o.status<>'cancelled' THEN PERFORM public.cancel_equipment_order(o.id,p_actor_id); END IF;
  UPDATE public.equipment_orders SET
    status=COALESCE(p_payload->>'status',status),
    payment_status=COALESCE((p_payload->>'payment_status')::public.payment_status,payment_status),
    paid_at=CASE WHEN COALESCE(p_payload->>'payment_status',payment_status::TEXT)='paid' THEN COALESCE(paid_at,now()) ELSE NULL END,
    tracking_number=CASE WHEN p_payload ? 'tracking_number' THEN p_payload->>'tracking_number' ELSE tracking_number END,
    delivery_update_image_url=CASE WHEN p_payload ? 'delivery_update_image_url' THEN p_payload->>'delivery_update_image_url' ELSE delivery_update_image_url END,
    delivery_update_message=CASE WHEN p_payload ? 'delivery_update_message' THEN p_payload->>'delivery_update_message' ELSE delivery_update_message END,
    shipped_at=CASE WHEN p_payload->>'status'='shipped' THEN COALESCE(shipped_at,now()) ELSE shipped_at END,
    completed_at=CASE WHEN p_payload->>'status'='completed' THEN COALESCE(completed_at,now()) ELSE completed_at END,
    updated_at=clock_timestamp() WHERE id=o.id RETURNING * INTO result;
  INSERT INTO public.audit_logs(actor_id,actor_email,entity_type,entity_id,action,old_data,new_data)
    VALUES(p_actor_id,actor_email,'equipment_orders',o.id::TEXT,'update',to_jsonb(o),to_jsonb(result));
  RETURN to_jsonb(result)||(jsonb_build_object('equipment_order_items',(SELECT COALESCE(jsonb_agg(i),'[]'::JSONB) FROM public.equipment_order_items i WHERE i.order_id=o.id)));
END $$;
DO $$ DECLARE definition TEXT;BEGIN
  SELECT pg_get_functiondef('public.cancel_equipment_order(uuid,uuid)'::regprocedure) INTO definition;
  IF definition NOT LIKE '%ORDER BY product_id LOOP%' THEN
    definition:=replace(definition,'WHERE order_id = p_order_id AND product_id IS NOT NULL LOOP','WHERE order_id = p_order_id AND product_id IS NOT NULL ORDER BY product_id LOOP');EXECUTE definition;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.create_equipment_order(UUID,JSONB,TEXT,TEXT,TEXT,TEXT,TEXT,UUID,NUMERIC),public.create_equipment_order_impl(UUID,JSONB,TEXT,TEXT,TEXT,TEXT,TEXT),public.save_equipment_order(UUID,UUID,TIMESTAMPTZ,JSONB),public.guard_equipment_order_transition() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_equipment_order(UUID,JSONB,TEXT,TEXT,TEXT,TEXT,TEXT,UUID,NUMERIC),public.save_equipment_order(UUID,UUID,TIMESTAMPTZ,JSONB) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
