ALTER TABLE equipment_orders
  ADD COLUMN IF NOT EXISTS delivery_update_image_url TEXT,
  ADD COLUMN IF NOT EXISTS delivery_update_message TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'equipment-order-updates',
  'equipment-order-updates',
  TRUE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::TEXT[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Anyone can view equipment shipment updates" ON storage.objects;
CREATE POLICY "Anyone can view equipment shipment updates"
ON storage.objects FOR SELECT
USING (bucket_id = 'equipment-order-updates');
