BEGIN;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS confirmation_expires_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS confirmation_expired_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS received_amount NUMERIC(12,2) CHECK(received_amount>=0);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS orders_pending_deadline_idx ON public.orders(confirmation_expires_at) WHERE status='pending_confirmation';
INSERT INTO public.app_settings(key,value) VALUES('pending_confirmation_hours','0'::JSONB) ON CONFLICT(key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.assign_order_operational_dates()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE hours NUMERIC;
BEGIN
  IF TG_OP='UPDATE' AND OLD.status::TEXT='pending_confirmation' AND NEW.status::TEXT NOT IN('pending_confirmation','cancelled')
    AND OLD.payment_status::TEXT='unpaid' AND OLD.confirmation_expires_at<=clock_timestamp()
    AND NOT EXISTS(SELECT 1 FROM public.order_items WHERE order_id=OLD.id AND (own_qty_kg IS NOT NULL OR COALESCE(fulfilled_qty_kg,0)>0)) THEN
    RAISE EXCEPTION 'หมดเวลารอยืนยันออเดอร์แล้ว กรุณาโหลดข้อมูลล่าสุด';
  END IF;
  IF NEW.status::TEXT='pending_confirmation' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT COALESCE(value->>'value',value::TEXT)::NUMERIC INTO hours FROM public.app_settings WHERE key='pending_confirmation_hours';
    NEW.confirmation_expires_at:=CASE WHEN hours>0 THEN now()+make_interval(secs=>(hours*3600)::DOUBLE PRECISION) ELSE NULL END;
    NEW.confirmation_expired_at:=NULL;
  END IF;
  IF NEW.payment_status::TEXT='paid' THEN
    IF TG_OP='INSERT' OR OLD.payment_status::TEXT<>'paid' THEN
      NEW.received_amount:=NEW.total_amount;
      NEW.paid_at:=COALESCE(NEW.paid_at,now());
    ELSE NEW.received_amount:=COALESCE(OLD.received_amount,OLD.total_amount); END IF;
  ELSE NEW.received_amount:=0; END IF;
  IF NEW.status::TEXT='completed' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN NEW.completed_at:=now(); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS z_order_operational_dates ON public.orders;
-- Run after the existing insert trigger has assigned pending_confirmation.
CREATE TRIGGER z_order_operational_dates BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.assign_order_operational_dates();
UPDATE public.orders SET received_amount=total_amount WHERE payment_status::TEXT='paid' AND received_amount IS NULL;

CREATE OR REPLACE FUNCTION public.set_order_confirmation_timeout(p_actor_id UUID,p_hours INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor_email TEXT;
BEGIN
  SELECT u.email INTO actor_email FROM auth.users u JOIN public.admin_users a ON lower(a.email)=lower(u.email) WHERE u.id=p_actor_id;
  IF actor_email IS NULL THEN RAISE EXCEPTION 'ไม่มีสิทธิ์ตั้งเวลารอยืนยัน'; END IF;
  IF p_hours IS NULL OR p_hours<0 OR p_hours>8760 THEN RAISE EXCEPTION 'เวลารอยืนยันต้องเป็นจำนวนเต็ม 0 ถึง 8760 ชั่วโมง'; END IF;
  INSERT INTO public.app_settings(key,value) VALUES('pending_confirmation_hours',to_jsonb(p_hours)) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value;
  IF p_hours=0 THEN
    UPDATE public.orders SET confirmation_expires_at=NULL WHERE status::TEXT='pending_confirmation' AND confirmation_expires_at IS NOT NULL;
  ELSE
    UPDATE public.orders SET confirmation_expires_at=now()+make_interval(hours=>p_hours)
      WHERE status::TEXT='pending_confirmation' AND confirmation_expires_at IS NULL;
  END IF;
  INSERT INTO public.audit_logs(actor_id,actor_email,entity_type,entity_id,action,new_data)
    VALUES(p_actor_id,actor_email,'app_settings','pending_confirmation_hours','update',jsonb_build_object('hours',p_hours));
  RETURN jsonb_build_object('pending_confirmation_hours',p_hours);
END $$;

CREATE OR REPLACE FUNCTION public.expire_pending_orders()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ids UUID[]; entry RECORD; expired INTEGER:=0; hours NUMERIC;
BEGIN
  SELECT COALESCE(value->>'value',value::TEXT)::NUMERIC INTO hours FROM public.app_settings WHERE key='pending_confirmation_hours';
  IF COALESCE(hours,0)<=0 OR NOT pg_try_advisory_xact_lock(410041) THEN RETURN 0; END IF;
  SELECT array_agg(id) INTO ids FROM(SELECT o.id FROM public.orders o WHERE o.status::TEXT='pending_confirmation'
    AND o.payment_status::TEXT='unpaid' AND o.confirmation_expires_at<=now()
    AND NOT EXISTS(SELECT 1 FROM public.order_items oi WHERE oi.order_id=o.id AND (oi.own_qty_kg IS NOT NULL OR COALESCE(oi.fulfilled_qty_kg,0)>0))
    AND NOT EXISTS(SELECT 1 FROM public.planting_rounds r WHERE (r.id=o.round_id OR r.id IN(
      SELECT i.round_id FROM public.order_items oi JOIN public.round_items i ON i.id=oi.round_item_id WHERE oi.order_id=o.id))
      AND (r.closure_reason IS NOT NULL OR r.status::TEXT IN('completed','cancelled')))
    ORDER BY o.confirmation_expires_at,o.id LIMIT 200) due;
  IF ids IS NULL THEN RETURN 0; END IF;
  -- All mutations use stock items, then rounds, then orders in a stable order.
  PERFORM 1 FROM public.round_items WHERE id IN(SELECT round_item_id FROM public.order_items WHERE order_id=ANY(ids)) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.planting_rounds WHERE id IN(
    SELECT round_id FROM public.orders WHERE id=ANY(ids) UNION
    SELECT i.round_id FROM public.order_items oi JOIN public.round_items i ON i.id=oi.round_item_id WHERE oi.order_id=ANY(ids)) ORDER BY id FOR UPDATE;
  FOR entry IN SELECT * FROM public.orders WHERE id=ANY(ids) ORDER BY id FOR UPDATE LOOP
    IF entry.status::TEXT<>'pending_confirmation' OR entry.payment_status::TEXT<>'unpaid' OR entry.confirmation_expires_at IS NULL OR entry.confirmation_expires_at>now() THEN CONTINUE; END IF;
    IF EXISTS(SELECT 1 FROM public.order_items WHERE order_id=entry.id AND (own_qty_kg IS NOT NULL OR COALESCE(fulfilled_qty_kg,0)>0)) THEN CONTINUE; END IF;
    IF EXISTS(SELECT 1 FROM public.order_items oi JOIN public.round_items i ON i.id=oi.round_item_id JOIN public.planting_rounds r ON r.id=i.round_id
      WHERE oi.order_id=entry.id AND (r.closure_reason IS NOT NULL OR r.status::TEXT IN('completed','cancelled'))) THEN CONTINUE; END IF;
    UPDATE public.orders SET status='cancelled',confirmation_expired_at=now(),cancelled_at=now(),
      cancel_reason='หมดเวลารอยืนยันออเดอร์โดยแอดมิน',updated_at=now() WHERE id=entry.id;
    INSERT INTO public.audit_logs(actor_email,entity_type,entity_id,action,old_data,new_data)
      VALUES('system','orders',entry.id::TEXT,'cancel',to_jsonb(entry),jsonb_build_object('reason','confirmation_expired','expired_at',now()));
    expired:=expired+1;
  END LOOP;
  RETURN expired;
END $$;
REVOKE ALL ON FUNCTION public.assign_order_operational_dates(),public.set_order_confirmation_timeout(UUID,INTEGER),public.expire_pending_orders() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_order_confirmation_timeout(UUID,INTEGER),public.expire_pending_orders() TO service_role;

-- Supabase supports pg_cron; test runtimes without the extension skip only scheduling.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.schedule('hydrofarm-expire-pending-orders','* * * * *','SELECT public.expire_pending_orders();');
  END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
