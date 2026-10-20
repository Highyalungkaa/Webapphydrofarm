-- Keep the crop image bucket available and allow SVG alongside raster images.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'crop-images',
  'crop-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = GREATEST(COALESCE(storage.buckets.file_size_limit, 0), 5242880),
    allowed_mime_types = CASE
      WHEN storage.buckets.allowed_mime_types IS NULL THEN NULL
      ELSE ARRAY(
        SELECT DISTINCT mime
        FROM unnest(storage.buckets.allowed_mime_types || EXCLUDED.allowed_mime_types) AS types(mime)
      )
    END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Anyone can view crop images'
  ) THEN
    CREATE POLICY "Anyone can view crop images" ON storage.objects
      FOR SELECT USING (bucket_id = 'crop-images');
  END IF;
END $$;
