-- Migration 006: Add slots_per_kg, image_url, and description to crops
-- Timezone: Asia/Bangkok

ALTER TABLE crops
    ADD COLUMN IF NOT EXISTS slots_per_kg NUMERIC(10, 2) NOT NULL DEFAULT 4.0 CHECK (slots_per_kg > 0),
    ADD COLUMN IF NOT EXISTS image_url TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT;

-- Update existing default sample crops with realistic hydroponic slots per kg and descriptions
UPDATE crops
SET slots_per_kg = 5.0,
    description = 'ผักสลัดยอดนิยม ใบหยักสีเขียวสด กรอบ หวาน นุ่ม ทานง่าย ไม่ขม เหมาะสำหรับสลัดโรลและแซนด์วิช',
    image_url = COALESCE(image_url, 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80')
WHERE name ILIKE '%กรีนโอ๊ค%' OR name ILIKE '%Green Oak%';

UPDATE crops
SET slots_per_kg = 5.0,
    description = 'ใบหยักปลายสีแดงอมม่วง รสชาติหวานนุ่ม กรอบ อุดมไปด้วยสารต้านอนุมูลอิสระ เพิ่มสีสันให้จานสลัด',
    image_url = COALESCE(image_url, 'https://images.unsplash.com/photo-1556801712-76c8eb07bbc9?auto=format&fit=crop&w=600&q=80')
WHERE name ILIKE '%เรดโอ๊ค%' OR name ILIKE '%Red Oak%';

UPDATE crops
SET slots_per_kg = 4.0,
    description = 'ผักกาดโรเมน ใบยาวรี สีเขียวเข้ม ก้านกรอบหวานฉ่ำ นิยมที่สุดสำหรับเมนูซีซาร์สลัด (Caesar Salad)',
    image_url = COALESCE(image_url, 'https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?auto=format&fit=crop&w=600&q=80')
WHERE name ILIKE '%คอส%' OR name ILIKE '%Cos%' OR name ILIKE '%Romaine%';

UPDATE crops
SET slots_per_kg = 4.0,
    description = 'ใบเรียงซ้อนเป็นทรงดอกกุหลาบ ใบหนานุ่ม รสชาติหวานมัน ละมุนลิ้น ไม่ขม นิยมทานสดคู่กับสเต๊กหรือน้ำสลัดครีม',
    image_url = COALESCE(image_url, 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&w=600&q=80')
WHERE name ILIKE '%บัตเตอร์เฮด%' OR name ILIKE '%Butterhead%';
