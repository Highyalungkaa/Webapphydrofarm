-- Equipment order creation must not depend on the uuid-ossp extension being installed.
ALTER TABLE equipment_products ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE equipment_orders ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE equipment_order_items ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE equipment_inventory_transactions ALTER COLUMN id SET DEFAULT gen_random_uuid();

CREATE OR REPLACE FUNCTION create_equipment_order(
  p_customer_id UUID, p_items JSONB, p_shipping_address TEXT, p_contact_phone TEXT,
  p_payment_method TEXT, p_note TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order_id UUID := gen_random_uuid();
  v_item JSONB;
  v_product equipment_products%ROWTYPE;
  v_qty INTEGER;
  v_total NUMERIC(12,2) := 0;
  v_shipping_fee NUMERIC(12,2) := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'กรุณาเลือกสินค้าอย่างน้อย 1 รายการ';
  END IF;
  IF length(trim(coalesce(p_shipping_address, ''))) < 5 OR length(trim(coalesce(p_contact_phone, ''))) < 9 THEN
    RAISE EXCEPTION 'กรุณาตรวจสอบที่อยู่และเบอร์โทรศัพท์';
  END IF;
  IF p_payment_method <> 'cash_on_delivery' THEN
    RAISE EXCEPTION 'ร้านอุปกรณ์รับชำระเงินแบบเก็บเงินปลายทางเท่านั้น';
  END IF;

  SELECT (value #>> '{}')::NUMERIC(12,2) INTO v_shipping_fee FROM app_settings WHERE key = 'equipment_shipping_fee';
  v_shipping_fee := coalesce(v_shipping_fee, 0);

  INSERT INTO equipment_orders (id, customer_id, shipping_address, contact_phone, payment_method, shipping_fee, note)
  VALUES (v_order_id, p_customer_id, trim(p_shipping_address), trim(p_contact_phone), p_payment_method, v_shipping_fee, nullif(trim(coalesce(p_note,'')),''));

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

  UPDATE equipment_orders SET total_amount = v_total + v_shipping_fee WHERE id = v_order_id;
  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION create_equipment_order(UUID, JSONB, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_equipment_order(UUID, JSONB, TEXT, TEXT, TEXT, TEXT) TO service_role;
