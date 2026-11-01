BEGIN;
-- New rounds and re-confirmed step 4 use seed date + growing days + transplant delay.
-- Existing saved schedules retain the former formula until step 4 is saved again.
CREATE OR REPLACE FUNCTION public.booking_harvest_date(p_round_id UUID,p_crop_id UUID)
RETURNS DATE LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE r RECORD; days INTEGER; metadata JSONB; calculated DATE;
BEGIN
  SELECT * INTO r FROM public.planting_rounds WHERE id=p_round_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  BEGIN metadata:=r.notes::JSONB; EXCEPTION WHEN OTHERS THEN metadata:='{}'::JSONB; END;
  BEGIN days:=NULLIF(metadata->'cropGrowingDays'->>p_crop_id::TEXT,'')::INTEGER; EXCEPTION WHEN OTHERS THEN days:=NULL; END;
  days:=COALESCE(NULLIF(days,0),(SELECT NULLIF(c.growing_days,0) FROM public.crops c WHERE c.id=p_crop_id),NULLIF(r.growing_days,0),45);
  IF metadata->>'harvestDateBasis'='seed_with_transplant_delay' AND r.seed_date IS NOT NULL THEN
    calculated:=r.seed_date+days+GREATEST(0,COALESCE(r.transplant_date-r.planting_start_date,0));
  ELSE
    calculated:=r.transplant_date+days;
  END IF;
  RETURN COALESCE(r.harvest_sale_date,calculated,r.expected_harvest_date,r.fulfillment_date);
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
