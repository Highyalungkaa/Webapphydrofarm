insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'equipment-product-images',
  'equipment-product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Anyone can view equipment product images"
on storage.objects for select
using (bucket_id = 'equipment-product-images');
