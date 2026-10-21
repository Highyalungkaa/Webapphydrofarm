BEGIN;

ALTER TABLE public.round_items
  ADD COLUMN IF NOT EXISTS planting_plants_per_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS lost_plant_count INTEGER NOT NULL DEFAULT 0 CHECK (lost_plant_count >= 0),
  ADD COLUMN IF NOT EXISTS loss_baseline_plant_count INTEGER,
  ADD COLUMN IF NOT EXISTS loss_plants_per_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS remaining_estimated_qty_kg NUMERIC;

-- Freeze the planting rate for new rounds. Older rounds use today's catalog rate
-- as a one-time baseline because older schemas did not store this snapshot.
UPDATE public.round_items ri SET planting_plants_per_kg = c.slots_per_kg
FROM public.crops c WHERE c.id = ri.crop_id AND ri.planting_plants_per_kg IS NULL;
CREATE OR REPLACE FUNCTION public.snapshot_planting_rate()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  SELECT slots_per_kg INTO NEW.planting_plants_per_kg FROM public.crops WHERE id = NEW.crop_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS snapshot_planting_rate ON public.round_items;
CREATE TRIGGER snapshot_planting_rate BEFORE INSERT ON public.round_items
FOR EACH ROW EXECUTE FUNCTION public.snapshot_planting_rate();

CREATE TABLE IF NOT EXISTS public.plant_losses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE,
  round_id UUID NOT NULL REFERENCES public.planting_rounds(id) ON DELETE RESTRICT,
  round_item_id UUID NOT NULL REFERENCES public.round_items(id) ON DELETE RESTRICT,
  plot_id UUID REFERENCES public.plots(id) ON DELETE RESTRICT,
  plot_name TEXT,
  loss_date DATE NOT NULL,
  plant_count INTEGER NOT NULL CHECK (plant_count > 0),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  note TEXT,
  image_path TEXT,
  stage INTEGER NOT NULL CHECK (stage BETWEEN 1 AND 8),
  plants_per_kg NUMERIC NOT NULL CHECK (plants_per_kg > 0),
  estimated_loss_kg NUMERIC NOT NULL CHECK (estimated_loss_kg >= 0),
  recorded_by UUID NOT NULL REFERENCES auth.users(id),
  recorded_by_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES auth.users(id),
  void_reason TEXT
);
CREATE INDEX IF NOT EXISTS plant_losses_round ON public.plant_losses(round_id, created_at DESC);
ALTER TABLE public.plant_losses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_read_plant_losses ON public.plant_losses;
CREATE POLICY admin_read_plant_losses ON public.plant_losses FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.plant_losses FROM anon, authenticated;
GRANT SELECT ON public.plant_losses TO authenticated;
GRANT ALL ON public.plant_losses TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('plant-loss-images', 'plant-loss-images', false, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Both recording and reversing losses lock the same round item as create_order.
-- request_id makes a retry of a successful submission safe.
CREATE OR REPLACE FUNCTION public.record_plant_loss(
  p_round_id UUID, p_round_item_id UUID, p_actor_id UUID, p_request_id UUID,
  p_loss_date DATE, p_plant_count INTEGER, p_reason TEXT,
  p_plot_id UUID DEFAULT NULL, p_note TEXT DEFAULT NULL, p_image_path TEXT DEFAULT NULL,
  p_void_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r public.planting_rounds%ROWTYPE;
  ri public.round_items%ROWTYPE;
  entry public.plant_losses%ROWTYPE;
  actor_email TEXT;
  rate NUMERIC;
  baseline INTEGER;
  total_lost INTEGER;
  before_kg NUMERIC;
  after_kg NUMERIC;
  plot_ids JSONB;
  snapshot_plot_name TEXT;
BEGIN
  SELECT u.email INTO actor_email FROM auth.users u JOIN public.admin_users a
    ON lower(trim(a.email)) = lower(trim(u.email)) WHERE u.id = p_actor_id LIMIT 1;
  IF actor_email IS NULL THEN RAISE EXCEPTION 'ไม่มีสิทธิ์บันทึกผักเสียหาย'; END IF;
  SELECT * INTO r FROM public.planting_rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบรอบปลูก'; END IF;
  IF r.status::text IN ('completed','cancelled') OR r.completed_date IS NOT NULL
     OR r.sold_out_date IS NOT NULL THEN
    RAISE EXCEPTION 'รอบที่ขายหมด สิ้นสุด หรือยกเลิกแล้วไม่สามารถบันทึกผักเสียหายได้';
  END IF;
  SELECT * INTO ri FROM public.round_items WHERE id = p_round_item_id AND round_id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบรายการผักในรอบนี้'; END IF;
  IF p_void_id IS NULL THEN
    SELECT * INTO entry FROM public.plant_losses WHERE request_id = p_request_id;
    IF FOUND THEN
      IF entry.round_id <> p_round_id OR entry.round_item_id <> p_round_item_id
        OR entry.plant_count <> p_plant_count OR entry.loss_date <> p_loss_date
        OR entry.reason <> trim(p_reason) OR entry.plot_id IS DISTINCT FROM p_plot_id
        OR entry.note IS DISTINCT FROM nullif(trim(p_note),'')
        OR entry.image_path IS DISTINCT FROM p_image_path THEN
        RAISE EXCEPTION 'รหัสรายการซ้ำกับข้อมูลอื่น กรุณาเปิดฟอร์มใหม่';
      END IF;
      RETURN to_jsonb(entry);
    END IF;
  END IF;
  SELECT COALESCE(ri.loss_plants_per_kg, ri.planting_plants_per_kg, c.slots_per_kg) INTO rate FROM public.crops c WHERE c.id = ri.crop_id;
  IF rate IS NULL OR rate <= 0 THEN RAISE EXCEPTION 'กรุณากำหนดจำนวนต้นต่อกิโลกรัมของผักก่อน'; END IF;
  baseline := COALESCE(ri.loss_baseline_plant_count, ri.plant_count, round(ri.estimated_qty_kg * rate)::INTEGER);
  before_kg := floor((baseline - ri.lost_plant_count) / rate);
  IF p_void_id IS NOT NULL THEN
    SELECT * INTO entry FROM public.plant_losses
      WHERE id = p_void_id AND round_item_id = ri.id AND round_id = r.id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบประวัติที่ต้องการยกเลิก'; END IF;
    IF entry.voided_at IS NOT NULL THEN RETURN to_jsonb(entry); END IF;
    IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'กรุณาระบุเหตุผลที่ยกเลิกรายการ'; END IF;
    total_lost := ri.lost_plant_count - entry.plant_count;
    UPDATE public.plant_losses SET voided_at = now(), voided_by = p_actor_id, void_reason = trim(p_reason)
      WHERE id = entry.id RETURNING * INTO entry;
  ELSE
    IF p_plant_count IS NULL OR p_plant_count <= 0 OR p_plant_count > baseline - ri.lost_plant_count THEN
      RAISE EXCEPTION 'จำนวนเสียหายต้องมากกว่า 0 และไม่เกินจำนวนต้นคงเหลือ';
    END IF;
    IF p_loss_date IS NULL OR p_loss_date > (now() AT TIME ZONE 'Asia/Bangkok')::DATE
       OR p_loss_date < COALESCE(r.seed_date, r.created_at::DATE) THEN
      RAISE EXCEPTION 'วันที่พบต้องไม่ก่อนวันเริ่มรอบและไม่เป็นวันในอนาคต';
    END IF;
    IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'กรุณาระบุสาเหตุ'; END IF;
    BEGIN
      plot_ids := COALESCE((r.notes::JSONB)->'cropPlotIds'->(ri.crop_id::TEXT), '[]'::JSONB);
    EXCEPTION WHEN OTHERS THEN plot_ids := '[]'::JSONB;
    END;
    IF jsonb_typeof(plot_ids) <> 'array' THEN plot_ids := '[]'::JSONB; END IF;
    IF (jsonb_array_length(plot_ids) > 0 AND p_plot_id IS NULL)
       OR (p_plot_id IS NOT NULL AND NOT (plot_ids ? p_plot_id::TEXT)) THEN
      RAISE EXCEPTION 'กรุณาเลือกแปลงที่กำหนดให้ผักชนิดนี้ในรอบปลูก';
    END IF;
    IF p_plot_id IS NOT NULL THEN SELECT name INTO snapshot_plot_name FROM public.plots WHERE id = p_plot_id; END IF;
    IF p_image_path IS NOT NULL AND (
      split_part(p_image_path,'/',1) <> r.id::TEXT OR split_part(p_image_path,'/',2) <> p_actor_id::TEXT
      OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'plant-loss-images' AND name = p_image_path)
    ) THEN RAISE EXCEPTION 'รูปภาพไม่ตรงกับรอบปลูกหรือผู้บันทึก'; END IF;
    total_lost := ri.lost_plant_count + p_plant_count;
    after_kg := floor((baseline-total_lost)/rate);
    INSERT INTO public.plant_losses (request_id,round_id,round_item_id,plot_id,plot_name,loss_date,plant_count,
      reason,note,image_path,stage,plants_per_kg,estimated_loss_kg,recorded_by,recorded_by_email)
    VALUES (p_request_id,r.id,ri.id,p_plot_id,snapshot_plot_name,p_loss_date,p_plant_count,trim(p_reason),
      nullif(trim(p_note),''),p_image_path,COALESCE(r.current_step,1),rate,before_kg-after_kg,p_actor_id,actor_email)
    RETURNING * INTO entry;
  END IF;
  after_kg := floor((baseline-total_lost)/rate);
  UPDATE public.round_items SET lost_plant_count = total_lost, loss_baseline_plant_count = baseline,
    loss_plants_per_kg = rate, remaining_estimated_qty_kg = after_kg WHERE id = ri.id;
  INSERT INTO public.audit_logs(actor_id,actor_email,entity_type,entity_id,action,old_data,new_data)
    VALUES(p_actor_id,actor_email,'round_items',ri.id::TEXT,
      CASE WHEN p_void_id IS NULL THEN 'plant_loss' ELSE 'void_plant_loss' END,
      jsonb_build_object('lost_plant_count',ri.lost_plant_count),to_jsonb(entry));
  RETURN to_jsonb(entry);
END $$;
REVOKE ALL ON FUNCTION public.record_plant_loss(UUID,UUID,UUID,UUID,DATE,INTEGER,TEXT,UUID,TEXT,TEXT,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_plant_loss(UUID,UUID,UUID,UUID,DATE,INTEGER,TEXT,UUID,TEXT,TEXT,UUID) TO service_role;

-- Preserve the original planting baseline once loss history exists.
CREATE OR REPLACE FUNCTION public.protect_plant_loss_baseline()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.loss_baseline_plant_count IS NOT NULL AND (
    NEW.plant_count IS DISTINCT FROM OLD.plant_count OR NEW.crop_id IS DISTINCT FROM OLD.crop_id
    OR NEW.round_id IS DISTINCT FROM OLD.round_id OR NEW.estimated_qty_kg IS DISTINCT FROM OLD.estimated_qty_kg
    OR NEW.planting_plants_per_kg IS DISTINCT FROM OLD.planting_plants_per_kg
  ) THEN RAISE EXCEPTION 'รายการที่มีประวัติสูญเสียแล้วไม่สามารถเปลี่ยนจำนวนปลูกเริ่มต้นหรือประมาณการเดิมได้'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_plant_loss_baseline ON public.round_items;
CREATE TRIGGER protect_plant_loss_baseline BEFORE UPDATE ON public.round_items
FOR EACH ROW EXECUTE FUNCTION public.protect_plant_loss_baseline();

-- Do not change old customer orders or the admin's configured booking quantity.
-- Stop new bookings from consuming damaged plants, even via a direct RPC call.
CREATE OR REPLACE FUNCTION public.check_plant_loss_booking_capacity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ri public.round_items%ROWTYPE; booked NUMERIC; order_status TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.qty_kg <= OLD.qty_kg AND NEW.round_item_id = OLD.round_item_id AND NEW.order_id = OLD.order_id THEN RETURN NEW; END IF;
  SELECT * INTO ri FROM public.round_items WHERE id = NEW.round_item_id FOR UPDATE;
  IF ri.remaining_estimated_qty_kg IS NULL THEN RETURN NEW; END IF;
  SELECT status::TEXT INTO order_status FROM public.orders WHERE id = NEW.order_id;
  IF order_status = 'cancelled' THEN RETURN NEW; END IF;
  SELECT COALESCE(sum(oi.qty_kg),0) INTO booked FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.round_item_id = NEW.round_item_id AND o.status::TEXT <> 'cancelled'
      AND oi.id <> NEW.id;
  IF booked + NEW.qty_kg > LEAST(ri.bookable_qty_kg,ri.remaining_estimated_qty_kg) THEN
    RAISE EXCEPTION 'ผลผลิตคงเหลือหลังหักผักเสียหายไม่เพียงพอ กรุณาตรวจสอบจำนวนอีกครั้ง';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.check_plant_loss_booking_capacity() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS check_plant_loss_booking_capacity ON public.order_items;
CREATE TRIGGER check_plant_loss_booking_capacity BEFORE INSERT OR UPDATE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.check_plant_loss_booking_capacity();

-- Reinstating a cancelled order also consumes stock, without inserting new items.
CREATE OR REPLACE FUNCTION public.check_restored_order_loss_capacity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE entry RECORD; booked NUMERIC;
BEGIN
  IF OLD.status::TEXT <> 'cancelled' OR NEW.status::TEXT = 'cancelled' THEN RETURN NEW; END IF;
  FOR entry IN
    SELECT ri.id, ri.bookable_qty_kg, ri.remaining_estimated_qty_kg,
      (SELECT sum(oi.qty_kg) FROM public.order_items oi WHERE oi.order_id = NEW.id AND oi.round_item_id = ri.id) AS restore_kg
    FROM public.round_items ri
    WHERE ri.remaining_estimated_qty_kg IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = NEW.id AND oi.round_item_id = ri.id)
    ORDER BY ri.id FOR UPDATE OF ri
  LOOP
    SELECT COALESCE(sum(oi.qty_kg),0) INTO booked FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.round_item_id = entry.id AND o.status::TEXT <> 'cancelled' AND o.id <> NEW.id;
    IF booked + entry.restore_kg > LEAST(entry.bookable_qty_kg,entry.remaining_estimated_qty_kg) THEN
      RAISE EXCEPTION 'ไม่สามารถคืนสถานะออเดอร์ได้ ผลผลิตหลังหักผักเสียหายไม่เพียงพอ';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.check_restored_order_loss_capacity() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS check_restored_order_loss_capacity ON public.orders;
CREATE TRIGGER check_restored_order_loss_capacity BEFORE UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.check_restored_order_loss_capacity();
NOTIFY pgrst, 'reload schema';
COMMIT;
