interface TimelineRound {
  status: string;
  current_step?: number | null;
  seed_date?: string | null;
  fertilizing_date?: string | null;
  planting_start_date?: string | null;
  transplant_date?: string | null;
  planted_at?: string | null;
  growing_days?: number | null;
  notes?: string | null;
}

export function getPlotRoundTimeline(
  round: TimelineRound,
  item: { crop_id: string; crops?: { growing_days?: number | null } | { growing_days?: number | null }[] | null },
) {
  let cropDays: number | undefined;
  try {
    cropDays = Number(JSON.parse(round.notes || '{}')?.cropGrowingDays?.[item.crop_id]) || undefined;
  } catch {
    // Older rounds can contain plain-text notes.
  }
  const crop = Array.isArray(item.crops) ? item.crops[0] : item.crops;
  const growingDays = cropDays || Number(crop?.growing_days) || Number(round.growing_days) || 45;
  // Legacy rounds may only have planted_at. Draft rounds use that field as a
  // placeholder, so do not present a harvest estimate until planting is confirmed.
  const transplantDate = round.transplant_date || (
    round.status !== 'draft' || Number(round.current_step) >= 5 ? round.planted_at : null
  );
  let harvestDate: string | null = null;
  if (transplantDate) {
    const date = new Date(`${transplantDate.slice(0, 10)}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) {
      date.setUTCDate(date.getUTCDate() + growingDays);
      harvestDate = date.toISOString().slice(0, 10);
    }
  }
  return {
    status: round.status,
    current_step: round.current_step || 1,
    seed_date: round.seed_date || null,
    fertilizing_date: round.fertilizing_date || null,
    planting_start_date: round.planting_start_date || null,
    transplant_date: transplantDate || null,
    growing_days: growingDays,
    calculated_harvest_date: harvestDate,
  };
}
