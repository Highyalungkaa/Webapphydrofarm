import type {Order,PlantingRound} from '../types/index.js';

export interface ReportLoss {
  id:string;round_id:string;round_item_id:string;plot_id?:string|null;plot_name?:string|null;
  loss_date:string;plant_count:number;reason:string;note?:string|null;stage:number;
  plants_per_kg?:number|null;estimated_loss_kg?:number|null;recorded_by_email:string;created_at:string;
  voided_at?:string|null;void_reason?:string|null;
}
export interface ReportClosure {round_id:string;closed_date:string;note?:string|null;recorded_by_email:string;created_at:string}
export interface ReportUnsold {
  id:string;round_id:string;round_item_id:string;crop_name:string;unsold_plant_count:number;
  unsold_actual_kg?:number|null;unsold_estimated_kg?:number|null;other_sales_kg:number;
  disposition?:string|null;note?:string|null;
}
export interface ReportAudit {
  id:string;entity_type:string;entity_id:string;action:string;actor_email?:string|null;
  old_data?:Record<string,any>|null;new_data?:Record<string,any>|null;created_at:string;
}
export interface ReportExportData {
  orders:Order[];rounds:PlantingRound[];plots:{id:string;name:string;zone_name:string}[];
  losses:ReportLoss[];closures:ReportClosure[];unsoldItems:ReportUnsold[];audits:ReportAudit[];loadedAt?:string;
}

export function validateExportPeriod(start:string,end:string){
  for(const value of [start,end])if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value))throw new Error('กรุณาระบุช่วงวันที่ Excel ให้ถูกต้อง');
  if(start&&end&&start>end)throw new Error('วันที่เริ่มสรุปต้องไม่เกินวันที่สิ้นสุด');
}

/** A missing weighing is different from a known zero; never turn unknown delivery into a shortage. */
export function deliveryCompleteness(order:Order){
  if(order.status==='cancelled'||order.status==='no_show')return 'ไม่ได้ส่งมอบ';
  if(order.status!=='completed')return 'ยังไม่ส่งมอบสำเร็จ';
  return (order.order_items||[]).some(item=>item.own_qty_kg==null)?'ยังไม่บันทึกน้ำหนักจริงครบ':'บันทึกน้ำหนักครบ';
}
export function recordedPlantCount(item:{plant_count?:number|null;loss_baseline_plant_count?:number|null}){
  return item.loss_baseline_plant_count??item.plant_count??null;
}
