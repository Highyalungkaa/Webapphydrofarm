export const unsoldDispositions = { discard:'ทิ้ง',donate:'บริจาค',consume:'บริโภคเอง',process:'แปรรูป',other:'อื่น ๆ / จัดการหลายวิธี' };
export type UnsoldDisposition = keyof typeof unsoldDispositions;
export interface UnsoldInput { count:string; unsoldKg?:string; disposition:string; note:string }
export function validateUnsoldInput(input:UnsoldInput,item:{remaining_plant_count:number;plants_per_kg:number;available_kg:number}) {
  const count=Number(input.count);
  if(!input.count.trim() || !Number.isInteger(count) || count<0 || count>item.remaining_plant_count) return 'จำนวนต้นขายไม่ออกต้องเป็นจำนวนเต็ม และไม่เกินต้นคงเหลือ';
  if(count>0 && !Object.prototype.hasOwnProperty.call(unsoldDispositions,input.disposition)) return 'กรุณาเลือกการจัดการผักที่ขายไม่ออก';
  if(count>0 && input.disposition==='other' && !input.note.trim()) return 'กรุณาระบุรายละเอียดการจัดการผัก';
  const weighed=Number(input.unsoldKg||0);
  if(!Number.isFinite(weighed)||weighed<0||Math.abs(weighed*100-Math.round(weighed*100))>0.00001)return 'น้ำหนักชั่งจริงต้องไม่ติดลบและมีทศนิยมไม่เกินสองตำแหน่ง';
  return null;
}
