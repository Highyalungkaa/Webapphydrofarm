import React from 'react';
import type {RoundItem} from '../../types/index.js';
import {remainingEstimatedKg} from '../../lib/estimatedYield.js';
export const EstimatedYield:React.FC<{item:RoundItem;compact?:boolean}>=({item,compact=false})=>{
  const estimatedKg=remainingEstimatedKg(item);
  if(estimatedKg==null)return null;
  if(compact)return <p className="mt-2 inline-flex items-baseline gap-1.5 whitespace-nowrap rounded-lg bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800" aria-label={`ผลผลิตประมาณ ${estimatedKg.toLocaleString()} กิโลกรัม`} title="คำนวณจากต้นคงเหลือหลังหักผักเสีย น้ำหนักชั่งจริงอาจแตกต่างกัน"><span className="text-emerald-700">ผลผลิตประมาณ</span><strong className="font-extrabold tabular-nums">{estimatedKg.toLocaleString()} กก.</strong></p>;
  return <p className="mt-1 text-xs font-semibold text-emerald-800" title="คำนวณจากจำนวนต้นคงเหลือหลังหักผักเสีย เป็นค่าประมาณก่อนเก็บเกี่ยว น้ำหนักชั่งจริงอาจแตกต่างกัน">ผลผลิตประมาณ {estimatedKg.toLocaleString()} กก.<span className="block text-[10px] font-normal text-slate-500">ประมาณการก่อนเก็บเกี่ยว</span></p>;
};
