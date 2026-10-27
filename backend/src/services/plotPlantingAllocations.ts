import {allocateRecordedPlotSlots} from './plantAllocation.js';
import { getPlotCropIds } from './plotCrops.js';

interface AllocationPlot {
  id: string; slot_capacity: number; crop_ids?: string[] | null; crop_id?: string | null;
}
interface AllocationItem {
  id?: string; crop_id: string; plant_count?: number | null; estimated_qty_kg: number; bookable_qty_kg: number;
  crops?: { name?: string; slots_per_kg?: number } | { name?: string; slots_per_kg?: number }[] | null;
}
interface AllocationRound {
  id: string; name?: string; status: string; current_step?: number | null;
  completed_date?: string | null; sold_out_date?: string | null; notes?: string | null; round_items?: AllocationItem[];
}

/** Supply plots in zone/name order and rounds oldest first, as in plot management. */
export function getPlotPlantingAllocations(plots: AllocationPlot[], rounds: AllocationRound[]) {
  const used = new Map(plots.map(plot => [plot.id, 0]));
  const allocations: { round_id: string; round_item_id: string | undefined; crop_id: string; plot_id: string; plant_count: number }[] = [];
  const unassignedItems: { round_id: string; round_name: string; crop_name: string }[] = [];
  for (const round of rounds) {
    if (['completed','cancelled'].includes(round.status) || round.completed_date || Number(round.current_step) >= 8
      || (round.sold_out_date && Number(round.current_step) >= 7)) continue;
    let idsByCrop: Record<string, string[]> = {};
    try { idsByCrop = JSON.parse(round.notes || '{}')?.cropPlotIds || {}; } catch { /* legacy plain-text notes */ }
    let snapshot:Record<string,Record<string,number>>|undefined;
    try{snapshot=JSON.parse(round.notes||'{}').cropPlotAllocations;}catch{}
    if(snapshot&&typeof snapshot==='object'){
      const entries=(round.round_items||[]).map(item=>{
        const crop=Array.isArray(item.crops)?item.crops[0]:item.crops;
        const selected=idsByCrop[item.crop_id];
        return{...item,plant_count:item.plant_count??Math.round(Math.max(Number(item.estimated_qty_kg||0),Number(item.bookable_qty_kg||0))*Number(crop?.slots_per_kg||4)),selected_plot_ids:Array.isArray(selected)&&selected.length?selected:plots.filter(p=>getPlotCropIds(p).includes(item.crop_id)).map(p=>p.id)};
      });
      const plan=allocateRecordedPlotSlots(plots,entries,{},Object.fromEntries(used),snapshot);
      entries.forEach((item,index)=>{for(const [plot_id,plant_count]of Object.entries(plan.allocatedByItem[index])){
        used.set(plot_id,(used.get(plot_id)||0)+plant_count);
        allocations.push({round_id:round.id,round_item_id:item.id,crop_id:item.crop_id,plot_id,plant_count});
      }});
      continue;
    }
    for (const item of round.round_items || []) {
      const crop = Array.isArray(item.crops) ? item.crops[0] : item.crops;
      const rate = Number(crop?.slots_per_kg) > 0 ? Number(crop?.slots_per_kg) : 4;
      let needed = item.plant_count ?? Math.max(0, Math.round(Math.max(Number(item.estimated_qty_kg || 0), Number(item.bookable_qty_kg || 0)) * rate));
      const assignedIds = Array.isArray(idsByCrop[item.crop_id]) ? idsByCrop[item.crop_id] : [];
      const candidates = assignedIds.length
        ? plots.filter(plot => assignedIds.includes(plot.id))
        : plots.filter(plot => getPlotCropIds(plot).includes(item.crop_id));
      if (needed > 0 && !candidates.length) unassignedItems.push({ round_id: round.id, round_name: round.name || '', crop_name: crop?.name || 'ไม่ระบุชนิดผัก' });
      for (const plot of candidates) {
        if (needed <= 0) break;
        const allocated = Math.min(needed, Math.max(0, Number(plot.slot_capacity || 0) - (used.get(plot.id) || 0)));
        if (allocated <= 0) continue;
        used.set(plot.id, (used.get(plot.id) || 0) + allocated);
        allocations.push({ round_id: round.id, round_item_id: item.id, crop_id: item.crop_id, plot_id: plot.id, plant_count: allocated });
        needed -= allocated;
      }
    }
  }
  return { allocations, unassignedItems };
}
