BEGIN;
ALTER TABLE public.planting_rounds ADD COLUMN IF NOT EXISTS order_limit_remaining INTEGER CHECK(order_limit_remaining>=0);
ALTER TABLE public.planting_rounds ADD COLUMN IF NOT EXISTS order_limit_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_limit_version BIGINT;

CREATE OR REPLACE FUNCTION public.set_round_order_limit(p_actor_id UUID,p_round_id UUID,p_remaining INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor_email TEXT; r RECORD;
BEGIN
  SELECT u.email INTO actor_email FROM auth.users u JOIN public.admin_users a ON lower(a.email)=lower(u.email) WHERE u.id=p_actor_id;
  IF actor_email IS NULL THEN RAISE EXCEPTION 'ไม่มีสิทธิ์กำหนดจำนวนออเดอร์'; END IF;
  IF p_remaining IS NOT NULL AND (p_remaining<0 OR p_remaining>1000000) THEN RAISE EXCEPTION 'จำนวนออเดอร์ต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง 1000000'; END IF;
  SELECT * INTO r FROM public.planting_rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบรอบปลูก'; END IF;
  IF r.status::TEXT IN ('completed','cancelled') OR r.closure_reason IS NOT NULL THEN RAISE EXCEPTION 'รอบสิ้นสุดแล้ว ไม่สามารถแก้จำนวนออเดอร์'; END IF;
  UPDATE public.planting_rounds SET order_limit_remaining=p_remaining,order_limit_version=order_limit_version+1,updated_at=now() WHERE id=p_round_id;
  INSERT INTO public.audit_logs(actor_id,actor_email,entity_type,entity_id,action,old_data,new_data)
  VALUES(p_actor_id,actor_email,'planting_rounds',p_round_id::TEXT,'update',jsonb_build_object('order_limit_remaining',r.order_limit_remaining),jsonb_build_object('order_limit_remaining',p_remaining));
  RETURN jsonb_build_object('round_id',p_round_id,'order_limit_remaining',p_remaining);
END $$;
REVOKE ALL ON FUNCTION public.set_round_order_limit(UUID,UUID,INTEGER) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_round_order_limit(UUID,UUID,INTEGER) TO service_role;

-- One row update serializes competing orders, including orders entered by admins.
-- A new configuration version prevents old cancellations increasing a freshly reset quota.
CREATE OR REPLACE FUNCTION public.enforce_round_order_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r RECORD; consume BOOLEAN;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.round_id IS DISTINCT FROM OLD.round_id THEN RAISE EXCEPTION 'ไม่สามารถย้ายออเดอร์ข้ามรอบ'; END IF;
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    consume:=OLD.status::TEXT='cancelled' AND NEW.status::TEXT<>'cancelled';
  ELSE
    NEW.order_limit_version:=NULL;
    consume:=NEW.status::TEXT<>'cancelled';
  END IF;
  SELECT * INTO r FROM public.planting_rounds WHERE id=NEW.round_id FOR UPDATE;
  IF r.order_limit_remaining IS NULL THEN
    NEW.order_limit_version:=NULL;
    RETURN NEW;
  END IF;
  IF consume THEN
    UPDATE public.planting_rounds SET order_limit_remaining=order_limit_remaining-1
    WHERE id=NEW.round_id AND order_limit_remaining>0 RETURNING order_limit_version INTO NEW.order_limit_version;
    IF NOT FOUND THEN RAISE EXCEPTION 'รอบนี้รับออเดอร์ครบจำนวนแล้ว กรุณาเลือกรอบอื่นหรือติดต่อฟาร์ม'; END IF;
  ELSIF TG_OP='UPDATE' AND NEW.status::TEXT='cancelled' AND OLD.order_limit_version=r.order_limit_version THEN
    UPDATE public.planting_rounds SET order_limit_remaining=order_limit_remaining+1 WHERE id=NEW.round_id;
    NEW.order_limit_version:=NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_round_order_limit ON public.orders;
CREATE TRIGGER enforce_round_order_limit BEFORE INSERT OR UPDATE OF status,round_id ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_round_order_limit();
COMMIT;
