-- Keep the database constraint aligned with the seven lifecycle steps used by the app.
ALTER TABLE planting_rounds
  DROP CONSTRAINT IF EXISTS planting_rounds_current_step_check;

ALTER TABLE planting_rounds
  ADD CONSTRAINT planting_rounds_current_step_check
  CHECK (current_step BETWEEN 1 AND 7);
