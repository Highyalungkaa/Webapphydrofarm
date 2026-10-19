-- Add the planting start milestone between fertilizing and transplanting.
-- Run before starting the updated backend and frontend.
BEGIN;

ALTER TABLE public.planting_rounds
  DROP CONSTRAINT IF EXISTS planting_rounds_current_step_check;

DO $$
BEGIN
  -- The column also guards the one-time renumbering when this file is rerun.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'planting_rounds'
      AND column_name = 'planting_start_date'
  ) THEN
    ALTER TABLE public.planting_rounds ADD COLUMN planting_start_date DATE;

    UPDATE public.planting_rounds
    SET current_step = CASE
      WHEN status = 'completed' OR completed_date IS NOT NULL THEN 8
      WHEN current_step >= 4 THEN current_step + 1
      WHEN current_step = 3 AND transplant_date IS NOT NULL THEN 4
      ELSE current_step
    END;
    -- Rounds awaiting transplanting now confirm the new milestone first.
    -- Historical planting start dates remain unknown rather than guessed.
  END IF;
END $$;

ALTER TABLE public.planting_rounds
  ADD CONSTRAINT planting_rounds_current_step_check
  CHECK (current_step BETWEEN 1 AND 8);

COMMIT;
