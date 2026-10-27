BEGIN;
CREATE OR REPLACE FUNCTION public.guard_round_completion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status::TEXT IN('completed','cancelled') AND OLD.status IS DISTINCT FROM NEW.status AND EXISTS(
    SELECT 1 FROM public.orders o WHERE (o.round_id=NEW.id OR EXISTS(
      SELECT 1 FROM public.order_items oi JOIN public.round_items i ON i.id=oi.round_item_id WHERE oi.order_id=o.id AND i.round_id=NEW.id))
    AND (o.status::TEXT NOT IN('completed','cancelled','no_show') OR (o.status::TEXT='completed' AND o.payment_status::TEXT<>'paid'))
  ) THEN RAISE EXCEPTION 'ยังมีออเดอร์ค้างดำเนินการหรือส่งสำเร็จแต่ยังไม่รับเงิน กรุณาจัดการออเดอร์ให้ครบก่อนสิ้นสุดรอบ'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_round_completion ON public.planting_rounds;
CREATE TRIGGER guard_round_completion BEFORE UPDATE ON public.planting_rounds FOR EACH ROW EXECUTE FUNCTION public.guard_round_completion();

CREATE OR REPLACE FUNCTION public.guard_farm_capacity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE capacity NUMERIC; allocated NUMERIC;
BEGIN
  IF TG_TABLE_NAME='app_settings' THEN IF NEW.key<>'farm_total_slots' THEN RETURN NEW; END IF; END IF;
  PERFORM pg_advisory_xact_lock(450001);
  IF TG_TABLE_NAME='app_settings' THEN
    capacity:=COALESCE(NEW.value->>'value',NEW.value#>>'{}')::NUMERIC;
    SELECT COALESCE(sum(slot_capacity),0) INTO allocated FROM public.plots;
  ELSE
    SELECT COALESCE(value->>'value',value#>>'{}')::NUMERIC INTO capacity FROM public.app_settings WHERE key='farm_total_slots';
    capacity:=COALESCE(capacity,5000);
    SELECT COALESCE(sum(slot_capacity),0)+NEW.slot_capacity INTO allocated FROM public.plots WHERE id<>NEW.id;
  END IF;
  IF capacity IS NULL OR capacity<1 OR capacity<>trunc(capacity) OR capacity::TEXT IN('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'ความจุฟาร์มต้องเป็นจำนวนต้นเต็มที่มากกว่า 0'; END IF;
  IF allocated>capacity THEN RAISE EXCEPTION 'จำนวนต้นที่จัดสรรให้แปลงรวม % ต้น เกินความจุฟาร์ม % ต้น กรุณาโหลดข้อมูลล่าสุด',allocated,capacity; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_farm_capacity ON public.plots;
CREATE TRIGGER guard_farm_capacity BEFORE INSERT OR UPDATE OF slot_capacity ON public.plots FOR EACH ROW EXECUTE FUNCTION public.guard_farm_capacity();
DROP TRIGGER IF EXISTS guard_farm_capacity ON public.app_settings;
CREATE TRIGGER guard_farm_capacity BEFORE INSERT OR UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.guard_farm_capacity();

CREATE OR REPLACE FUNCTION public.guard_active_plot()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r RECORD; item RECORD; metadata JSONB; allocation JSONB; planted NUMERIC:=0; legacy BOOLEAN:=FALSE; assigned JSONB;
BEGIN
  FOR r IN SELECT id,notes FROM public.planting_rounds WHERE status::TEXT NOT IN('completed','cancelled') AND completed_date IS NULL
    AND COALESCE(current_step,1)<8 AND NOT(sold_out_date IS NOT NULL AND COALESCE(current_step,1)>=7) LOOP
    BEGIN metadata:=r.notes::JSONB;EXCEPTION WHEN OTHERS THEN metadata:='{}'::JSONB;END;
    FOR item IN SELECT * FROM public.round_items WHERE round_id=r.id AND COALESCE(plant_count,1)>0 LOOP
      allocation:=metadata->'cropPlotAllocations'->item.crop_id::TEXT;
      IF jsonb_typeof(allocation)='object' THEN
        planted:=planted+GREATEST(0,COALESCE((allocation->>OLD.id::TEXT)::NUMERIC,0));
      ELSE
        assigned:=metadata->'cropPlotIds'->item.crop_id::TEXT;
        IF OLD.id=ANY(COALESCE(item.plot_ids,'{}'::UUID[])) OR assigned ? OLD.id::TEXT
          OR ((assigned IS NULL OR assigned='[]'::JSONB) AND cardinality(COALESCE(item.plot_ids,'{}'::UUID[]))=0
            AND (item.crop_id=OLD.crop_id OR item.crop_id=ANY(COALESCE(OLD.crop_ids,'{}'::UUID[])))) THEN legacy:=TRUE; END IF;
      END IF;
    END LOOP;
  END LOOP;
  IF TG_OP='DELETE' THEN
    IF planted>0 OR legacy THEN RAISE EXCEPTION 'แปลงนี้มีผักในรอบปลูกที่ยังใช้งานอยู่ กรุณาสิ้นสุดรอบก่อนลบแปลง'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.slot_capacity<planted OR (legacy AND NEW.slot_capacity<OLD.slot_capacity) THEN RAISE EXCEPTION 'ไม่สามารถลดความจุแปลงต่ำกว่าจำนวนที่กำลังปลูกหรือยังไม่มีข้อมูลจัดแปลงย้อนหลังครบ'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_active_plot ON public.plots;
CREATE TRIGGER guard_active_plot BEFORE DELETE OR UPDATE OF slot_capacity ON public.plots FOR EACH ROW EXECUTE FUNCTION public.guard_active_plot();
REVOKE ALL ON FUNCTION public.guard_round_completion(),public.guard_farm_capacity(),public.guard_active_plot() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
