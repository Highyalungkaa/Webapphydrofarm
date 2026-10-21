import { plantCountToKg } from './plantingQuantities.js';
export const unsoldDispositions = { discard:'ทิ้ง',donate:'บริจาค',consume:'บริโภคเอง',process:'แปรรูป',other:'อื่น ๆ / จัดการหลายวิธี' };
export type UnsoldDisposition = keyof typeof unsoldDispositions;
export interface UnsoldInput { count:string; otherSales:string; disposition:string; note:string }
export function validateUnsoldInput(input:UnsoldInput,item:{remaining_plant_count:number;plants_per_kg:number;available_kg:number}) {
  const count=Number(input.count),other=Number(input.otherSales || 0);
  if(!input.count.trim() || !Number.isInteger(count) || count<0 || count>item.remaining_plant_count) return 'จำนวนต้นขายไม่ออกต้องเป็นจำนวนเต็ม และไม่เกินต้นคงเหลือ';
  if(!Number.isFinite(item.plants_per_kg) || item.plants_per_kg<=0) return 'กรุณากำหนดอัตราต้นต่อกิโลกรัมก่อน';
  if(!Number.isFinite(other) || other<0 || Math.abs(other*100-Math.round(other*100))>0.00001) return 'ปริมาณขายช่องทางอื่นต้องไม่ติดลบ และมีทศนิยมไม่เกิน 2 ตำแหน่ง';
  if(count>0 && !Object.prototype.hasOwnProperty.call(unsoldDispositions,input.disposition)) return 'กรุณาเลือกการจัดการผักที่ขายไม่ออก';
  if(count>0 && input.disposition==='other' && !input.note.trim()) return 'กรุณาระบุรายละเอียดการจัดการผัก';
  if(plantCountToKg(count,item.plants_per_kg)*100+Math.round(other*100)>Math.round(item.available_kg*100)) return 'ผักขายไม่ออกและขายช่องทางอื่นรวมกันเกินผลผลิตคงเหลือ';
  return null;
}
