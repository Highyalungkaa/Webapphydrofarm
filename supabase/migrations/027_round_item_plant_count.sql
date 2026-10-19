-- Keep exact planted quantities independently of rounded-down estimated weight.
ALTER TABLE public.round_items
  ADD COLUMN IF NOT EXISTS plant_count INTEGER CHECK (plant_count > 0);
-- Historical rows remain NULL; their existing weight-based capacity is preserved.
