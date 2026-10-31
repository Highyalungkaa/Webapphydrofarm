import type { RoundItem } from '../types/index.js';

// Keep the original planting forecast in the database; display the forecast
// for surviving plants using the rate saved when the crop was planted.
export function remainingEstimatedKg(item: Pick<RoundItem, 'plant_count' | 'lost_plant_count' | 'planting_plants_per_kg' | 'estimated_qty_kg'>): number | null {
  const rate = Number(item.planting_plants_per_kg);
  if (!Number.isFinite(rate) || rate <= 0 || item.estimated_qty_kg == null) return null;
  if (item.plant_count == null) return Number(item.estimated_qty_kg);
  const remaining = Math.max(0, Number(item.plant_count) - Math.max(0, Number(item.lost_plant_count || 0)));
  return Math.floor(remaining / rate);
}
export function unbookedEstimatedKg(item:Parameters<typeof remainingEstimatedKg>[0],bookedKg:number):number|null {
  const estimated=remainingEstimatedKg(item);
  return estimated==null?null:Math.max(0,Math.round((estimated-Math.max(0,bookedKg))*100)/100);
}
