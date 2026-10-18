-- New vegetable orders must wait for an explicit admin confirmation.
CREATE OR REPLACE FUNCTION public.require_admin_order_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.status := 'pending_confirmation';
  NEW.requires_confirmation := TRUE;
  NEW.confirmed_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_require_admin_confirmation ON public.orders;
CREATE TRIGGER orders_require_admin_confirmation
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.require_admin_order_confirmation();
