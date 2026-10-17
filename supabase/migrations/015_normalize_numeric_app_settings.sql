-- Older API versions stored numeric settings as JSONB strings (for example, "0").
-- Convert those scalar strings to JSONB numbers so SQL numeric casts work reliably.
UPDATE app_settings
SET value = to_jsonb((value #>> '{}')::numeric)
WHERE key IN (
  'delivery_min_total_kg',
  'large_order_threshold_kg',
  'cancellation_deadline_hours_before_harvest',
  'no_show_limit',
  'farm_total_slots'
)
  AND jsonb_typeof(value) = 'string'
  AND (value #>> '{}') ~ '^-?[0-9]+([.][0-9]+)?$';
