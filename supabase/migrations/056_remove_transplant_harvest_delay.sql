BEGIN;
-- Supersedes 055: actual transplant dates are records, not harvest-date offsets.
CREATE OR REPLACE FUNCTION public.booking_harvest_date(p_round_id UUID,p_crop_id UUID)
RETURNS DATE LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE r RECORD; days INTEGER; metadata JSONB; calculated DATE;
BEGIN
  SELECT * INTO r FROM public.planting_rounds WHERE id=p_round_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  BEGIN metadata:=r.notes::JSONB; EXCEPTION WHEN OTHERS THEN metadata:='{}'::JSONB; END;
  BEGIN days:=NULLIF(metadata->'cropGrowingDays'->>p_crop_id::TEXT,'')::INTEGER; EXCEPTION WHEN OTHERS THEN days:=NULL; END;
  days:=COALESCE(NULLIF(days,0),(SELECT NULLIF(c.growing_days,0) FROM public.crops c WHERE c.id=p_crop_id),NULLIF(r.growing_days,0),45);
  IF metadata->>'harvestDateBasis' IN ('seed','seed_with_transplant_delay') AND r.seed_date IS NOT NULL THEN
    calculated:=r.seed_date+days;
  ELSE
    calculated:=r.transplant_date+days;
  END IF;
  RETURN COALESCE(r.harvest_sale_date,calculated,r.expected_harvest_date,r.fulfillment_date);
END $$;

-- Correct only automatically shifted schedules in unfinished rounds.
-- Keep recorded harvest dates, manual schedules and existing order promises.
DO $$
DECLARE r RECORD; metadata JSONB; base_date DATE; previous_date DATE;
BEGIN
  PERFORM pg_advisory_xact_lock(450001);
  FOR r IN SELECT * FROM public.planting_rounds
    WHERE status::TEXT NOT IN ('completed','cancelled') AND seed_date IS NOT NULL FOR UPDATE LOOP
    BEGIN metadata:=r.notes::JSONB; EXCEPTION WHEN OTHERS THEN CONTINUE; END;
    IF metadata->>'harvestDateBasis' IS DISTINCT FROM 'seed_with_transplant_delay' THEN CONTINUE; END IF;
    base_date:=r.seed_date+COALESCE(NULLIF(r.growing_days,0),45);
    previous_date:=base_date+GREATEST(0,COALESCE(r.transplant_date-r.planting_start_date,0));
    UPDATE public.planting_rounds SET
      expected_harvest_date=CASE WHEN expected_harvest_date=previous_date THEN base_date ELSE expected_harvest_date END,
      fulfillment_date=CASE WHEN fulfillment_date=previous_date AND NOT EXISTS (
        SELECT 1 FROM public.orders o WHERE o.round_id=r.id OR EXISTS (
          SELECT 1 FROM public.order_items oi JOIN public.round_items i ON i.id=oi.round_item_id
          WHERE oi.order_id=o.id AND i.round_id=r.id
        )
      ) THEN base_date ELSE fulfillment_date END,
      notes=jsonb_set(metadata,'{harvestDateBasis}','"seed"'::JSONB)::TEXT,
      updated_at=clock_timestamp()
    WHERE id=r.id;
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
