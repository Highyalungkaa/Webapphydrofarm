import React from 'react';
import type {Order} from '../../types/index.js';
import {itemGrossAmount,itemNetAmount,orderDiscountAmount,orderGrossAmount} from '../../lib/orderReport.js';

const baht=(value:number)=>`฿${value.toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

export const OrderDiscountSummary:React.FC<{order:Order}>=({order})=><div className="space-y-3">
  <dl className="grid grid-cols-1 gap-2 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-xs sm:grid-cols-3">
    <div><dt className="text-slate-500">ยอดก่อนส่วนลด</dt><dd className="mt-1 font-bold text-slate-800">{baht(orderGrossAmount(order))}</dd></div>
    <div><dt className="text-slate-500">ส่วนลดออเดอร์นี้</dt><dd className="mt-1 font-extrabold text-orange-700">{baht(orderDiscountAmount(order))}</dd></div>
    <div><dt className="text-slate-500">ยอดสุทธิหลังส่วนลด</dt><dd className="mt-1 font-extrabold text-emerald-800">{baht(Number(order.total_amount))}</dd></div>
  </dl>
  <details className="rounded-xl border border-slate-200 bg-white text-xs">
    <summary className="cursor-pointer px-3 py-2.5 font-bold text-slate-700">ดูรายการผักและส่วนลดแต่ละรายการ</summary>
    <ul className="divide-y divide-slate-100 border-t border-slate-100 px-3">
      {(order.order_items||[]).map(item=><li key={item.id} className="space-y-1.5 py-3">
        <p className="font-bold text-slate-800">{item.round_items?.crops?.name||'ผัก'} · {Number(item.qty_kg).toLocaleString('th-TH')} กก.</p>
        {item.round_items?.planting_rounds?.name&&<p className="text-[11px] text-slate-500">รอบ {item.round_items.planting_rounds.name}</p>}
        <div className="flex flex-wrap justify-between gap-2 text-slate-600"><span>ก่อนลด {baht(itemGrossAmount(item))}</span><span className="font-semibold text-orange-700">ส่วนลด {baht(Number(item.discount_amount||0))}</span><span className="font-bold text-emerald-800">สุทธิ {baht(itemNetAmount(item))}</span></div>
      </li>)}
    </ul>
  </details>
</div>;
