-- Migration 004: Seed Data for Testing & Initial Setup

-- 1. App Settings
INSERT INTO app_settings (key, value, description) VALUES
    ('delivery_min_total_kg', '0'::jsonb, 'ยอดสั่งซื้อขั้นต่ำสำหรับบริการจัดส่ง (กก.) 0 = ไม่จำกัด'),
    ('large_order_threshold_kg', '10'::jsonb, 'เกณฑ์ออเดอร์ขนาดใหญ่ที่ต้องรอแอดมินโทรยืนยัน (กก.)'),
    ('cancellation_deadline_hours_before_harvest', '24'::jsonb, 'เส้นตายเวลายกเลิกออเดอร์ของลูกค้าก่อนถึงกำหนดเวลาส่งมอบ (ชั่วโมง)'),
    ('no_show_limit', '0'::jsonb, 'จำนวนครั้งไม่มารับของสูงสุดก่อนถูกระงับการจอง (0 = ไม่จำกัด)')
ON CONFLICT (key) DO NOTHING;

-- 2. Districts (พื้นที่ให้บริการจัดส่ง)
INSERT INTO districts (id, name, is_active) VALUES
    ('11111111-1111-1111-1111-111111111101', 'อำเภอเมือง - ตำบลในเมือง', TRUE),
    ('11111111-1111-1111-1111-111111111102', 'อำเภอเมือง - ตำบลรอบเมือง', TRUE),
    ('11111111-1111-1111-1111-111111111103', 'อำเภอเมือง - ตำบลหนองบัว', TRUE),
    ('11111111-1111-1111-1111-111111111104', 'อำเภอเมือง - ตำบลหมากแข้ง', TRUE)
ON CONFLICT (name) DO NOTHING;

-- 3. Crops Catalog (แคตตาล็อกผักสลัดไฮโดรโปนิกส์)
INSERT INTO crops (id, name, default_price_per_kg, is_active) VALUES
    ('22222222-2222-2222-2222-222222222201', 'กรีนโอ๊ค (Green Oak)', 120.00, TRUE),
    ('22222222-2222-2222-2222-222222222202', 'เรดโอ๊ค (Red Oak)', 120.00, TRUE),
    ('22222222-2222-2222-2222-222222222203', 'คอส (Cos / Romaine)', 130.00, TRUE),
    ('22222222-2222-2222-2222-222222222204', 'บัตเตอร์เฮด (Butterhead)', 140.00, TRUE),
    ('22222222-2222-2222-2222-222222222205', 'ฟิลเลย์ ไอซ์เบิร์ก (Frillice Iceberg)', 150.00, TRUE)
ON CONFLICT (name) DO NOTHING;

-- 4. Sample Planting Round (รอบการปลูกตัวอย่าง: เปิดให้จองอยู่)
-- วันนี้สมมุติรอบกำลังโตและเปิดให้จอง วันเก็บเกี่ยวอีก 5 วัน
INSERT INTO planting_rounds (
    id,
    name,
    planted_at,
    growing_days,
    expected_harvest_date,
    booking_opens_at,
    booking_closes_at,
    fulfillment_date,
    pickup_start_time,
    pickup_end_time,
    delivery_start_time,
    delivery_end_time,
    status,
    notes
) VALUES (
    '33333333-3333-3333-3333-333333333301',
    'รอบที่ 12/2026 - สลัดพรีเมียมรับลมหนาว',
    CURRENT_DATE - INTERVAL '35 days',
    42,
    CURRENT_DATE + INTERVAL '7 days',
    timezone('Asia/Bangkok'::text, now()) - INTERVAL '1 day',
    timezone('Asia/Bangkok'::text, now()) + INTERVAL '5 days',
    CURRENT_DATE + INTERVAL '7 days',
    '09:00:00',
    '17:00:00',
    '13:00:00',
    '16:30:00',
    'booking_open',
    'ผักสลัดชุดนี้ดูแลด้วยระบบน้ำหมุนเวียนมาตรฐาน สะอาด ปลอดสารพิษ 100%'
) ON CONFLICT (id) DO NOTHING;

-- 5. Round Items for Sample Round
INSERT INTO round_items (
    round_id,
    crop_id,
    estimated_qty_kg,
    bookable_qty_kg,
    actual_qty_kg,
    price_per_kg,
    max_qty_per_order_kg
) VALUES
    ('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222201', 50.0, 50.0, NULL, 120.00, 10.0),
    ('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222202', 40.0, 40.0, NULL, 120.00, 10.0),
    ('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222203', 30.0, 30.0, NULL, 130.00, 5.0),
    ('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222204', 25.0, 25.0, NULL, 140.00, NULL)
ON CONFLICT (round_id, crop_id) DO NOTHING;

-- 6. Sample Admin User (หมายเหตุ: ให้ผู้ใช้เพิ่มอีเมล Google ของตนเองใน admin_users เพื่อทดสอบสิทธิ์แอดมิน)
INSERT INTO admin_users (email) VALUES
    ('admin@hydrofarm.local')
ON CONFLICT (email) DO NOTHING;
