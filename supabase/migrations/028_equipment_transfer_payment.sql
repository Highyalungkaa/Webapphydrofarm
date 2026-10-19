-- Transfer payments include a private receipt and await manual payment verification.
BEGIN;
ALTER TABLE public.equipment_orders
  ADD COLUMN IF NOT EXISTS payment_slip_path TEXT,
  ADD COLUMN IF NOT EXISTS payment_slip_uploaded_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_equipment_orders_payment_slip ON public.equipment_orders(payment_slip_path) WHERE payment_slip_path IS NOT NULL;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('equipment-payment-slips', 'equipment-payment-slips', false, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
-- Merchant QR is public; customer receipts remain private.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('equipment-payment-qr', 'equipment-payment-qr', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
-- Uploads and signed receipt downloads go through authenticated backend routes only.
DROP FUNCTION IF EXISTS public.create_equipment_order(UUID, JSONB, TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION create_equipment_order(
  p_customer_id UUID, p_items JSONB, p_shipping_address TEXT, p_contact_phone TEXT,
  p_payment_method TEXT, p_note TEXT DEFAULT NULL, p_payment_slip_path TEXT DEFAULT NULL
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
  IF p_payment_method IS NULL OR p_payment_method NOT IN ('cash_on_delivery', 'transfer') THEN
    RAISE EXCEPTION 'วิธีชำระเงินไม่ถูกต้อง';
  END IF;
  IF p_payment_method = 'transfer' THEN
    IF NOT EXISTS (
      SELECT 1 FROM app_settings WHERE key = 'equipment_transfer_account'
      AND (length(trim(coalesce(value->>'account_number',''))) > 0
        OR length(trim(coalesce(value->>'qr_image_url',''))) > 0)
    ) THEN RAISE EXCEPTION 'ร้านยังไม่ได้ตั้งค่าบัญชีรับโอน กรุณาเลือกเก็บเงินปลายทาง'; END IF;
    IF p_payment_slip_path IS NULL OR split_part(p_payment_slip_path, '/', 1) <> p_customer_id::text
      OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'equipment-payment-slips' AND name = p_payment_slip_path)
    THEN RAISE EXCEPTION 'กรุณาแนบสลิปการโอนเงินที่ถูกต้อง'; END IF;
  END IF;

  SELECT (value #>> '{}')::NUMERIC(12,2) INTO v_shipping_fee FROM app_settings WHERE key = 'equipment_shipping_fee';
  v_shipping_fee := coalesce(v_shipping_fee, 0);

  INSERT INTO equipment_orders (id, customer_id, shipping_address, contact_phone, payment_method, shipping_fee, note, payment_slip_path, payment_slip_uploaded_at)
  VALUES (v_order_id, p_customer_id, trim(p_shipping_address), trim(p_contact_phone), p_payment_method, v_shipping_fee, nullif(trim(coalesce(p_note,'')),''), CASE WHEN p_payment_method = 'transfer' THEN p_payment_slip_path END, CASE WHEN p_payment_method = 'transfer' THEN now() END);

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
REVOKE ALL ON FUNCTION create_equipment_order(UUID, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_equipment_order(UUID, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
