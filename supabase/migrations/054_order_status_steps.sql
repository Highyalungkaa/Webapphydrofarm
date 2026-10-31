BEGIN;
CREATE OR REPLACE FUNCTION public.guard_order_status_steps() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE old_step INTEGER; new_step INTEGER;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  old_step:=array_position(ARRAY['pending_confirmation','confirmed','ready','completed'],OLD.status::TEXT);
  new_step:=array_position(ARRAY['pending_confirmation','confirmed','ready','completed'],NEW.status::TEXT);
  IF old_step IS NOT NULL AND new_step IS NOT NULL THEN
    IF abs(new_step-old_step)<>1 THEN RAISE EXCEPTION 'กรุณาเปลี่ยนสถานะออเดอร์ทีละขั้น ไม่สามารถข้ามขั้นตอนได้'; END IF;
  ELSIF NEW.status::TEXT='cancelled' AND old_step BETWEEN 1 AND 3 THEN NULL;
  ELSIF NEW.status::TEXT='no_show' AND OLD.status::TEXT='ready' THEN NULL;
  ELSE RAISE EXCEPTION 'ไม่สามารถเปลี่ยนสถานะนี้ได้ ออเดอร์ที่ยกเลิกหรือไม่มารับไม่สามารถเปิดกลับด้วยการเปลี่ยนขั้นตอน';
  END IF;
  IF NEW.status::TEXT='pending_confirmation' THEN NEW.confirmed_at:=NULL; NEW.requires_confirmation:=true; END IF;
  IF OLD.status::TEXT='pending_confirmation' AND NEW.status::TEXT='confirmed' THEN NEW.confirmed_at:=clock_timestamp(); END IF;
  IF OLD.status::TEXT='completed' THEN NEW.completed_at:=NULL; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_order_status_steps ON public.orders;
CREATE TRIGGER guard_order_status_steps BEFORE UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.guard_order_status_steps();
REVOKE ALL ON FUNCTION public.guard_order_status_steps() FROM PUBLIC,anon,authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';
