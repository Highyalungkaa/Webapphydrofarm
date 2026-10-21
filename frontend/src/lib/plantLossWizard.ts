export const LOSS_WITHOUT_PLOT = '__unassigned__';

export interface LossSelectableItem {
  id: string;
  crop_name: string;
  remaining_plant_count: number;
  plots: { id: string; name: string }[];
}

/** Only plots containing surviving plants from this round can be selected. */
export function getLossPlotChoices(items: LossSelectableItem[]): { id: string; name: string }[] {
  const choices = new Map<string, { id: string; name: string }>();
  for (const item of items) {
    if (item.remaining_plant_count <= 0) continue;
    for (const plot of item.plots) choices.set(plot.id, plot);
    if (!item.plots.length) choices.set(LOSS_WITHOUT_PLOT, { id: LOSS_WITHOUT_PLOT, name: 'ไม่ระบุแปลง (รายการเดิมที่ไม่ได้ผูกแปลง)' });
  }
  return [...choices.values()];
}

export function getLossItemsForPlot<T extends LossSelectableItem>(items: T[], plotId: string): T[] {
  if (!plotId) return [];
  return items.filter(item => item.remaining_plant_count > 0 && (plotId === LOSS_WITHOUT_PLOT
    ? item.plots.length === 0
    : item.plots.some(plot => plot.id === plotId)));
}

export function isValidLossDate(value: string, minDate: string, maxDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    && (!minDate || value >= minDate) && value <= maxDate;
}
