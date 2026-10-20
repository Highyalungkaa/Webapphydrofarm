import { addCalendarDays } from './dateFormat.js';

interface RoundStepDates {
  current_step?: number;
  fertilizing_date?: string | null;
  planting_start_date?: string | null;
  transplant_date?: string | null;
  planted_at?: string | null;
}

export function plantingStartDate(round: RoundStepDates): string | null {
  return round.planting_start_date || addCalendarDays(round.fertilizing_date, 7);
}

export function transplantDate(round: RoundStepDates): string | null {
  return round.transplant_date
    || (Number(round.current_step || 1) > 4 ? round.planted_at || null : null)
    || addCalendarDays(round.planting_start_date, 7);
}
