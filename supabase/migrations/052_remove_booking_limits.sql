-- Retire configurable purchase caps and order quotas. Physical stock, booking
-- windows, payment and minimum quantity checks remain enforced by their own rules.
BEGIN;
CREATE OR REPLACE FUNCTION public.clear_retired_booking_limits() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  NEW.order_limit_remaining:=NULL;
  IF TG_TABLE_NAME='planting_rounds' THEN NEW.purchase_limit_enabled:=false;
  ELSE NEW.max_qty_per_order_kg:=NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS clear_retired_booking_limits ON public.planting_rounds;
CREATE TRIGGER clear_retired_booking_limits BEFORE INSERT OR UPDATE ON public.planting_rounds
FOR EACH ROW EXECUTE FUNCTION public.clear_retired_booking_limits();
DROP TRIGGER IF EXISTS clear_retired_booking_limits ON public.round_items;
CREATE TRIGGER clear_retired_booking_limits BEFORE INSERT OR UPDATE ON public.round_items
FOR EACH ROW EXECUTE FUNCTION public.clear_retired_booking_limits();

UPDATE public.planting_rounds SET purchase_limit_enabled=false,order_limit_remaining=NULL
WHERE purchase_limit_enabled OR order_limit_remaining IS NOT NULL;
UPDATE public.round_items SET max_qty_per_order_kg=NULL,order_limit_remaining=NULL
WHERE max_qty_per_order_kg IS NOT NULL OR order_limit_remaining IS NOT NULL;

DROP TRIGGER IF EXISTS enforce_round_order_limit ON public.orders;
DROP TRIGGER IF EXISTS consume_round_item_order_limit ON public.order_items;
DROP TRIGGER IF EXISTS restore_round_item_order_limits ON public.orders;
DROP TRIGGER IF EXISTS consume_extra_round_quota ON public.order_items;
DROP TRIGGER IF EXISTS restore_removed_item_quota ON public.order_items;
-- Keep restore_pooled_stock: it also checks real stock when reopening an order.
REVOKE ALL ON FUNCTION public.set_round_purchase_limits(UUID,UUID,BOOLEAN,JSONB),
  public.set_round_order_limit(UUID,UUID,INTEGER),public.set_round_item_order_limits(UUID,UUID,JSONB)
FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.clear_retired_booking_limits() FROM PUBLIC,anon,authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';
