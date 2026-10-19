-- Each plot may grow any number of catalog crops; keep legacy crop_id compatible.
BEGIN;

ALTER TABLE public.plots ADD COLUMN IF NOT EXISTS crop_ids UUID[];
UPDATE public.plots
SET crop_ids = CASE WHEN crop_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[crop_id] END
WHERE crop_ids IS NULL;
ALTER TABLE public.plots
  ALTER COLUMN crop_ids SET DEFAULT '{}'::uuid[],
  ALTER COLUMN crop_ids SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plots_crop_ids ON public.plots USING GIN (crop_ids);

COMMIT;
