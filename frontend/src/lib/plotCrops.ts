import type { Plot } from '../types/index.js';

export function getPlotCropIds(plot: Pick<Plot, 'crop_ids' | 'crop_id'>): string[] {
  return plot.crop_ids ?? (plot.crop_id ? [plot.crop_id] : []);
}

export function plotSupportsCrop(plot: Pick<Plot, 'crop_ids' | 'crop_id'>, cropId: string): boolean {
  return getPlotCropIds(plot).includes(cropId);
}

/** Allocate the shared space once, in the same plot/item order used by the round. */
export function allocatePlotSlots(
  plots: Pick<Plot, 'id' | 'slot_capacity'>[],
  items: { selected_plot_ids?: string[]; bookable_qty_kg?: number; plant_count?: number; crop_id: string }[],
  rates: Record<string, number>,
  occupied: Record<string, number>,
) {
  const used = { ...occupied };
  const beforeItem: Record<string, number>[] = [];
  for (const item of items) {
    beforeItem.push({ ...used });
    let needed = item.plant_count ?? Math.max(0, Math.round(Number(item.bookable_qty_kg || 0) * (rates[item.crop_id] || 4)));
    for (const plot of plots) {
      if (!item.selected_plot_ids?.includes(plot.id)) continue;
      const available = Math.max(0, Number(plot.slot_capacity) - (used[plot.id] || 0));
      const allocated = Math.min(needed, available);
      used[plot.id] = (used[plot.id] || 0) + allocated;
      needed -= allocated;
    }
  }
  return { beforeItem, used };
}
