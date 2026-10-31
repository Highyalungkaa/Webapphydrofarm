import React from 'react';
import type {RoundItem} from '../../types/index.js';
import {remainingEstimatedKg,unbookedEstimatedKg} from '../../lib/estimatedYield.js';
export const EstimatedYield:React.FC<{item:RoundItem;compact?:boolean;bookedKg?:number}>=({item,compact=false,bookedKg})=>{
  const estimatedKg=remainingEstimatedKg(item);
  if(estimatedKg==null)return null;
  if(compact)return <p className="mt-2 inline-flex items-baseline gap-1.5 whitespace-nowrap rounded-lg bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800" aria-label={`ผลผลิตประมาณ ${estimatedKg.toLocaleString()} กิโลกรัม`} title="คำนวณจากต้นคงเหลือหลังหักผักเสีย น้ำหนักชั่งจริงอาจแตกต่างกัน"><span className="text-emerald-700">ผลผลิตประมาณ</span><strong className="font-extrabold tabular-nums">{estimatedKg.toLocaleString()} กก.</strong></p>;
  return <p className="mt-1 text-xs font-semibold text-emerald-800" title="คำนวณจากจำนวนต้นคงเหลือหลังหักผักเสีย เป็นค่าประมาณก่อนเก็บเกี่ยว น้ำหนักชั่งจริงอาจแตกต่างกัน">ผลผลิตประมาณ {estimatedKg.toLocaleString()} กก.{bookedKg==null?<span className="block text-[10px] font-normal text-slate-500">ประมาณการก่อนเก็บเกี่ยว</span>:<><span className="mt-0.5 block text-[11px] font-semibold text-amber-700">จองแล้ว {bookedKg.toLocaleString('th-TH',{maximumFractionDigits:2})} กก.</span><span className="block text-[11px] font-semibold text-yellow-700">ประมาณเหลือ {unbookedEstimatedKg(item,bookedKg)?.toLocaleString('th-TH',{maximumFractionDigits:2})} กก.</span></>}</p>;
};
