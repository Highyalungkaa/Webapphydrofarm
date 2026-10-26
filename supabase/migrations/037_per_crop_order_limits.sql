-- An order consumes one slot for each limited crop it contains.
-- Existing round-wide limits continue to work until an admin saves crop limits.
BEGIN;

ALTER TABLE public.round_items
  ADD COLUMN IF NOT EXISTS order_limit_remaining INTEGER CHECK (order_limit_remaining >= 0),
  ADD COLUMN IF NOT EXISTS order_limit_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS order_limit_version BIGINT;

CREATE OR REPLACE FUNCTION public.set_round_item_order_limits(
  p_actor_id UUID, p_round_id UUID, p_items JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor_email TEXT; round_record RECORD; entry JSONB; item_id UUID; remaining INTEGER; seen UUID[] := ARRAY[]::UUID[];
BEGIN
  SELECT u.email INTO actor_email FROM auth.users u
    JOIN public.admin_users a ON lower(a.email)=lower(u.email) WHERE u.id=p_actor_id;
  IF actor_email IS NULL THEN RAISE EXCEPTION 'ไม่มีสิทธิ์กำหนดจำนวนออเดอร์'; END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'รายการผักไม่ถูกต้อง'; END IF;

  PERFORM 1 FROM public.round_items WHERE round_id=p_round_id ORDER BY id FOR UPDATE;
  SELECT * INTO round_record FROM public.planting_rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบรอบปลูก'; END IF;
  IF round_record.status::TEXT IN ('completed','cancelled') OR round_record.closure_reason IS NOT NULL THEN
    RAISE EXCEPTION 'รอบสิ้นสุดแล้ว ไม่สามารถแก้จำนวนออเดอร์';
  END IF;

  FOR entry IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    item_id := (entry->>'id')::UUID;
    remaining := (entry->>'remaining')::INTEGER;
    IF remaining IS NULL OR remaining < 0 OR remaining > 1000000 THEN
      RAISE EXCEPTION 'จำนวนออเดอร์ต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง 1000000';
    END IF;
    IF item_id = ANY(seen) THEN RAISE EXCEPTION 'เลือกผักซ้ำกัน'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.round_items WHERE id=item_id AND round_id=p_round_id) THEN
      RAISE EXCEPTION 'ผักที่เลือกไม่อยู่ในรอบนี้';
    END IF;
    seen := array_append(seen,item_id);
  END LOOP;

  UPDATE public.round_items SET order_limit_remaining=NULL,
    order_limit_version=order_limit_version+1 WHERE round_id=p_round_id;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    UPDATE public.round_items SET order_limit_remaining=(entry->>'remaining')::INTEGER
      WHERE id=(entry->>'id')::UUID;
  END LOOP;
  -- Saving crop limits replaces the legacy round-wide quota.
  UPDATE public.planting_rounds SET order_limit_remaining=NULL,
    order_limit_version=order_limit_version+1,updated_at=now() WHERE id=p_round_id;
  INSERT INTO public.audit_logs(actor_id,actor_email,entity_type,entity_id,action,old_data,new_data)
    VALUES(p_actor_id,actor_email,'planting_rounds',p_round_id::TEXT,'update',
      jsonb_build_object('order_limit_remaining',round_record.order_limit_remaining),
      jsonb_build_object('crop_order_limits',p_items));
  RETURN jsonb_build_object('round_id',p_round_id,'crop_order_limits',p_items);
END $$;
REVOKE ALL ON FUNCTION public.set_round_item_order_limits(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_round_item_order_limits(UUID,UUID,JSONB) TO service_role;

-- Leave the legacy whole-round quota in place, but do not lock the round when
-- it is disabled. Crop orders lock their round item first.
CREATE OR REPLACE FUNCTION public.enforce_round_order_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE round_record RECORD; consume BOOLEAN; current_remaining INTEGER;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.round_id IS DISTINCT FROM OLD.round_id THEN RAISE EXCEPTION 'ไม่สามารถย้ายออเดอร์ข้ามรอบ'; END IF;
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    consume:=OLD.status::TEXT='cancelled' AND NEW.status::TEXT<>'cancelled';
  ELSE
    NEW.order_limit_version:=NULL;
    consume:=NEW.status::TEXT<>'cancelled';
  END IF;
  SELECT order_limit_remaining INTO current_remaining FROM public.planting_rounds WHERE id=NEW.round_id;
  IF current_remaining IS NULL THEN NEW.order_limit_version:=NULL; RETURN NEW; END IF;
  SELECT * INTO round_record FROM public.planting_rounds WHERE id=NEW.round_id FOR UPDATE;
  IF round_record.order_limit_remaining IS NULL THEN NEW.order_limit_version:=NULL; RETURN NEW; END IF;
  IF consume THEN
    UPDATE public.planting_rounds SET order_limit_remaining=order_limit_remaining-1
      WHERE id=NEW.round_id AND order_limit_remaining>0
      RETURNING order_limit_version INTO NEW.order_limit_version;
    IF NOT FOUND THEN RAISE EXCEPTION 'รอบนี้รับออเดอร์ครบจำนวนแล้ว กรุณาเลือกรอบอื่นหรือติดต่อฟาร์ม'; END IF;
  ELSIF TG_OP='UPDATE' AND NEW.status::TEXT='cancelled' AND OLD.order_limit_version=round_record.order_limit_version THEN
    UPDATE public.planting_rounds SET order_limit_remaining=order_limit_remaining+1 WHERE id=NEW.round_id;
    NEW.order_limit_version:=NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.consume_round_item_order_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE remaining INTEGER; version BIGINT; order_status TEXT;
BEGIN
  SELECT ri.order_limit_remaining,ri.order_limit_version INTO remaining,version
    FROM public.round_items ri WHERE ri.id=NEW.round_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบผักในรอบปลูก'; END IF;
  SELECT status::TEXT INTO order_status FROM public.orders WHERE id=NEW.order_id;
  NEW.order_limit_version:=NULL;
  IF order_status='cancelled' OR remaining IS NULL THEN RETURN NEW; END IF;
  UPDATE public.round_items SET order_limit_remaining=order_limit_remaining-1
    WHERE id=NEW.round_item_id AND order_limit_remaining>0
    RETURNING order_limit_version INTO NEW.order_limit_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'ผักชนิดนี้รับออเดอร์ครบจำนวนแล้ว กรุณาเลือกผักชนิดอื่นหรือติดต่อฟาร์ม'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS consume_round_item_order_limit ON public.order_items;
CREATE TRIGGER consume_round_item_order_limit BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.consume_round_item_order_limit();
REVOKE ALL ON FUNCTION public.consume_round_item_order_limit() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.restore_round_item_order_limits()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item RECORD; item_limit RECORD; new_version BIGINT;
BEGIN
  IF OLD.status::TEXT='cancelled' AND NEW.status::TEXT<>'cancelled' THEN
    FOR item IN SELECT id,round_item_id FROM public.order_items WHERE order_id=NEW.id ORDER BY round_item_id FOR UPDATE LOOP
      SELECT order_limit_remaining,order_limit_version INTO item_limit
        FROM public.round_items WHERE id=item.round_item_id FOR UPDATE;
      IF item_limit.order_limit_remaining IS NOT NULL THEN
        UPDATE public.round_items SET order_limit_remaining=order_limit_remaining-1
          WHERE id=item.round_item_id AND order_limit_remaining>0
          RETURNING order_limit_version INTO new_version;
        IF NOT FOUND THEN RAISE EXCEPTION 'ผักชนิดนี้รับออเดอร์ครบจำนวนแล้ว ไม่สามารถคืนสถานะออเดอร์'; END IF;
        UPDATE public.order_items SET order_limit_version=new_version WHERE id=item.id;
      END IF;
    END LOOP;
  ELSIF OLD.status::TEXT<>'cancelled' AND NEW.status::TEXT='cancelled' THEN
    FOR item IN SELECT id,round_item_id,order_limit_version FROM public.order_items
      WHERE order_id=NEW.id ORDER BY round_item_id FOR UPDATE LOOP
      IF item.order_limit_version IS NOT NULL THEN
        UPDATE public.round_items SET order_limit_remaining=order_limit_remaining+1
          WHERE id=item.round_item_id AND order_limit_version=item.order_limit_version
            AND order_limit_remaining IS NOT NULL;
        UPDATE public.order_items SET order_limit_version=NULL WHERE id=item.id;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS restore_round_item_order_limits ON public.orders;
CREATE TRIGGER restore_round_item_order_limits AFTER UPDATE OF status ON public.orders
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.restore_round_item_order_limits();
REVOKE ALL ON FUNCTION public.restore_round_item_order_limits() FROM PUBLIC,anon,authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
