-- Preserve the exact total amount paid for substitute produce.
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS substitute_total_cost NUMERIC(10, 2)
  CHECK (substitute_total_cost IS NULL OR substitute_total_cost >= 0);

-- Backfill existing substitute records from their quantity and unit cost.
UPDATE order_items
SET substitute_total_cost = ROUND(fulfilled_qty_kg * substitute_cost_per_kg, 2)
WHERE fulfillment_source = 'substitute'
  AND substitute_total_cost IS NULL
  AND fulfilled_qty_kg IS NOT NULL
  AND substitute_cost_per_kg IS NOT NULL;
