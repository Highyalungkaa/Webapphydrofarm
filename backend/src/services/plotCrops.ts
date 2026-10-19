export function getPlotCropIds(plot: { crop_ids?: string[] | null; crop_id?: string | null }): string[] {
  return plot.crop_ids ?? (plot.crop_id ? [plot.crop_id] : []);
}
