-- Migration 002: PostgreSQL Functions, Triggers, and Stored Procedures

-- 1. Helper function: check if an email or authenticated user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT;
BEGIN
    -- Extract email from Supabase auth JWT
    v_email := NULLIF(current_setting('request.jwt.claim.email', true), '');
    IF v_email IS NULL THEN
        -- Fallback to auth.users if request.jwt.claim.email is not set
        SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
    END IF;

    IF v_email IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM admin_users WHERE LOWER(admin_users.email) = LOWER(v_email)
    );
END;
$$;

-- 2. Trigger to automatically create a profile when a new user signs up via Google OAuth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name',
            split_part(NEW.email, '@', 1)
        ),
        timezone('Asia/Bangkok'::text, now()),
        timezone('Asia/Bangkok'::text, now())
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(profiles.full_name, EXCLUDED.full_name),
        updated_at = timezone('Asia/Bangkok'::text, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Stored Procedure: create_order (Transaction with row-level locking to prevent overselling)
CREATE OR REPLACE FUNCTION create_order(
    p_round_id UUID,
    p_customer_id UUID,
    p_items JSONB,
    p_fulfillment_method fulfillment_method,
    p_delivery_address TEXT,
    p_district_id UUID,
    p_contact_phone VARCHAR,
    p_note TEXT,
    p_accepted_terms BOOLEAN
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

    -- 6. Validate Delivery Fulfillment
    IF p_fulfillment_method = 'delivery' THEN
        IF p_district_id IS NULL THEN
            RAISE EXCEPTION 'กรุณาเลือกอำเภอ/ตำบลสำหรับการจัดส่ง';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM districts WHERE id = p_district_id AND is_active = TRUE) THEN
            RAISE EXCEPTION 'อำเภอ/ตำบลที่เลือกไม่เปิดให้บริการจัดส่ง';
        END IF;

        IF p_delivery_address IS NULL OR trim(p_delivery_address) = '' THEN
            RAISE EXCEPTION 'กรุณาระบุที่อยู่สำหรับการจัดส่งให้ครบถ้วน';
        END IF;

        IF v_delivery_min_kg > 0 AND v_total_kg < v_delivery_min_kg THEN
            RAISE EXCEPTION 'ยอดสั่งซื้อรวมต้องไม่ต่ำกว่า % กก. สำหรับบริการจัดส่ง (ยอดปัจจุบัน % กก.)', v_delivery_min_kg, v_total_kg;
        END IF;
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
        CASE WHEN p_fulfillment_method = 'delivery' THEN p_delivery_address ELSE NULL END,
        CASE WHEN p_fulfillment_method = 'delivery' THEN p_district_id ELSE NULL END,
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

    -- 11. Insert Order Items (with snapshotted price_per_kg)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_id := (v_item->>'round_item_id')::uuid;
        v_item_qty := (v_item->>'qty_kg')::numeric;

        SELECT price_per_kg INTO v_round_item
        FROM round_items
        WHERE id = v_item_id;

        INSERT INTO order_items (
            order_id,
            round_item_id,
            qty_kg,
            price_per_kg,
            created_at
        ) VALUES (
            v_order_id,
            v_item_id,
            v_item_qty,
            v_round_item.price_per_kg,
            v_now
        );
    END LOOP;

    -- Return JSON summary
    SELECT jsonb_build_object(
        'order_id', v_order_id,
        'round_id', p_round_id,
        'total_amount', v_total_amount,
        'total_kg', v_total_kg,
        'status', v_initial_status,
        'requires_confirmation', v_requires_confirmation,
        'created_at', v_now
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 4. Stored Procedure: cancel_order
CREATE OR REPLACE FUNCTION cancel_order(
    p_order_id UUID,
    p_actor_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_round RECORD;
    v_is_admin BOOLEAN := FALSE;
    v_deadline_hours NUMERIC := 24;
    v_harvest_datetime TIMESTAMPTZ;
    v_now TIMESTAMPTZ := timezone('Asia/Bangkok'::text, now());
BEGIN
    SELECT * INTO v_order FROM orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ไม่พบคำสั่งจองรหัส %', p_order_id;
    END IF;

    IF v_order.status = 'cancelled' THEN
        RAISE EXCEPTION 'คำสั่งจองนี้ถูกยกเลิกไปแล้ว';
    END IF;

    IF v_order.status = 'completed' THEN
        RAISE EXCEPTION 'ไม่สามารถยกเลิกคำสั่งจองที่รับของเสร็จสิ้นแล้วได้';
    END IF;

    -- Check if actor is admin
    v_is_admin := is_admin();

    SELECT * INTO v_round FROM planting_rounds WHERE id = v_order.round_id;

    -- Customer authorization and cancellation deadline check
    IF NOT v_is_admin THEN
        IF v_order.customer_id != p_actor_id THEN
            RAISE EXCEPTION 'คุณไม่มีสิทธิ์ยกเลิกคำสั่งจองของผู้อื่น';
        END IF;

        -- If round was rescheduled (needs_customer_notice = true), customer can cancel without penalty
        IF NOT v_order.needs_customer_notice THEN
            SELECT COALESCE((value->>'value')::numeric, (value)::numeric, 24) INTO v_deadline_hours
            FROM app_settings WHERE key = 'cancellation_deadline_hours_before_harvest';

            -- Calculate harvest datetime: fulfillment_date + pickup_start_time
            v_harvest_datetime := (v_round.fulfillment_date::text || ' ' || v_round.pickup_start_time::text)::timestamptz;

            IF v_now > (v_harvest_datetime - (v_deadline_hours || ' hours')::interval) THEN
                RAISE EXCEPTION 'เลยกำหนดเวลายกเลิกคำสั่งจองแล้ว (ต้องยกเลิกก่อนเวลาส่งมอบอย่างน้อย % ชั่วโมง) กรุณาติดต่อแอดมินฟาร์ม', v_deadline_hours;
            END IF;
        END IF;
    END IF;

    -- Perform cancellation
    UPDATE orders
    SET status = 'cancelled',
        cancelled_at = v_now,
        cancel_reason = COALESCE(p_reason, CASE WHEN v_order.needs_customer_notice THEN 'round_rescheduled' ELSE 'customer_cancelled' END),
        updated_at = v_now
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'order_id', p_order_id,
        'status', 'cancelled',
        'cancelled_at', v_now
    );
END;
$$;
