-- Remove pickup hours; customers still choose pickup or delivery.
-- Apply together with the application update. Historical migrations remain unchanged.
BEGIN;

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
    v_now TIMESTAMPTZ := now();
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

            -- With no pickup hours, deadlines count back from the delivery date
            -- at 00:00 in Bangkok, independent of the database session timezone.
            v_harvest_datetime := v_round.fulfillment_date::timestamp AT TIME ZONE 'Asia/Bangkok';

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

ALTER TABLE public.planting_rounds
  DROP COLUMN IF EXISTS pickup_start_time,
  DROP COLUMN IF EXISTS pickup_end_time;

COMMIT;
