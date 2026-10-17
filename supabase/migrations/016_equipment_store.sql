-- Equipment shop, inventory ledger, and customer orders.
CREATE TABLE IF NOT EXISTS equipment_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(160) NOT NULL,
  category VARCHAR(100) NOT NULL,
  sku VARCHAR(80) NOT NULL UNIQUE,
  image_url TEXT,
  description TEXT,
  price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending_confirmation'
    CHECK (status IN ('pending_confirmation','confirmed','processing','shipped','completed','cancelled')),
  payment_status payment_status NOT NULL DEFAULT 'unpaid',
  payment_method VARCHAR(40) NOT NULL CHECK (payment_method IN ('transfer','cash_on_delivery')),
  shipping_method VARCHAR(40) NOT NULL DEFAULT 'standard' CHECK (shipping_method = 'standard'),
  shipping_address TEXT NOT NULL,
  contact_phone VARCHAR(30) NOT NULL,
  tracking_number VARCHAR(100),
  note TEXT,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  paid_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES equipment_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES equipment_products(id) ON DELETE SET NULL,
  product_name VARCHAR(160) NOT NULL,
  sku VARCHAR(80) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_inventory_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES equipment_products(id) ON DELETE RESTRICT,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('restock','adjustment','sale','cancellation')),
  quantity_change INTEGER NOT NULL CHECK (quantity_change <> 0),
  stock_after INTEGER NOT NULL CHECK (stock_after >= 0),
  note TEXT,
  order_id UUID REFERENCES equipment_orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_products_active ON equipment_products(is_active, category);
CREATE INDEX IF NOT EXISTS idx_equipment_orders_customer ON equipment_orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_orders_status ON equipment_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_inventory_product ON equipment_inventory_transactions(product_id, created_at DESC);

ALTER TABLE equipment_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_inventory_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active equipment products" ON equipment_products;
CREATE POLICY "Public can view active equipment products" ON equipment_products
  FOR SELECT TO anon, authenticated USING (is_active OR is_admin());
DROP POLICY IF EXISTS "Admins manage equipment products" ON equipment_products;
CREATE POLICY "Admins manage equipment products" ON equipment_products
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "Customers view own equipment orders" ON equipment_orders;
CREATE POLICY "Customers view own equipment orders" ON equipment_orders
  FOR SELECT TO authenticated USING (customer_id = auth.uid() OR is_admin());
DROP POLICY IF EXISTS "Admins manage equipment orders" ON equipment_orders;
CREATE POLICY "Admins manage equipment orders" ON equipment_orders
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "Customers view own equipment order items" ON equipment_order_items;
CREATE POLICY "Customers view own equipment order items" ON equipment_order_items
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM equipment_orders o WHERE o.id = equipment_order_items.order_id AND (o.customer_id = auth.uid() OR is_admin())
  ));
DROP POLICY IF EXISTS "Admins manage equipment order items" ON equipment_order_items;
CREATE POLICY "Admins manage equipment order items" ON equipment_order_items
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "Admins view equipment inventory ledger" ON equipment_inventory_transactions;
CREATE POLICY "Admins view equipment inventory ledger" ON equipment_inventory_transactions
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE OR REPLACE FUNCTION create_equipment_order(
  p_customer_id UUID, p_items JSONB, p_shipping_address TEXT, p_contact_phone TEXT,
  p_payment_method TEXT, p_note TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order_id UUID := uuid_generate_v4();
  v_item JSONB;
  v_product equipment_products%ROWTYPE;
  v_qty INTEGER;
  v_total NUMERIC(12,2) := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'กรุณาเลือกสินค้าอย่างน้อย 1 รายการ';
  END IF;
  IF length(trim(coalesce(p_shipping_address, ''))) < 5 OR length(trim(coalesce(p_contact_phone, ''))) < 9 THEN
    RAISE EXCEPTION 'กรุณาตรวจสอบที่อยู่และเบอร์โทรศัพท์';
  END IF;
  IF p_payment_method NOT IN ('transfer','cash_on_delivery') THEN
    RAISE EXCEPTION 'วิธีชำระเงินไม่ถูกต้อง';
  END IF;

  INSERT INTO equipment_orders (id, customer_id, shipping_address, contact_phone, payment_method, note)
  VALUES (v_order_id, p_customer_id, trim(p_shipping_address), trim(p_contact_phone), p_payment_method, nullif(trim(coalesce(p_note,'')),''));

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::INTEGER;
    IF v_qty < 1 THEN RAISE EXCEPTION 'จำนวนสินค้าต้องมากกว่า 0'; END IF;
    SELECT * INTO v_product FROM equipment_products WHERE id = (v_item->>'product_id')::UUID FOR UPDATE;
    IF NOT FOUND OR NOT v_product.is_active THEN RAISE EXCEPTION 'ไม่พบสินค้าหรือสินค้าปิดจำหน่ายแล้ว'; END IF;
    IF v_product.stock_quantity < v_qty THEN RAISE EXCEPTION 'สินค้า % เหลือไม่เพียงพอ (คงเหลือ % ชิ้น)', v_product.name, v_product.stock_quantity; END IF;

    UPDATE equipment_products SET stock_quantity = stock_quantity - v_qty, updated_at = now() WHERE id = v_product.id;
    INSERT INTO equipment_order_items (order_id, product_id, product_name, sku, quantity, unit_price)
      VALUES (v_order_id, v_product.id, v_product.name, v_product.sku, v_qty, v_product.price);
    INSERT INTO equipment_inventory_transactions (product_id, actor_id, transaction_type, quantity_change, stock_after, note, order_id)
      VALUES (v_product.id, p_customer_id, 'sale', -v_qty, v_product.stock_quantity - v_qty, 'ขายผ่านหน้าร้าน', v_order_id);
    v_total := v_total + (v_product.price * v_qty);
  END LOOP;

  UPDATE equipment_orders SET total_amount = v_total WHERE id = v_order_id;
  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION create_equipment_order(UUID, JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_equipment_order(UUID, JSONB, TEXT, TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION adjust_equipment_stock(
  p_product_id UUID, p_quantity_change INTEGER, p_actor_id UUID, p_note TEXT, p_type TEXT DEFAULT 'adjustment'
) RETURNS equipment_products LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_product equipment_products%ROWTYPE; v_next INTEGER;
BEGIN
  IF p_quantity_change = 0 OR p_type NOT IN ('restock','adjustment') THEN RAISE EXCEPTION 'ข้อมูลปรับสต็อกไม่ถูกต้อง'; END IF;
  SELECT * INTO v_product FROM equipment_products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบสินค้า'; END IF;
  v_next := v_product.stock_quantity + p_quantity_change;
  IF v_next < 0 THEN RAISE EXCEPTION 'สต็อกคงเหลือไม่เพียงพอ'; END IF;
  UPDATE equipment_products SET stock_quantity = v_next, updated_at = now() WHERE id = p_product_id RETURNING * INTO v_product;
  INSERT INTO equipment_inventory_transactions(product_id, actor_id, transaction_type, quantity_change, stock_after, note)
  VALUES (p_product_id, p_actor_id, p_type, p_quantity_change, v_next, nullif(trim(coalesce(p_note,'')),''));
  RETURN v_product;
END;
$$;

REVOKE ALL ON FUNCTION adjust_equipment_stock(UUID, INTEGER, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION adjust_equipment_stock(UUID, INTEGER, UUID, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION cancel_equipment_order(p_order_id UUID, p_actor_id UUID)
RETURNS equipment_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order equipment_orders%ROWTYPE; v_item RECORD; v_product equipment_products%ROWTYPE; v_next INTEGER;
BEGIN
  SELECT * INTO v_order FROM equipment_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบคำสั่งซื้อ'; END IF;
  IF v_order.status = 'cancelled' THEN RETURN v_order; END IF;
  IF v_order.status IN ('shipped','completed') THEN RAISE EXCEPTION 'ออเดอร์ที่จัดส่งหรือสำเร็จแล้วไม่สามารถยกเลิกได้'; END IF;
  FOR v_item IN SELECT product_id, quantity FROM equipment_order_items WHERE order_id = p_order_id AND product_id IS NOT NULL LOOP
    SELECT * INTO v_product FROM equipment_products WHERE id = v_item.product_id FOR UPDATE;
    IF FOUND THEN
      v_next := v_product.stock_quantity + v_item.quantity;
      UPDATE equipment_products SET stock_quantity = v_next, updated_at = now() WHERE id = v_product.id;
      INSERT INTO equipment_inventory_transactions(product_id, actor_id, transaction_type, quantity_change, stock_after, note, order_id)
      VALUES (v_product.id, p_actor_id, 'cancellation', v_item.quantity, v_next, 'คืนสต็อกจากคำสั่งซื้อที่ยกเลิก', p_order_id);
    END IF;
  END LOOP;
  UPDATE equipment_orders SET status = 'cancelled', cancelled_at = now(), updated_at = now() WHERE id = p_order_id RETURNING * INTO v_order;
  RETURN v_order;
END;
$$;
REVOKE ALL ON FUNCTION cancel_equipment_order(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_equipment_order(UUID, UUID) TO service_role;
