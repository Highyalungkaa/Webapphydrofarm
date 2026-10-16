-- Migration 005: Farm Settings & Plots Management (is_active: เปิดใช้งาน / ปิดใช้งาน)
-- Timezone: Asia/Bangkok, UUID primary keys, timestamptz everywhere

-- 1. Insert default farm settings into app_settings
INSERT INTO app_settings (key, value, description) VALUES
    ('farm_name', '"HydroFarm ฟาร์มไฮโดรโปนิกส์"'::jsonb, 'ชื่อฟาร์ม'),
    ('farm_total_slots', '5000'::jsonb, 'ความจุจำนวนช่อง/slot ผักที่ปลูกได้ทั้งหมดในฟาร์ม')
ON CONFLICT (key) DO NOTHING;

-- 2. Create Plots Table (แปลงปลูก / รางปลูก)
CREATE TABLE IF NOT EXISTS plots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    zone_name VARCHAR(100) NOT NULL,
    slot_capacity INTEGER NOT NULL CHECK (slot_capacity > 0),
    crop_id UUID REFERENCES crops(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Bangkok'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Bangkok'::text, now())
);

-- Ensure is_active column exists if plots table was created previously
ALTER TABLE plots ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Indices
CREATE INDEX IF NOT EXISTS idx_plots_zone ON plots(zone_name);
CREATE INDEX IF NOT EXISTS idx_plots_crop ON plots(crop_id);
CREATE INDEX IF NOT EXISTS idx_plots_active ON plots(is_active);

-- 3. Enable RLS on plots
ALTER TABLE plots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view plots" ON plots;
CREATE POLICY "Anyone can view plots" ON plots
    FOR SELECT TO public
    USING (TRUE);

DROP POLICY IF EXISTS "Admins can manage plots" ON plots;
CREATE POLICY "Admins can manage plots" ON plots
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Also grant public permissions if service_role / anon key is used
GRANT ALL ON plots TO postgres, service_role, authenticated, anon;
