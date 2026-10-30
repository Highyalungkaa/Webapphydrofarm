-- Each plot defines its own plant capacity. Retain the existing setting row
-- for audit/history, but stop enforcing it as a second farm-wide ceiling.
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.plots'::regclass
      AND tgname = 'guard_active_plot' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'กรุณารัน migration 045 เพื่อป้องกันการลดความจุแปลงที่กำลังใช้งาน ก่อนรัน migration 047';
  END IF;
END $$;

DROP TRIGGER IF EXISTS guard_farm_capacity ON public.plots;
DROP TRIGGER IF EXISTS guard_farm_capacity ON public.app_settings;
DROP FUNCTION IF EXISTS public.guard_farm_capacity();

-- The guard_active_plot trigger still prevents reducing an occupied plot below
-- the plants assigned to active rounds. The planting allocation lock/solver
-- installed by migration 046 remains in place.
COMMIT;
NOTIFY pgrst, 'reload schema';
