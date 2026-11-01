interface HarvestRound {
  seed_date?: string | null;
  planting_start_date?: string | null;
  transplant_date?: string | null;
  planted_at?: string | null;
  current_step?: number | null;
  status?: string;
  notes?: string | null;
}

export const SEED_HARVEST_BASIS = 'seed_with_transplant_delay';
const DAY_MS = 86400000;
function calendarTime(value?: string | null): number | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  const time = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === day ? time : null;
}

export function usesSeedHarvestDate(round: HarvestRound): boolean {
  try { return JSON.parse(round.notes || '{}')?.harvestDateBasis === SEED_HARVEST_BASIS; }
  catch { return false; }
}

export function transplantDelayDays(round: HarvestRound, actualDate?: string | null): number {
  const start = calendarTime(round.planting_start_date);
  const actual = calendarTime(actualDate === undefined ? round.transplant_date : actualDate);
  return start == null || actual == null ? 0 : Math.max(0, Math.round((actual-start)/DAY_MS));
}

export function calculateHarvestDate(round: HarvestRound, growingDays: number,
  options: {actualDate?: string | null; fromSeed?: boolean} = {}): string | null {
  if (!Number.isSafeInteger(growingDays) || growingDays < 1) return null;
  const confirmedPlanting = round.transplant_date || (
    round.status !== 'draft' || Number(round.current_step) >= 5 ? round.planted_at : null
  );
  const actualDate = options.actualDate === undefined ? confirmedPlanting : options.actualDate;
  const seed = calendarTime(round.seed_date);
  const fromSeed = options.fromSeed ?? usesSeedHarvestDate(round);
  const base = fromSeed && seed != null ? seed : calendarTime(actualDate);
  if (base == null) return null;
  const delay = fromSeed && seed != null ? transplantDelayDays(round, actualDate) : 0;
  return new Date(base+(growingDays+delay)*DAY_MS).toISOString().slice(0,10);
}
