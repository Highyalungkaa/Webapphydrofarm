-- Migration 010: Add plot_ids to round_items for linking planting plots to each crop
-- Timezone: Asia/Bangkok

-- 1. Add plot_ids column to round_items
ALTER TABLE round_items
    ADD COLUMN IF NOT EXISTS plot_ids UUID[] DEFAULT ARRAY[]::UUID[];

-- 2. Create GIN index for efficient plot querying
CREATE INDEX IF NOT EXISTS idx_round_items_plot_ids ON round_items USING GIN(plot_ids);
