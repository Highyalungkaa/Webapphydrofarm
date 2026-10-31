-- Some databases skipped migration 010. Plot guards and history snapshots need
-- this optional array; existing cropPlotIds/cropPlotAllocations notes stay intact.
BEGIN;
ALTER TABLE public.round_items
  ADD COLUMN IF NOT EXISTS plot_ids UUID[] DEFAULT ARRAY[]::UUID[];
CREATE INDEX IF NOT EXISTS idx_round_items_plot_ids ON public.round_items USING GIN(plot_ids);
NOTIFY pgrst, 'reload schema';
COMMIT;
