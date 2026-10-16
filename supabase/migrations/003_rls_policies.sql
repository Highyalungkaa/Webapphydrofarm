-- Migration 003: Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crops ENABLE ROW LEVEL SECURITY;
ALTER TABLE planting_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. Profiles Policies
DROP POLICY IF EXISTS "Users can view own profile or admin can view all" ON profiles;
CREATE POLICY "Users can view own profile or admin can view all" ON profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid() OR is_admin())
    WITH CHECK (id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles
    FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid() OR is_admin());

-- 2. Admin Users Policies
DROP POLICY IF EXISTS "Admins can view admin_users" ON admin_users;
CREATE POLICY "Admins can view admin_users" ON admin_users
    FOR SELECT TO authenticated
    USING (is_admin());

DROP POLICY IF EXISTS "Admins can manage admin_users" ON admin_users;
CREATE POLICY "Admins can manage admin_users" ON admin_users
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- 3. Districts Policies
DROP POLICY IF EXISTS "Anyone can view active districts" ON districts;
CREATE POLICY "Anyone can view active districts" ON districts
    FOR SELECT TO public
    USING (is_active = TRUE OR is_admin());

DROP POLICY IF EXISTS "Admins can manage districts" ON districts;
CREATE POLICY "Admins can manage districts" ON districts
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- 4. Crops Catalog Policies
DROP POLICY IF EXISTS "Anyone can view active crops" ON crops;
CREATE POLICY "Anyone can view active crops" ON crops
    FOR SELECT TO public
    USING (is_active = TRUE OR is_admin());

DROP POLICY IF EXISTS "Admins can manage crops" ON crops;
CREATE POLICY "Admins can manage crops" ON crops
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- 5. Planting Rounds Policies
DROP POLICY IF EXISTS "Anyone can view non-draft rounds" ON planting_rounds;
CREATE POLICY "Anyone can view non-draft rounds" ON planting_rounds
    FOR SELECT TO public
    USING (status != 'draft' OR is_admin());

DROP POLICY IF EXISTS "Admins can manage planting_rounds" ON planting_rounds;
CREATE POLICY "Admins can manage planting_rounds" ON planting_rounds
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- 6. Round Items Policies
DROP POLICY IF EXISTS "Anyone can view round items" ON round_items;
CREATE POLICY "Anyone can view round items" ON round_items
    FOR SELECT TO public
    USING (
        EXISTS (
            SELECT 1 FROM planting_rounds pr
            WHERE pr.id = round_items.round_id
            AND (pr.status != 'draft' OR is_admin())
        )
    );

DROP POLICY IF EXISTS "Admins can manage round items" ON round_items;
CREATE POLICY "Admins can manage round items" ON round_items
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- 7. Orders Policies
DROP POLICY IF EXISTS "Customers can view own orders, admins can view all" ON orders;
CREATE POLICY "Customers can view own orders, admins can view all" ON orders
    FOR SELECT TO authenticated
    USING (customer_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "Customers can insert orders for self" ON orders;
CREATE POLICY "Customers can insert orders for self" ON orders
    FOR INSERT TO authenticated
    WITH CHECK (customer_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "Customers can cancel own orders, admins can update all" ON orders;
CREATE POLICY "Customers can cancel own orders, admins can update all" ON orders
    FOR UPDATE TO authenticated
    USING (customer_id = auth.uid() OR is_admin())
    WITH CHECK (customer_id = auth.uid() OR is_admin());

-- 8. Order Items Policies
DROP POLICY IF EXISTS "Customers can view items of own orders, admins can view all" ON order_items;
CREATE POLICY "Customers can view items of own orders, admins can view all" ON order_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_items.order_id
            AND (o.customer_id = auth.uid() OR is_admin())
        )
    );

DROP POLICY IF EXISTS "Admins can manage order items" ON order_items;
CREATE POLICY "Admins can manage order items" ON order_items
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- 9. App Settings Policies
DROP POLICY IF EXISTS "Anyone can view settings" ON app_settings;
CREATE POLICY "Anyone can view settings" ON app_settings
    FOR SELECT TO public
    USING (TRUE);

DROP POLICY IF EXISTS "Admins can manage settings" ON app_settings;
CREATE POLICY "Admins can manage settings" ON app_settings
    FOR ALL TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- 10. Audit Logs Policies
DROP POLICY IF EXISTS "Admins can view audit logs" ON audit_logs;
CREATE POLICY "Admins can view audit logs" ON audit_logs
    FOR SELECT TO authenticated
    USING (is_admin());

DROP POLICY IF EXISTS "Admins can insert audit logs" ON audit_logs;
CREATE POLICY "Admins can insert audit logs" ON audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (is_admin());
