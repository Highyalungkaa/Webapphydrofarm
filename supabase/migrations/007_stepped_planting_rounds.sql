-- Migration 007: Stepped Planting Rounds (วงจรการปลูกแบบเป็นสเต็ป 6 ขั้นตอน)
-- Timezone: Asia/Bangkok

-- 1. Add growing_days to crops table if not exists
ALTER TABLE crops
    ADD COLUMN IF NOT EXISTS growing_days INTEGER NOT NULL DEFAULT 45 CHECK (growing_days > 0);

-- Update default growing days for common hydroponic crops
UPDATE crops SET growing_days = 45 WHERE growing_days IS NULL;

-- 2. Adjust planting_rounds table columns with sensible defaults so creating a round is simple
ALTER TABLE planting_rounds
    ALTER COLUMN planted_at SET DEFAULT CURRENT_DATE,
    ALTER COLUMN growing_days SET DEFAULT 45,
    ALTER COLUMN expected_harvest_date SET DEFAULT (CURRENT_DATE + INTERVAL '45 days'),
    ALTER COLUMN booking_opens_at SET DEFAULT now(),
    ALTER COLUMN booking_closes_at SET DEFAULT (now() + INTERVAL '45 days'),
    ALTER COLUMN fulfillment_date SET DEFAULT (CURRENT_DATE + INTERVAL '45 days'),
    ALTER COLUMN pickup_start_time SET DEFAULT '09:00:00',
    ALTER COLUMN pickup_end_time SET DEFAULT '17:00:00',
    ALTER COLUMN delivery_start_time SET DEFAULT '13:00:00',
    ALTER COLUMN delivery_end_time SET DEFAULT '16:30:00';

-- 3. Add stepper lifecycle tracking columns to planting_rounds
ALTER TABLE planting_rounds
    ADD COLUMN IF NOT EXISTS current_step INTEGER NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 6),
    ADD COLUMN IF NOT EXISTS seed_date DATE,
    ADD COLUMN IF NOT EXISTS fertilizing_date DATE,
    ADD COLUMN IF NOT EXISTS transplant_date DATE,
    ADD COLUMN IF NOT EXISTS harvest_sale_date DATE,
    ADD COLUMN IF NOT EXISTS sold_out_date DATE,
    ADD COLUMN IF NOT EXISTS completed_date DATE;

-- Populate existing rounds with current_step based on status
UPDATE planting_rounds
SET 
    current_step = CASE
        WHEN status = 'completed' THEN 6
        WHEN status = 'harvested' OR status = 'booking_closed' THEN 5
        WHEN status = 'booking_open' THEN 4
        WHEN status = 'growing' THEN 3
        ELSE 1
    END,
    seed_date = COALESCE(seed_date, planted_at - 14),
    transplant_date = COALESCE(transplant_date, planted_at),
    harvest_sale_date = COALESCE(harvest_sale_date, expected_harvest_date);
