BEGIN;

-- These SECURITY DEFINER RPCs trust actor IDs supplied by the backend. Never
-- expose them to direct browser/PostgREST calls, including older overloads.
DO $$
DECLARE
  routine REGPROCEDURE;
BEGIN
  FOR routine IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('create_order', 'cancel_order')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', routine);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', routine);
  END LOOP;
END $$;

-- Serialize inserts for the same order before checking for a repeated crop.
-- A trigger allows deployment even if older orders already contain duplicates.
CREATE OR REPLACE FUNCTION public.reject_duplicate_order_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.orders WHERE id = NEW.order_id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.order_items
    WHERE order_id = NEW.order_id AND round_item_id = NEW.round_item_id
  ) THEN
    RAISE EXCEPTION 'รายการผักในออเดอร์ต้องไม่ซ้ำกัน';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.reject_duplicate_order_item() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS reject_duplicate_order_item ON public.order_items;
CREATE TRIGGER reject_duplicate_order_item
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.reject_duplicate_order_item();

-- Keep historical completed/unpaid orders intact. Reject only new transitions
-- into that state, including a later payment reversal of a completed order.
CREATE OR REPLACE FUNCTION public.require_payment_before_completion()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status::text = 'completed' AND NEW.payment_status::text <> 'paid' THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'ต้องบันทึกว่าชำระเงินแล้วก่อนปิดออเดอร์เป็นสำเร็จ';
    ELSIF OLD.status::text IS DISTINCT FROM NEW.status::text
       OR OLD.payment_status::text IS DISTINCT FROM NEW.payment_status::text THEN
      RAISE EXCEPTION 'ต้องบันทึกว่าชำระเงินแล้วก่อนปิดออเดอร์เป็นสำเร็จ';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS require_payment_before_completion ON public.orders;
CREATE TRIGGER require_payment_before_completion
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.require_payment_before_completion();

DROP TRIGGER IF EXISTS require_payment_before_completion ON public.equipment_orders;
CREATE TRIGGER require_payment_before_completion
  BEFORE INSERT OR UPDATE ON public.equipment_orders
  FOR EACH ROW EXECUTE FUNCTION public.require_payment_before_completion();

NOTIFY pgrst, 'reload schema';
COMMIT;
