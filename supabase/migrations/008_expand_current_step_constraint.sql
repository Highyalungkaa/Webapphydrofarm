-- Migration 008: Expand current_step check constraint to allow 1 to 7
-- Timezone: Asia/Bangkok

ALTER TABLE planting_rounds DROP CONSTRAINT IF EXISTS planting_rounds_current_step_check;
ALTER TABLE planting_rounds ADD CONSTRAINT planting_rounds_current_step_check CHECK (current_step BETWEEN 1 AND 7);
