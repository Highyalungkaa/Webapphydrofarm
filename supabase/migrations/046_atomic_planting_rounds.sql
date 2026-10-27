BEGIN;

-- Serialize writers of allocation inputs, including older lifecycle/loss RPCs.
-- Use the same lock as farm/plot capacity guards (045). A rejected transaction
-- releases the lock and rolls back both the round and its items.
CREATE OR REPLACE FUNCTION public.lock_planting_allocation_inputs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(450001);
  RETURN NULL;
END $$;
DO $$ DECLARE tab TEXT; BEGIN
  FOREACH tab IN ARRAY ARRAY['crops','plots','planting_rounds','round_items'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS lock_planting_allocation_inputs ON public.%I',tab);
    EXECUTE format('CREATE TRIGGER lock_planting_allocation_inputs BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.lock_planting_allocation_inputs()',tab);
  END LOOP;
END $$;

-- Existing booking/loss/closure RPCs can lock round rows before their first write.
-- Acquire the common lock at their entry too, so they cannot hold a row while
-- waiting on a save that already holds the common lock. Preserve signatures,
-- ownership, privileges and the original business logic.
DO $$ DECLARE f RECORD; definition TEXT; patched TEXT; BEGIN
  FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname='public' AND l.lanname='plpgsql' AND p.provolatile='v' AND p.prorettype<>'trigger'::regtype
      AND p.prosrc ~* '\m(planting_rounds|round_items)\M' AND p.prosrc NOT LIKE '%pg_advisory_xact_lock(450001)%'
  LOOP
    SELECT pg_get_functiondef(f.oid) INTO definition;
    patched:=regexp_replace(definition,E'(\\nBEGIN[ \\t]*\\r?\\n)',E'\\1  PERFORM pg_advisory_xact_lock(450001);\n');
    IF patched=definition THEN RAISE EXCEPTION 'Cannot safely install planting lock in function %',f.oid::regprocedure; END IF;
    EXECUTE patched;
  END LOOP;
END $$;

-- One statement/snapshot supplies every input to the existing allocation solver,
-- including legacy rounds without placement snapshots. JSONB hashes avoid relying
-- on timestamps or PostgREST's row limit. Lists have deterministic tie breakers.
CREATE OR REPLACE FUNCTION public.read_planting_allocation_state()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH state AS (SELECT jsonb_build_object(
    'plots',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.zone_name,p.name,p.id) FROM public.plots p),'[]'::JSONB),
    'crops',COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.crops c),'[]'::JSONB),
    'rounds',COALESCE((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('round_items',
      COALESCE((SELECT jsonb_agg(to_jsonb(i)||jsonb_build_object('crops',to_jsonb(c)) ORDER BY i.created_at,i.id)
        FROM public.round_items i LEFT JOIN public.crops c ON c.id=i.crop_id WHERE i.round_id=r.id),'[]'::JSONB))
      ORDER BY r.created_at,r.id) FROM public.planting_rounds r),'[]'::JSONB)
  ) AS value)
  SELECT value||jsonb_build_object('token',md5(value::TEXT)) FROM state;
$$;

CREATE TABLE IF NOT EXISTS public.planting_round_requests(
  request_id UUID PRIMARY KEY,
  actor_id UUID NOT NULL,
  payload JSONB NOT NULL,
  round_id UUID NOT NULL REFERENCES public.planting_rounds(id) ON DELETE CASCADE
);
ALTER TABLE public.planting_round_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.planting_round_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.planting_round_requests TO service_role;

CREATE OR REPLACE FUNCTION public.find_planting_round_request(p_actor_id UUID,p_request_id UUID,p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE request public.planting_round_requests%ROWTYPE; result JSONB;
BEGIN
  SELECT * INTO request FROM public.planting_round_requests WHERE request_id=p_request_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF request.actor_id<>p_actor_id OR request.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'รหัสคำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว'; END IF;
  SELECT to_jsonb(r)||jsonb_build_object('round_items',COALESCE((SELECT jsonb_agg(i ORDER BY i.created_at,i.id) FROM public.round_items i WHERE i.round_id=r.id),'[]'::JSONB))
    INTO result FROM public.planting_rounds r WHERE r.id=request.round_id;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.save_planting_round(
  p_actor_id UUID,p_round_id UUID,p_round JSONB,p_items JSONB,
  p_state_token TEXT,p_request_id UUID DEFAULT NULL,p_request_payload JSONB DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor_email TEXT; old_round public.planting_rounds%ROWTYPE; r public.planting_rounds%ROWTYPE;
  item JSONB; old_item public.round_items%ROWTYPE; request public.planting_round_requests%ROWTYPE;
  result JSONB;
BEGIN
  SELECT u.email INTO actor_email FROM auth.users u JOIN public.admin_users a ON lower(a.email)=lower(u.email) WHERE u.id=p_actor_id;
  IF actor_email IS NULL THEN RAISE EXCEPTION 'ไม่มีสิทธิ์บันทึกรอบปลูก'; END IF;
  PERFORM pg_advisory_xact_lock(450001);
  IF p_round_id IS NULL AND p_request_id IS NOT NULL THEN
    SELECT * INTO request FROM public.planting_round_requests WHERE request_id=p_request_id;
    IF FOUND THEN
      IF request.actor_id<>p_actor_id OR request.payload IS DISTINCT FROM p_request_payload THEN RAISE EXCEPTION 'รหัสคำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว'; END IF;
      SELECT to_jsonb(pr)||jsonb_build_object('round_items',COALESCE((SELECT jsonb_agg(i ORDER BY i.created_at,i.id) FROM public.round_items i WHERE i.round_id=pr.id),'[]'::JSONB))
        INTO result FROM public.planting_rounds pr WHERE pr.id=request.round_id;
      RETURN result;
    END IF;
  END IF;
  IF p_state_token IS NULL OR p_state_token IS DISTINCT FROM (public.read_planting_allocation_state()->>'token') THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='ข้อมูลพื้นที่แปลงหรือรอบปลูกเปลี่ยนแล้ว กรุณาตรวจสอบพื้นที่ล่าสุดแล้วลองบันทึกอีกครั้ง';
  END IF;
  IF p_round IS NULL OR jsonb_typeof(p_round)<>'object' OR p_items IS NULL OR jsonb_typeof(p_items)<>'array' THEN RAISE EXCEPTION 'ข้อมูลรอบและรายการผักไม่ถูกต้อง'; END IF;
  IF (SELECT count(DISTINCT value->>'crop_id') FROM jsonb_array_elements(p_items))<>jsonb_array_length(p_items) THEN RAISE EXCEPTION 'ชนิดผักในรอบต้องไม่ซ้ำกัน'; END IF;
  IF p_round_id IS NULL THEN
    r:=jsonb_populate_record(NULL::public.planting_rounds,p_round);
    INSERT INTO public.planting_rounds(name,status,current_step,seed_date,fertilizing_date,planting_start_date,transplant_date,harvest_sale_date,sold_out_date,completed_date,
      planted_at,growing_days,expected_harvest_date,booking_opens_at,booking_closes_at,fulfillment_date,delivery_start_time,delivery_end_time,notes)
    VALUES(r.name,'draft',1,r.seed_date,NULL,NULL,NULL,NULL,NULL,NULL,r.planted_at,r.growing_days,r.expected_harvest_date,r.booking_opens_at,NULL,r.fulfillment_date,r.delivery_start_time,r.delivery_end_time,r.notes)
    RETURNING * INTO r;
  ELSE
    SELECT * INTO old_round FROM public.planting_rounds WHERE id=p_round_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบรอบปลูก'; END IF;
    IF old_round.status::TEXT IN('completed','cancelled') THEN RAISE EXCEPTION 'รอบนี้สิ้นสุดแล้ว ไม่สามารถเปลี่ยนรายการปลูกได้'; END IF;
    r:=jsonb_populate_record(old_round,p_round);
    UPDATE public.planting_rounds SET name=r.name,planted_at=r.planted_at,growing_days=r.growing_days,expected_harvest_date=r.expected_harvest_date,
      booking_opens_at=r.booking_opens_at,fulfillment_date=r.fulfillment_date,delivery_start_time=r.delivery_start_time,delivery_end_time=r.delivery_end_time,
      status=r.status,current_step=r.current_step,seed_date=r.seed_date,fertilizing_date=r.fertilizing_date,planting_start_date=r.planting_start_date,
      transplant_date=r.transplant_date,harvest_sale_date=r.harvest_sale_date,sold_out_date=r.sold_out_date,completed_date=r.completed_date,notes=r.notes,updated_at=clock_timestamp()
      WHERE id=p_round_id RETURNING * INTO r;
    IF EXISTS(SELECT 1 FROM public.round_items i WHERE i.round_id=r.id AND NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(p_items) j WHERE (j->>'id')::UUID=i.id)) THEN RAISE EXCEPTION 'รายการผักเดิมต้องครบทุกชนิด ไม่สามารถลบทิ้งผ่านการแก้ไขได้'; END IF;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF item->>'id' IS NOT NULL THEN
      SELECT * INTO old_item FROM public.round_items WHERE id=(item->>'id')::UUID AND round_id=r.id FOR UPDATE;
      IF NOT FOUND OR old_item.crop_id<>(item->>'crop_id')::UUID THEN RAISE EXCEPTION 'รายการผักไม่ได้อยู่ในรอบนี้หรือเปลี่ยนชนิดผักเดิมไม่ได้'; END IF;
      IF old_item.loss_baseline_plant_count IS NOT NULL AND old_item.plant_count IS DISTINCT FROM (item->>'plant_count')::INTEGER THEN RAISE EXCEPTION 'ผักที่มีประวัติสูญเสียแล้วไม่สามารถเปลี่ยนจำนวนปลูกเริ่มต้นได้'; END IF;
      UPDATE public.round_items SET plant_count=(item->>'plant_count')::INTEGER,price_per_kg=(item->>'price_per_kg')::NUMERIC,
        max_qty_per_order_kg=(item->>'max_qty_per_order_kg')::NUMERIC,
        plot_ids=ARRAY(SELECT value::UUID FROM jsonb_array_elements_text(COALESCE(item->'plot_ids','[]'::JSONB))) WHERE id=old_item.id;
    ELSE
      IF COALESCE((item->>'plant_count')::INTEGER,0)<1 THEN RAISE EXCEPTION 'กรุณาระบุจำนวนต้นที่ปลูกมากกว่า 0'; END IF;
      INSERT INTO public.round_items(round_id,crop_id,plant_count,estimated_qty_kg,bookable_qty_kg,price_per_kg,max_qty_per_order_kg,plot_ids)
      VALUES(r.id,(item->>'crop_id')::UUID,(item->>'plant_count')::INTEGER,0,0,(item->>'price_per_kg')::NUMERIC,(item->>'max_qty_per_order_kg')::NUMERIC,
        ARRAY(SELECT value::UUID FROM jsonb_array_elements_text(COALESCE(item->'plot_ids','[]'::JSONB))));
    END IF;
  END LOOP;
  SELECT to_jsonb(r)||jsonb_build_object('round_items',COALESCE(jsonb_agg(i ORDER BY i.created_at,i.id),'[]'::JSONB)) INTO result FROM public.round_items i WHERE i.round_id=r.id;
  INSERT INTO public.audit_logs(actor_id,actor_email,entity_type,entity_id,action,old_data,new_data)
    VALUES(p_actor_id,actor_email,'planting_rounds',r.id::TEXT,CASE WHEN p_round_id IS NULL THEN 'create' ELSE 'update' END,
      CASE WHEN p_round_id IS NULL THEN NULL ELSE to_jsonb(old_round) END,result);
  IF p_round_id IS NULL AND p_request_id IS NOT NULL THEN INSERT INTO public.planting_round_requests VALUES(p_request_id,p_actor_id,p_request_payload,r.id); END IF;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.lock_planting_allocation_inputs(),public.read_planting_allocation_state(),public.find_planting_round_request(UUID,UUID,JSONB),public.save_planting_round(UUID,UUID,JSONB,JSONB,TEXT,UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_planting_allocation_state(),public.find_planting_round_request(UUID,UUID,JSONB),public.save_planting_round(UUID,UUID,JSONB,JSONB,TEXT,UUID,JSONB) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
