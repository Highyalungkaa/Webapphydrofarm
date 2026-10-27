BEGIN;
-- Forecast only. Booking and order quotas remain independent of projected weight.
CREATE OR REPLACE FUNCTION public.snapshot_projected_crop_weight()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
DECLARE rate NUMERIC;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.plant_count IS NOT DISTINCT FROM OLD.plant_count AND NEW.crop_id IS NOT DISTINCT FROM OLD.crop_id THEN RETURN NEW; END IF;
    rate:=OLD.planting_plants_per_kg;
    IF NEW.crop_id IS DISTINCT FROM OLD.crop_id THEN rate:=NULL; END IF;
  END IF;
  IF rate IS NULL THEN SELECT slots_per_kg INTO rate FROM public.crops WHERE id=NEW.crop_id; END IF;
  IF NEW.plant_count IS NULL THEN RETURN NEW; END IF;
  IF rate IS NULL OR rate<=0 THEN RAISE EXCEPTION 'กรุณากำหนดจำนวนต้นต่อกิโลกรัมในแคตตาล็อกผักก่อนสร้างรอบ'; END IF;
  NEW.planting_plants_per_kg:=rate;
  NEW.estimated_qty_kg:=floor(NEW.plant_count/rate);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS snapshot_projected_crop_weight ON public.round_items;
CREATE TRIGGER snapshot_projected_crop_weight BEFORE INSERT OR UPDATE OF plant_count,crop_id ON public.round_items
FOR EACH ROW EXECUTE FUNCTION public.snapshot_projected_crop_weight();
COMMIT;
