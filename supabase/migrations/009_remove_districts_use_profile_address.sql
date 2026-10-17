-- Migration: 005_remove_districts_use_profile_address.sql
-- Description: Remove district requirement for delivery orders and fallback to customer profile address

-- 1. Make district_id optional in orders if not already
ALTER TABLE orders ALTER COLUMN district_id DROP NOT NULL;

-- 2. Update create_order stored procedure
CREATE OR REPLACE FUNCTION create_order(
    p_round_id UUID,
    p_customer_id UUID,
    p_items JSONB,
    p_fulfillment_method fulfillment_method,
    p_delivery_address TEXT DEFAULT NULL,
    p_district_id UUID DEFAULT NULL,
    p_contact_phone VARCHAR DEFAULT NULL,
    p_note TEXT DEFAULT NULL,
    p_accepted_terms BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_round RECORD;
    v_profile RECORD;
    v_now TIMESTAMPTZ := timezone('Asia/Bangkok'::text, now());
    v_no_show_limit INTEGER := 0;
    v_delivery_min_kg NUMERIC := 0;
    v_large_threshold_kg NUMERIC := 10;
    v_total_kg NUMERIC := 0;
    v_total_amount NUMERIC := 0;
    v_requires_confirmation BOOLEAN := FALSE;
    v_initial_status order_status := 'confirmed';
    v_order_id UUID;
    v_item JSONB;
    v_round_item RECORD;
    v_crop RECORD;
    v_booked_kg NUMERIC;
    v_available_kg NUMERIC;
    v_item_qty NUMERIC;
    v_item_id UUID;
    v_item_ids UUID[] := ARRAY[]::UUID[];
    v_result JSONB;
    v_final_delivery_address TEXT;
BEGIN
    -- 1. Check accepted substitution terms
    IF NOT p_accepted_terms THEN
        RAISE EXCEPTION 'กรุณายอมรับเงื่อนไขการทดแทนผักหากผลผลิตไม่เพียงพอก่อนทำการจอง';
    END IF;

    -- 2. Verify customer profile
    SELECT * INTO v_profile FROM profiles WHERE id = p_customer_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบข้อมูลโปรไฟล์ลูกค้า';
    END IF;

    -- 3. Check App Settings
    SELECT COALESCE((value->>'value')::numeric, (value)::numeric, 0) INTO v_no_show_limit
    FROM app_settings WHERE key = 'no_show_limit';

    IF v_no_show_limit > 0 AND v_profile.no_show_count >= v_no_show_limit THEN
        RAISE EXCEPTION 'คุณมียอดไม่มารับของสะสมถึงกำหนด (% ครั้ง) จึงไม่สามารถจองรอบใหม่ได้ กรุณาติดต่อฟาร์ม', v_no_show_limit;
    END IF;

    SELECT COALESCE((value->>'value')::numeric, (value)::numeric, 0) INTO v_delivery_min_kg
    FROM app_settings WHERE key = 'delivery_min_total_kg';

    SELECT COALESCE((value->>'value')::numeric, (value)::numeric, 10) INTO v_large_threshold_kg
    FROM app_settings WHERE key = 'large_order_threshold_kg';

    -- 4. Verify Round & Booking Window
    SELECT * INTO v_round FROM planting_rounds WHERE id = p_round_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบข้อมูลรอบการปลูกที่ระบุ';
    END IF;

    IF v_round.status != 'booking_open' THEN
        RAISE EXCEPTION 'รอบการปลูกนี้ยังไม่เปิดให้จอง หรือปิดรับการจองแล้ว (สถานะ: %)', v_round.status;
    END IF;

    IF v_round.booking_opens_at IS NOT NULL AND now() < v_round.booking_opens_at THEN
        RAISE EXCEPTION 'รอบการปลูกนี้จะเริ่มเปิดจองเมื่อ %', v_round.booking_opens_at;
    END IF;

    IF v_round.booking_closes_at IS NOT NULL AND now() > v_round.booking_closes_at THEN
        RAISE EXCEPTION 'รอบการปลูกนี้ปิดรับการจองไปแล้วเมื่อ %', v_round.booking_closes_at;
    END IF;

    -- 5. Validate items array
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'กรุณาเลือกรายการผักที่ต้องการจองอย่างน้อย 1 รายการ';
    END IF;

    -- Calculate total weight and collect item IDs
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_qty := (v_item->>'qty_kg')::numeric;
        IF v_item_qty < 0.5 THEN
            RAISE EXCEPTION 'จำนวนผักแต่ละรายการต้องไม่ต่ำกว่า 0.5 กก.';
        END IF;
        v_total_kg := v_total_kg + v_item_qty;
        v_item_ids := array_append(v_item_ids, (v_item->>'round_item_id')::uuid);
    END LOOP;

    -- 6. Validate Delivery Fulfillment (Use provided address or fallback to profile address)
    IF p_fulfillment_method = 'delivery' THEN
        v_final_delivery_address := NULLIF(trim(p_delivery_address), '');
        
        -- Fallback to profile address if not provided in order
        IF v_final_delivery_address IS NULL THEN
            v_final_delivery_address := NULLIF(trim(v_profile.address_detail), '');
        END IF;

        IF v_final_delivery_address IS NULL THEN
            RAISE EXCEPTION 'กรุณาระบุที่อยู่สำหรับการจัดส่ง หรือบันทึกที่อยู่ในหน้าข้อมูลส่วนตัว';
        END IF;

        IF v_delivery_min_kg > 0 AND v_total_kg < v_delivery_min_kg THEN
            RAISE EXCEPTION 'ยอดสั่งซื้อรวมต้องไม่ต่ำกว่า % กก. สำหรับบริการจัดส่ง (ยอดปัจจุบัน % กก.)', v_delivery_min_kg, v_total_kg;
        END IF;
    ELSE
        v_final_delivery_address := NULL;
    END IF;

    -- Phone number is required
    IF p_contact_phone IS NULL OR trim(p_contact_phone) = '' THEN
        RAISE EXCEPTION 'กรุณาระบุเบอร์โทรศัพท์ติดต่อ';
    END IF;

    -- 7. Check Large Order Threshold
    IF v_total_kg >= v_large_threshold_kg THEN
        v_requires_confirmation := TRUE;
        v_initial_status := 'pending_confirmation';
    ELSE
        v_requires_confirmation := FALSE;
        v_initial_status := 'confirmed';
    END IF;

    -- 8. Lock round items using SELECT ... FOR UPDATE to prevent race conditions
    PERFORM 1 FROM round_items
    WHERE id = ANY(v_item_ids) AND round_id = p_round_id
    FOR UPDATE;

    -- 9. Check stock availability and limits for each item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_id := (v_item->>'round_item_id')::uuid;
        v_item_qty := (v_item->>'qty_kg')::numeric;

        SELECT ri.*, c.name as crop_name INTO v_round_item
        FROM round_items ri
        JOIN crops c ON c.id = ri.crop_id
        WHERE ri.id = v_item_id AND ri.round_id = p_round_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'ไม่พบรายการผักรหัส % ในรอบนี้', v_item_id;
        END IF;

        -- Check max_qty_per_order_kg
        IF v_round_item.max_qty_per_order_kg IS NOT NULL AND v_item_qty > v_round_item.max_qty_per_order_kg THEN
            RAISE EXCEPTION 'ผัก % สามารถจองได้สูงสุดไม่เกิน % กก. ต่อออเดอร์', v_round_item.crop_name, v_round_item.max_qty_per_order_kg;
        END IF;

        -- Check remaining bookable stock
        SELECT COALESCE(SUM(oi.qty_kg), 0) INTO v_booked_kg
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.round_item_id = v_item_id
          AND o.status != 'cancelled';

        v_available_kg := v_round_item.bookable_qty_kg - v_booked_kg;

        IF v_item_qty > v_available_kg THEN
            RAISE EXCEPTION 'ผัก % คงเหลือให้จองเพียง % กก. (คุณต้องการ % กก.)', v_round_item.crop_name, GREATEST(v_available_kg, 0), v_item_qty;
        END IF;

        v_total_amount := v_total_amount + (v_item_qty * v_round_item.price_per_kg);
    END LOOP;

    -- 10. Insert Order
    INSERT INTO orders (
        round_id,
        customer_id,
        fulfillment_method,
        delivery_address,
        district_id,
        contact_phone,
        note,
        status,
        requires_confirmation,
        confirmed_at,
        payment_status,
        total_amount,
        accepted_substitution_terms_at,
        created_at,
        updated_at
    ) VALUES (
        p_round_id,
        p_customer_id,
        p_fulfillment_method,
        v_final_delivery_address,
        p_district_id,
        p_contact_phone,
        p_note,
        v_initial_status,
        v_requires_confirmation,
        CASE WHEN v_initial_status = 'confirmed' THEN v_now ELSE NULL END,
        'unpaid',
        v_total_amount,
        v_now,
        v_now,
        v_now
    ) RETURNING id INTO v_order_id;

    -- 11. Insert Order Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_id := (v_item->>'round_item_id')::uuid;
        v_item_qty := (v_item->>'qty_kg')::numeric;

        SELECT price_per_kg INTO v_round_item FROM round_items WHERE id = v_item_id;

        INSERT INTO order_items (
            order_id,
            round_item_id,
            qty_kg,
            price_per_kg,
            fulfillment_source,
            created_at
        ) VALUES (
            v_order_id,
            v_item_id,
            v_item_qty,
            v_round_item.price_per_kg,
            'own',
            v_now
        );
    END LOOP;

    -- Return created order summary
    SELECT jsonb_build_object(
        'order_id', v_order_id,
        'status', v_initial_status,
        'requires_confirmation', v_requires_confirmation,
        'total_amount', v_total_amount,
        'total_kg', v_total_kg
    ) INTO v_result;

    RETURN v_result;
END;
$$;
