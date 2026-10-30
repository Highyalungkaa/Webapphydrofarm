import { getPlotCropIds } from './plotCrops.js';

// Include finished rounds: their plot names and allocations remain historical data.
export function roundReferencesPlot(plot: any, round: any): boolean {
  let metadata: any = {};
  try { metadata = JSON.parse(round.notes || '{}') || {}; } catch { /* plain-text legacy notes */ }
  return (round.round_items || []).some((item: any) => {
    const ids = metadata.cropPlotIds?.[item.crop_id];
    const allocation = metadata.cropPlotAllocations?.[item.crop_id];
    if (Array.isArray(item.plot_ids) && item.plot_ids.includes(plot.id)) return true;
    if (Array.isArray(ids) && ids.includes(plot.id)) return true;
    if (allocation && Object.prototype.hasOwnProperty.call(allocation, plot.id)) return true;
    return !item.plot_ids?.length && !ids?.length && !allocation && getPlotCropIds(plot).includes(item.crop_id);
  });
}
