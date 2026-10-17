-- Migration 001: Initial Schema for Hydroponic Pre-order System
-- Timezone: Asia/Bangkok, UUID primary keys, timestamptz everywhere

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Districts (อำเภอ/ตำบล ในตัวเมืองที่จัดส่งได้)
CREATE TABLE IF NOT EXISTS districts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Bangkok'::text, now())
);

-- 2. Crops Catalog (แคตตาล็อกชนิดผัก)
CREATE TABLE IF NOT EXISTS crops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    default_price_per_kg NUMERIC(10, 2) NOT NULL CHECK (default_price_per_kg >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Bangkok'::text, now())
);

-- 3. Admin Users (อีเมลผู้ดูแลระบบ)
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Bangkok'::text, now())
);

-- 4. Customer Profiles (โปรไฟล์ลูกค้า ผูกกับ auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(150),
    phone VARCHAR(30),
    address_detail TEXT,
    district_id UUID REFERENCES districts(id) ON DELETE SET NULL,
    no_show_count INTEGER NOT NULL DEFAULT 0 CHECK (no_show_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Bangkok'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Bangkok'::text, now())
);

-- 5. Planting Rounds (รอบการปลูก)
DO $$ BEGIN
    CREATE TYPE round_status AS ENUM (
        'draft',
        'growing',
        'booking_open',
        'booking_closed',
        'harvested',
        'completed',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS planting_rounds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    planted_at DATE NOT NULL,
    growing_days INTEGER NOT NULL CHECK (growing_days > 0),
    expected_harvest_date DATE NOT NULL,
    booking_opens_at TIMESTAMPTZ NOT NULL,
    booking_closes_at TIMESTAMPTZ,
    fulfillment_date DATE NOT NULL,
    pickup_start_time TIME NOT NULL,
    pickup_end_time TIME NOT NULL,
    delivery_start_time TIME NOT NULL,
    delivery_end_time TIME NOT NULL,
    status round_status NOT NULL DEFAULT 'draft',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Bangkok'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Bangkok'::text, now()),
    CONSTRAINT check_booking_window CHECK (booking_closes_at IS NULL OR booking_closes_at > booking_opens_at OR status = 'booking_closed')
);

-- 6. Round Items (รายการผักในแต่ละรอบการปลูก)
CREATE TABLE IF NOT EXISTS round_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    round_id UUID NOT NULL REFERENCES planting_rounds(id) ON DELETE CASCADE,
    crop_id UUID NOT NULL REFERENCES crops(id) ON DELETE RESTRICT,
    estimated_qty_kg NUMERIC(10, 2) NOT NULL CHECK (estimated_qty_kg >= 0),
    bookable_qty_kg NUMERIC(10, 2) NOT NULL CHECK (bookable_qty_kg >= 0),
    actual_qty_kg NUMERIC(10, 2) CHECK (actual_qty_kg IS NULL OR actual_qty_kg >= 0),
    price_per_kg NUMERIC(10, 2) NOT NULL CHECK (price_per_kg >= 0),
    max_qty_per_order_kg NUMERIC(10, 2) CHECK (max_qty_per_order_kg IS NULL OR max_qty_per_order_kg >= 0.5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Bangkok'::text, now()),
    CONSTRAINT uq_round_crop UNIQUE (round_id, crop_id)
);

-- 7. Orders (คำสั่งจองผัก)
DO $$ BEGIN
    CREATE TYPE order_status AS ENUM (
        'pending_confirmation',
        'confirmed',
        'ready',
        'completed',
        'cancelled',
        'no_show'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE fulfillment_method AS ENUM (
        'pickup',
        'delivery'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM (
        'unpaid',
        'paid'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_method AS ENUM (
        'cash',
        'transfer'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    round_id UUID NOT NULL REFERENCES planting_rounds(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    fulfillment_method fulfillment_method NOT NULL DEFAULT 'pickup',
    delivery_address TEXT,
    district_id UUID REFERENCES districts(id) ON DELETE RESTRICT,
    contact_phone VARCHAR(30) NOT NULL,
    note TEXT,
    status order_status NOT NULL DEFAULT 'confirmed',
    requires_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
    confirmed_at TIMESTAMPTZ,
    payment_status payment_status NOT NULL DEFAULT 'unpaid',
    payment_method payment_method,
    paid_at TIMESTAMPTZ,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    needs_customer_notice BOOLEAN NOT NULL DEFAULT FALSE,
    accepted_substitution_terms_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Bangkok'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Bangkok'::text, now())
);

-- 8. Order Items (รายการผักในออเดอร์)
DO $$ BEGIN
    CREATE TYPE fulfillment_source AS ENUM (
        'own',
        'substitute'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    round_item_id UUID NOT NULL REFERENCES round_items(id) ON DELETE RESTRICT,
    qty_kg NUMERIC(10, 2) NOT NULL CHECK (qty_kg >= 0.5),
    price_per_kg NUMERIC(10, 2) NOT NULL CHECK (price_per_kg >= 0),
    fulfilled_qty_kg NUMERIC(10, 2) CHECK (fulfilled_qty_kg IS NULL OR fulfilled_qty_kg >= 0),
    fulfillment_source fulfillment_source,
    substitute_supplier VARCHAR(150),
    substitute_cost_per_kg NUMERIC(10, 2) CHECK (substitute_cost_per_kg IS NULL OR substitute_cost_per_kg >= 0),
    substitute_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Bangkok'::text, now())
);

-- 9. App Settings (การตั้งค่าระบบ)
CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Bangkok'::text, now())
);

-- 10. Audit Logs (บันทึกประวัติการกระทำของแอดมิน)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_email VARCHAR(255),
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Bangkok'::text, now())
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_rounds_status_harvest ON planting_rounds(status, expected_harvest_date);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_round ON orders(round_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_round_items_round ON round_items(round_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_round_item ON order_items(round_item_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
