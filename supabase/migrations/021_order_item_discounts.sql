-- Allow admins to apply a fixed-amount discount to individual vegetable order items.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
  CHECK (discount_amount >= 0);

CREATE OR REPLACE FUNCTION public.apply_order_item_discounts(
  p_order_id UUID,
  p_discounts JSONB
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_discount NUMERIC(12, 2);
  v_item_count INTEGER;
  v_input_count INTEGER;
  v_processed_count INTEGER := 0;
  v_total NUMERIC(12, 2);
BEGIN
  IF jsonb_typeof(p_discounts) <> 'array' THEN
    RAISE EXCEPTION 'รายการส่วนลดไม่ถูกต้อง';
  END IF;

  SELECT COUNT(*) INTO v_item_count
  FROM public.order_items
  WHERE order_id = p_order_id;

  SELECT COUNT(*) INTO v_input_count
  FROM jsonb_array_elements(p_discounts);

  IF v_input_count <> v_item_count OR (
    SELECT COUNT(DISTINCT value->>'id') FROM jsonb_array_elements(p_discounts)
  ) <> v_item_count THEN
    RAISE EXCEPTION 'กรุณาระบุส่วนลดให้ครบทุกรายการ';
  END IF;

  FOR v_item IN
    SELECT oi.id, oi.qty_kg, oi.price_per_kg,
           (d.value->>'discount_amount')::NUMERIC(12, 2) AS discount_amount
    FROM jsonb_array_elements(p_discounts) AS d(value)
    JOIN public.order_items oi
      ON oi.id = (d.value->>'id')::UUID
     AND oi.order_id = p_order_id
  LOOP
    v_discount := COALESCE(v_item.discount_amount, 0);
    IF v_discount < 0 OR v_discount > v_item.qty_kg * v_item.price_per_kg THEN
      RAISE EXCEPTION 'ส่วนลดต้องไม่เกินยอดรวมของรายการผัก';
    END IF;

    UPDATE public.order_items
    SET discount_amount = v_discount
    WHERE id = v_item.id;
    v_processed_count := v_processed_count + 1;
  END LOOP;

  IF v_processed_count <> v_item_count THEN
    RAISE EXCEPTION 'รายการส่วนลดไม่ตรงกับรายการสินค้าในออเดอร์';
  END IF;

  SELECT COALESCE(SUM(GREATEST(0, qty_kg * price_per_kg - discount_amount)), 0)
  INTO v_total
  FROM public.order_items
  WHERE order_id = p_order_id;

  UPDATE public.orders
  SET total_amount = v_total,
      updated_at = NOW()
  WHERE id = p_order_id;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_order_item_discounts(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_item_discounts(UUID, JSONB) TO service_role;
