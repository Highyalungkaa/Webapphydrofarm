import {EstimatedYield} from '../common/EstimatedYield.js';
import React from 'react';
import type {PlantingRound,Order} from '../../types/index.js';
const num=(n:number)=>Number(n).toLocaleString('th-TH',{maximumFractionDigits:2});
export const RoundWeightSummary:React.FC<{round:PlantingRound & {orders?:Order[]}}>=({round})=>{
  const active=(round.orders||[]).filter(o=>!['cancelled','no_show'].includes(o.status));
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"><div><h2 className="font-extrabold text-slate-900">ยอดสั่งจองและน้ำหนักชั่งจริง</h2><p className="mt-1 text-xs text-slate-500">น้ำหนักประมาณคำนวณจากจำนวนต้น ส่วนน้ำหนักชั่งจริงบันทึกตอนจัดออเดอร์ รายการเดิมที่ยังไม่มีน้ำหนักชั่งจริงไม่นับในยอดชั่ง</p></div>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs text-slate-500"><tr>{['ชนิดผัก','จำนวนปัจจุบัน (ต้น)','ลูกค้าจอง (กก.)','น้ำหนักที่ชั่งจริง (กก.)','ผักทดแทน (กก.)','ส่งมอบจริง (กก.)'].map(h=><th key={h} className="whitespace-nowrap px-3 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{round.round_items?.map(i=>{
      let ordered=0,own=0,sub=0,delivered=0;for(const o of active)for(const item of o.order_items||[])if(item.round_item_id===i.id){ordered+=Number(item.qty_kg);const s=item.fulfillment_source==='substitute'?Number(item.fulfilled_qty_kg||0):0;const w=Number(item.own_qty_kg||0);own+=w;sub+=s;if(o.status==='completed')delivered+=w+s;}
      const initial=Math.max(0,Number(i.loss_baseline_plant_count??i.plant_count??0));
      const lost=Math.max(0,Number(i.lost_plant_count||0)),remaining=Math.max(0,initial-lost);
      return <tr key={i.id}><td className="px-3 py-4 font-bold">{i.crop_name||i.crops?.name}<EstimatedYield item={i} bookedKg={ordered}/></td><td className="px-3 py-4 tabular-nums"><strong className="block text-emerald-800">{num(remaining)}</strong><span className="mt-1 block whitespace-nowrap text-xs text-rose-600">เสีย {num(lost)} ต้น</span><span className="block whitespace-nowrap text-[11px] text-slate-500">เริ่มต้น {num(initial)} ต้น</span></td>{[ordered,own,sub,delivered].map((value,index)=><td key={index} className="px-3 py-4 tabular-nums">{num(value)}</td>)}</tr>;
    })}</tbody></table></div>
  </section>;
};
