import React from 'react';
import type {RoundItem} from '../../types/index.js';
export const EstimatedYield:React.FC<{item:RoundItem}>=({item})=>{
  if(!(Number(item.planting_plants_per_kg)>0)||item.estimated_qty_kg==null)return null;
  return <p className="mt-1 text-xs font-semibold text-emerald-800" title="คำนวณจากจำนวนต้นที่ปลูก เป็นค่าประมาณก่อนเก็บเกี่ยว น้ำหนักชั่งจริงอาจแตกต่างกัน">ผลผลิตประมาณ {Number(item.estimated_qty_kg).toLocaleString()} กก.<span className="block text-[10px] font-normal text-slate-500">ประมาณการก่อนเก็บเกี่ยว</span></p>;
};
