-- Preserve completed transaction history while allowing permanent deletion of
-- crops, plots and equipment products. Run after 048 and deploy the matching API.
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.plots'::REGCLASS
    AND tgname='guard_active_plot' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'กรุณารัน migration 045 ก่อน เพื่อป้องกันการลบแปลงที่ยังใช้งาน';
  END IF;
END $$;

ALTER TABLE public.round_items ADD COLUMN IF NOT EXISTS crop_id_snapshot UUID;
ALTER TABLE public.round_items ADD COLUMN IF NOT EXISTS crop_name_snapshot TEXT;
ALTER TABLE public.round_items ADD COLUMN IF NOT EXISTS crop_image_snapshot TEXT;
ALTER TABLE public.round_items ADD COLUMN IF NOT EXISTS crop_slots_per_kg_snapshot NUMERIC;
ALTER TABLE public.round_items ADD COLUMN IF NOT EXISTS crop_growing_days_snapshot INTEGER;
UPDATE public.round_items i SET crop_id_snapshot=COALESCE(i.crop_id_snapshot,i.crop_id),
  crop_name_snapshot=COALESCE(i.crop_name_snapshot,c.name),
  crop_image_snapshot=COALESCE(i.crop_image_snapshot,c.image_url),
  crop_slots_per_kg_snapshot=COALESCE(i.crop_slots_per_kg_snapshot,c.slots_per_kg),
  crop_growing_days_snapshot=COALESCE(i.crop_growing_days_snapshot,c.growing_days)
FROM public.crops c WHERE i.crop_id=c.id AND i.crop_name_snapshot IS NULL;

CREATE OR REPLACE FUNCTION public.snapshot_round_item_crop() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c RECORD;
BEGIN
  IF NEW.crop_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.crop_id IS DISTINCT FROM OLD.crop_id) THEN
    SELECT id,name,image_url,slots_per_kg,growing_days INTO c FROM public.crops WHERE id=NEW.crop_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบชนิดผัก'; END IF;
    NEW.crop_id_snapshot:=c.id; NEW.crop_name_snapshot:=c.name;
    NEW.crop_image_snapshot:=c.image_url; NEW.crop_slots_per_kg_snapshot:=c.slots_per_kg;
    NEW.crop_growing_days_snapshot:=c.growing_days;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS snapshot_round_item_crop ON public.round_items;
CREATE TRIGGER snapshot_round_item_crop BEFORE INSERT OR UPDATE OF crop_id ON public.round_items
FOR EACH ROW EXECUTE FUNCTION public.snapshot_round_item_crop();

ALTER TABLE public.round_items ALTER COLUMN crop_id DROP NOT NULL;
ALTER TABLE public.round_items DROP CONSTRAINT IF EXISTS round_items_crop_id_fkey;
ALTER TABLE public.round_items ADD CONSTRAINT round_items_crop_id_fkey FOREIGN KEY(crop_id)
REFERENCES public.crops(id) ON DELETE SET NULL;

-- Migration 031 protects the planting baseline. Clearing the catalog FK after
-- a finished round is different from changing what was planted.
CREATE OR REPLACE FUNCTION public.protect_plant_loss_baseline()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.loss_baseline_plant_count IS NOT NULL AND (
    NEW.plant_count IS DISTINCT FROM OLD.plant_count
    OR (NEW.crop_id IS DISTINCT FROM OLD.crop_id AND NOT (
      NEW.crop_id IS NULL AND NEW.crop_name_snapshot IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.planting_rounds r WHERE r.id=OLD.round_id
        AND r.status::TEXT IN ('completed','cancelled'))))
    OR NEW.round_id IS DISTINCT FROM OLD.round_id
    OR NEW.estimated_qty_kg IS DISTINCT FROM OLD.estimated_qty_kg
    OR NEW.planting_plants_per_kg IS DISTINCT FROM OLD.planting_plants_per_kg
  ) THEN RAISE EXCEPTION 'รายการที่มีประวัติสูญเสียแล้วไม่สามารถเปลี่ยนจำนวนปลูกเริ่มต้นหรือประมาณการเดิมได้'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.snapshot_projected_crop_weight()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
DECLARE rate NUMERIC;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.crop_id IS NULL AND OLD.crop_id IS NOT NULL AND NEW.crop_name_snapshot IS NOT NULL
      AND EXISTS(SELECT 1 FROM public.planting_rounds r WHERE r.id=OLD.round_id
        AND r.status::TEXT IN ('completed','cancelled')) THEN RETURN NEW; END IF;
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

CREATE OR REPLACE FUNCTION public.guard_delete_used_crop() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.round_items i JOIN public.planting_rounds r ON r.id=i.round_id
    WHERE i.crop_id=OLD.id AND r.status::TEXT NOT IN ('completed','cancelled')
      AND r.completed_date IS NULL) THEN
    RAISE EXCEPTION 'ผักนี้ยังอยู่ในรอบปลูกที่ไม่สิ้นสุด กรุณาสิ้นสุดรอบก่อนลบ';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS guard_delete_used_crop ON public.crops;
CREATE TRIGGER guard_delete_used_crop BEFORE DELETE ON public.crops
FOR EACH ROW EXECUTE FUNCTION public.guard_delete_used_crop();

CREATE OR REPLACE FUNCTION public.remove_deleted_crop_from_plots() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.plots SET crop_ids=array_remove(crop_ids,OLD.id) WHERE OLD.id=ANY(crop_ids);
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS remove_deleted_crop_from_plots ON public.crops;
CREATE TRIGGER remove_deleted_crop_from_plots AFTER DELETE ON public.crops
FOR EACH ROW EXECUTE FUNCTION public.remove_deleted_crop_from_plots();

-- A plant loss already has plot_name. Store the name for other round history too.
ALTER TABLE public.plant_losses DROP CONSTRAINT IF EXISTS plant_losses_plot_id_fkey;
ALTER TABLE public.plant_losses ADD CONSTRAINT plant_losses_plot_id_fkey FOREIGN KEY(plot_id)
REFERENCES public.plots(id) ON DELETE SET NULL;
CREATE OR REPLACE FUNCTION public.snapshot_deleted_plot() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r RECORD; snapshot_notes JSONB;
BEGIN
  FOR r IN SELECT id,notes,status,completed_date FROM public.planting_rounds LOOP
    BEGIN snapshot_notes:=r.notes::JSONB; EXCEPTION WHEN OTHERS THEN snapshot_notes:=jsonb_build_object('legacyNote',r.notes); END;
    snapshot_notes:=COALESCE(snapshot_notes,'{}'::JSONB);
    IF jsonb_typeof(snapshot_notes)<>'object' THEN snapshot_notes:=jsonb_build_object('legacyNote',r.notes); END IF;
    IF EXISTS (SELECT 1 FROM public.round_items i WHERE i.round_id=r.id
      AND OLD.id=ANY(COALESCE(i.plot_ids,'{}'::UUID[])))
      OR snapshot_notes::TEXT LIKE '%'||OLD.id::TEXT||'%' THEN
      IF r.status::TEXT NOT IN ('completed','cancelled') AND r.completed_date IS NULL THEN
        RAISE EXCEPTION 'แปลงนี้ยังอยู่ในรอบปลูกที่ไม่สิ้นสุด กรุณาสิ้นสุดรอบก่อนลบ';
      END IF;
      UPDATE public.planting_rounds SET notes=(snapshot_notes || jsonb_build_object('deletedPlotNames',
        COALESCE(snapshot_notes->'deletedPlotNames','{}'::JSONB) || jsonb_build_object(OLD.id::TEXT,OLD.name)))::TEXT
      WHERE id=r.id;
    END IF;
  END LOOP;
  UPDATE public.plant_losses SET plot_name=COALESCE(plot_name,OLD.name) WHERE plot_id=OLD.id;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS snapshot_deleted_plot ON public.plots;
CREATE TRIGGER snapshot_deleted_plot BEFORE DELETE ON public.plots
FOR EACH ROW EXECUTE FUNCTION public.snapshot_deleted_plot();

ALTER TABLE public.equipment_inventory_transactions ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE public.equipment_inventory_transactions ADD COLUMN IF NOT EXISTS product_sku TEXT;
UPDATE public.equipment_inventory_transactions t SET product_name=COALESCE(t.product_name,p.name),
  product_sku=COALESCE(t.product_sku,p.sku)
FROM public.equipment_products p WHERE t.product_id=p.id AND t.product_name IS NULL;
CREATE OR REPLACE FUNCTION public.snapshot_equipment_transaction_product() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.product_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.product_id IS DISTINCT FROM OLD.product_id) THEN
    SELECT name,sku INTO NEW.product_name,NEW.product_sku FROM public.equipment_products WHERE id=NEW.product_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS snapshot_equipment_transaction_product ON public.equipment_inventory_transactions;
CREATE TRIGGER snapshot_equipment_transaction_product BEFORE INSERT OR UPDATE OF product_id
ON public.equipment_inventory_transactions FOR EACH ROW EXECUTE FUNCTION public.snapshot_equipment_transaction_product();
ALTER TABLE public.equipment_inventory_transactions ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE public.equipment_inventory_transactions DROP CONSTRAINT IF EXISTS equipment_inventory_transactions_product_id_fkey;
ALTER TABLE public.equipment_inventory_transactions ADD CONSTRAINT equipment_inventory_transactions_product_id_fkey
FOREIGN KEY(product_id) REFERENCES public.equipment_products(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.guard_delete_used_equipment_product() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.equipment_order_items i JOIN public.equipment_orders o ON o.id=i.order_id
    WHERE i.product_id=OLD.id AND o.status NOT IN ('completed','cancelled')) THEN
    RAISE EXCEPTION 'สินค้านี้ยังอยู่ในคำสั่งซื้อที่ไม่สิ้นสุด กรุณาจัดการคำสั่งซื้อก่อนลบ';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS guard_delete_used_equipment_product ON public.equipment_products;
CREATE TRIGGER guard_delete_used_equipment_product BEFORE DELETE ON public.equipment_products
FOR EACH ROW EXECUTE FUNCTION public.guard_delete_used_equipment_product();

REVOKE ALL ON FUNCTION public.snapshot_round_item_crop(),public.guard_delete_used_crop(),
  public.remove_deleted_crop_from_plots(),public.snapshot_deleted_plot(),
  public.snapshot_equipment_transaction_product(),public.guard_delete_used_equipment_product()
FROM PUBLIC,anon,authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';
