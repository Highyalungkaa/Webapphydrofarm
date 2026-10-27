BEGIN;
-- All customer writes already use authenticated API routes and service-only RPCs.
-- RLS row ownership alone must not allow a browser to edit payment or no-show fields.
REVOKE INSERT,UPDATE,DELETE ON public.orders,public.order_items,public.profiles FROM PUBLIC,anon,authenticated;
GRANT INSERT,UPDATE,DELETE ON public.orders,public.order_items,public.profiles TO service_role;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS no_show_recorded_at TIMESTAMPTZ;
UPDATE public.orders o SET no_show_recorded_at=COALESCE(o.updated_at,o.created_at,now())
  WHERE o.no_show_recorded_at IS NULL AND (o.status::TEXT='no_show' OR EXISTS(
    SELECT 1 FROM public.audit_logs a WHERE a.entity_type='orders' AND a.entity_id=o.id::TEXT
      AND (a.new_data->>'status'='no_show' OR a.new_data->'order'->>'status'='no_show')));

CREATE OR REPLACE FUNCTION public.record_order_no_show_once()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status::TEXT='no_show' AND OLD.no_show_recorded_at IS NULL THEN
    UPDATE public.profiles SET no_show_count=COALESCE(no_show_count,0)+1,updated_at=now() WHERE id=NEW.customer_id;
    NEW.no_show_recorded_at:=now();
  ELSE NEW.no_show_recorded_at:=OLD.no_show_recorded_at; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS record_order_no_show_once ON public.orders;
CREATE TRIGGER record_order_no_show_once BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.record_order_no_show_once();
REVOKE ALL ON FUNCTION public.record_order_no_show_once() FROM PUBLIC,anon,authenticated;

-- The allocation RPC previously counted separately; one trigger now owns this rule.
DO $$ DECLARE definition TEXT;
BEGIN
  IF to_regprocedure('public.save_admin_order_allocation(uuid,uuid,jsonb)') IS NOT NULL THEN
    SELECT pg_get_functiondef('public.save_admin_order_allocation(uuid,uuid,jsonb)'::regprocedure) INTO definition;
    definition:=regexp_replace(definition,'  IF updated.status::TEXT=''no_show''[\s\S]*?END IF;','');
    EXECUTE definition;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.serialize_admin_removal()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(430001);
  RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.keep_one_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF (SELECT count(*) FROM public.admin_users)<=1 THEN RAISE EXCEPTION 'ต้องมีผู้ดูแลระบบอย่างน้อย 1 บัญชี ไม่สามารถลบได้'; END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS serialize_admin_removal ON public.admin_users;
CREATE TRIGGER serialize_admin_removal BEFORE DELETE ON public.admin_users FOR EACH STATEMENT EXECUTE FUNCTION public.serialize_admin_removal();
DROP TRIGGER IF EXISTS keep_one_admin ON public.admin_users;
CREATE TRIGGER keep_one_admin BEFORE DELETE ON public.admin_users FOR EACH ROW EXECUTE FUNCTION public.keep_one_admin();
REVOKE ALL ON FUNCTION public.serialize_admin_removal(),public.keep_one_admin() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
